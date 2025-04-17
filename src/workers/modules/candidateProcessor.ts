import { 
    ProcessedUrl, 
    SimilarityMatch
} from '../../types';
import { 
    batchCosineSimilarity,
    clearVectorCache
} from './vectorization'; 

const CANDIDATE_BATCH_SIZE = 250;
const SIMILARITY_THRESHOLD = 0.05;
const MAX_CONCURRENT_BATCHES = 4;

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

export async function processCandidates(
  source: ProcessedUrl,
  sourceVector: Float64Array,
  candidateIndices: number[],
  candidateTargetsMeta: ProcessedUrl[],
  candidateTargetVectors: Float64Array[]
): Promise<Array<SimilarityMatch | null>> {
  const results: Array<SimilarityMatch | null> = [];

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
    const similarities = batchCosineSimilarity(sourceVector, validTargetVectors);
    
    for (let i = 0; i < candidateIndices.length; i++) {
      const similarity = similarities[i];
      const targetMetaData = candidateTargetsMeta[i];
      
      if (similarity >= SIMILARITY_THRESHOLD) {
        const sourceFullText = `${source.title || ''} ${source.body || ''}`.trim();
        const targetFullText = `${targetMetaData.title || ''} ${targetMetaData.body || ''}`.trim();
        const suggestedAnchor = findSuggestedAnchor(sourceFullText, targetFullText);

        results.push({
          url: targetMetaData.url,
          title: targetMetaData.title,
          similarity: similarity,
          suggestedAnchor: suggestedAnchor,
        });
      }
    }
  } catch (error) {
    console.error(`[Worker][processCandidates] Error during similarity calculation:`, error);
    throw error; // Re-throw to ensure proper error handling up the chain
  }

  console.log(`[Worker][processCandidates] Finished processing candidates. Found ${results.filter(r => r !== null).length} potential matches above threshold.`);
  return results;
}