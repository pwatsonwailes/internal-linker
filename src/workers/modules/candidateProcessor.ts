import { 
    ProcessedUrl, 
    SimilarityMatch
} from '../../types';
import { 
    batchCosineSimilarity,
    clearVectorCache
} from './vectorization';
import { filterStopWordsForTopics } from '../../utils/stopwords'; 

// Lowered threshold to catch more potential matches
const SIMILARITY_THRESHOLD = 0.01;
const MAX_MATCHES = 5;

function findSuggestedAnchor(sourceText: string, targetText: string): string {
  const words = targetText.split(/\s+/).filter(w => w.length > 2);
  const phrases = [];
  
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }

  if (phrases.length === 0) {
    const firstWords = targetText.trim().split(/\s+/).slice(0, 5).join(' ');
    return firstWords.length > 2 ? firstWords : targetText.slice(0, 30);
  }

  return phrases[0];
}

function extractSimpleTopics(doc: string[]): string[] {
  if (!doc || doc.length === 0) return [];
  
  // Filter out stop words and short terms
  const filteredTerms = filterStopWordsForTopics(doc, 3);
  
  // Count term frequencies
  const termFreq = new Map<string, number>();
  filteredTerms.forEach(term => {
    termFreq.set(term, (termFreq.get(term) || 0) + 1);
  });
  
  // Sort by frequency and take top terms
  const sortedTerms = Array.from(termFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5) // Take top 5 terms
    .map(([term]) => term);
  
  return sortedTerms;
}

export async function processCandidates(
  source: ProcessedUrl,
  sourceVector: Float64Array,
  candidateIndices: number[],
  candidateTargetsMeta: ProcessedUrl[],
  candidateTargetVectors: Float64Array[],
  options: {
    maxCandidates?: number;
    earlyTerminationThreshold?: number;
    useSmartFiltering?: boolean;
  } = {}
): Promise<Array<SimilarityMatch | null>> {
  // Validate inputs
  if (!source || !sourceVector || !Array.isArray(candidateIndices) || !Array.isArray(candidateTargetsMeta) || !Array.isArray(candidateTargetVectors)) {
    console.error("[Worker][processCandidates] Invalid input parameters:", {
      hasSource: !!source,
      hasSourceVector: !!sourceVector,
      candidateIndicesLength: candidateIndices?.length,
      metaLength: candidateTargetsMeta?.length,
      vectorsLength: candidateTargetVectors?.length
    });
    return [];
  }

  // Validate vector dimensions
  if (sourceVector.length === 0) {
    console.error("[Worker][processCandidates] Source vector is empty");
    return [];
  }

  // Validate array lengths match
  if (candidateIndices.length !== candidateTargetVectors.length || candidateIndices.length !== candidateTargetsMeta.length) {
    console.error("[Worker][processCandidates] Mismatch between candidate indices, metadata, and vectors count:", {
      indicesLength: candidateIndices.length,
      metaLength: candidateTargetsMeta.length,
      vectorsLength: candidateTargetVectors.length
    });
    return [];
  }

  // Validate target vectors
  const validTargetVectors = candidateTargetVectors.filter(vec => vec && vec.length === sourceVector.length);
  if (validTargetVectors.length !== candidateTargetVectors.length) {
    console.error("[Worker][processCandidates] Some target vectors are invalid or have mismatched dimensions:", {
      expectedLength: sourceVector.length,
      validVectors: validTargetVectors.length,
      totalVectors: candidateTargetVectors.length
    });
    return [];
  }

  console.log(`[Worker][processCandidates] Calculating similarity for ${candidateIndices.length} candidates against source ${source.url}`);

  try {
    // Log some sample vectors for debugging
    console.log('[Worker][processCandidates] Sample vector values:', {
      sourceVector: Array.from(sourceVector.slice(0, 5)),
      targetVector: Array.from(validTargetVectors[0].slice(0, 5))
    });

    const similarities = batchCosineSimilarity(sourceVector, validTargetVectors);
    
    // Store all matches with their similarity scores
    const allMatches: SimilarityMatch[] = [];
    const earlyTerminationThreshold = options.earlyTerminationThreshold || 0.8;
    const maxCandidates = options.maxCandidates || candidateIndices.length;
    
    // Sort similarities in descending order for early termination
    const sortedIndices = Array.from({ length: similarities.length }, (_, i) => i)
      .sort((a, b) => similarities[b] - similarities[a]);
    
    let processedCount = 0;
    let highQualityMatches = 0;
    
    for (const i of sortedIndices) {
      if (processedCount >= maxCandidates) break;
      
      const similarity = similarities[i];
      const targetMetaData = candidateTargetsMeta[i];
      
      // Early termination: if we have enough high-quality matches, stop processing
      if (similarity >= earlyTerminationThreshold) {
        highQualityMatches++;
        if (highQualityMatches >= MAX_MATCHES && similarity < 0.9) {
          console.log(`[Worker][processCandidates] Early termination: found ${highQualityMatches} high-quality matches`);
          break;
        }
      }
      
      // Include all matches above threshold
      if (similarity >= SIMILARITY_THRESHOLD) {
        const sourceFullText = `${source.title || ''} ${source.body || ''}`.trim();
        const targetFullText = `${targetMetaData.title || ''} ${targetMetaData.body || ''}`.trim();
        const suggestedAnchor = findSuggestedAnchor(sourceFullText, targetFullText);

        // Extract simple topics from the target document
        const targetTopics = extractSimpleTopics(targetMetaData.doc || []);
        
        allMatches.push({
          url: targetMetaData.url,
          title: targetMetaData.title,
          similarity: similarity,
          suggestedAnchor: suggestedAnchor,
          topics: targetTopics
        });
      }
      
      processedCount++;
    }

    // Sort matches by similarity score and take top matches
    const topMatches = allMatches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MAX_MATCHES);

    console.log(`[Worker][processCandidates] Found ${allMatches.length} matches above threshold, returning top ${topMatches.length}`);
    
    // Log similarity distribution for debugging
    if (allMatches.length > 0) {
      const similarities = allMatches.map(m => m.similarity);
      console.log('Similarity score distribution:', {
        min: Math.min(...similarities),
        max: Math.max(...similarities),
        avg: similarities.reduce((a, b) => a + b, 0) / similarities.length
      });
    }

    return topMatches;
  } catch (error) {
    console.error(`[Worker][processCandidates] Error during similarity calculation:`, error);
    throw error;
  }
}