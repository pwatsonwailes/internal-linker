import { 
    ProcessedUrl, 
    SimilarityMatch // Ensure this type is defined correctly
} from '../../types'; // Adjust path as needed
import { 
    batchCosineSimilarity, 
    // calculateTFIDF is no longer needed here for targets
    clearVectorCache // Keep if clearing source vector cache is desired
} from './vectorization'; 
// Removed checkMemory as memory pressure should be lower

const CANDIDATE_BATCH_SIZE = 250;
const SIMILARITY_THRESHOLD = 0.05;
const MAX_CONCURRENT_BATCHES = 4;

function findSuggestedAnchor(sourceText: string, targetText: string): string {
  const words = targetText.split(/\\s+/).filter(w => w.length > 2);
  const phrases = [];
  
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }

  if (phrases.length === 0) {
    // Slightly improved fallback: Use first few words or start of text
    const firstWords = targetText.trim().split(/\s+/).slice(0, 5).join(' ');
    return firstWords.length > 2 ? firstWords : targetText.slice(0, 30);
  }

  // Simple fallback: return the first phrase
  return phrases[0];
}

async function processBatch(
  batch: number[],
  source: { doc: string[]; title: string; body: string; id: string },
  processedTargets: Array<{ doc: string[]; title: string; body: string; id: string }>,
  allDocs: string[][],
  sourceVector: Float64Array
): Promise<Array<{ url: string; title: string; similarity: number; suggestedAnchor: string } | null>> {
  const targetVectors = batch.map(candidateIndex => 
    calculateTFIDF(processedTargets[candidateIndex].doc, allDocs)
  );
  
  // Batch process similarities using GPU
  const similarities = batchCosineSimilarity(sourceVector, targetVectors);
  
  return Promise.all(
    batch.map(async (candidateIndex, batchIndex) => {
      const similarity = similarities[batchIndex];
      const target = processedTargets[candidateIndex];

      if (similarity > SIMILARITY_THRESHOLD) {
        const suggestedAnchor = findSuggestedAnchor(
          `${source.title} ${source.body}`,
          `${target.title} ${target.body}`
        );

        return {
          url: target.url,
          title: target.title,
          similarity,
          suggestedAnchor,
        };
      }
      return null;
    })
  );
}

export async function processCandidates(
  source: ProcessedUrl,
  sourceVector: Float64Array,
  candidateIndices: number[],
  candidateTargetsMeta: ProcessedUrl[],
  candidateTargetVectors: Float64Array[]
): Promise<Array<SimilarityMatch | null>> {
  const results: Array<SimilarityMatch | null> = [];
  if (candidateIndices.length !== candidateTargetVectors.length || candidateIndices.length !== candidateTargetsMeta.length) {
    console.error("[Worker][processCandidates] Mismatch between candidate indices, metadata, and vectors count.");
    return []; // Return empty array on mismatch
  }

  console.log(`[Worker][processCandidates] Calculating similarity for ${candidateIndices.length} candidates against source ${source.url}`);

  try {
    // --- Batch Cosine Similarity ---
    // Calculate similarities between the single source vector and all candidate target vectors
    // Use the batchCosineSimilarity which now uses the CPU implementation
    const similarities = batchCosineSimilarity(sourceVector, candidateTargetVectors);
    
    // --- Process Results ---
    for (let i = 0; i < candidateIndices.length; i++) {
      const similarity = similarities[i];
      const targetMetaData = candidateTargetsMeta[i]; // Get metadata for this candidate
      
      if (similarity >= SIMILARITY_THRESHOLD) { // Use >= for threshold inclusivity
        // Combine source/target text for anchor finding
        const sourceFullText = `${source.title || ''} ${source.body || ''}`.trim();
        const targetFullText = `${targetMetaData.title || ''} ${targetMetaData.body || ''}`.trim();
        const suggestedAnchor = findSuggestedAnchor(sourceFullText, targetFullText);

        // Store result (without calling Supabase)
        results.push({
          url: targetMetaData.url, // URL from candidate metadata
          title: targetMetaData.title, // Title from candidate metadata
          similarity: similarity,
          suggestedAnchor: suggestedAnchor,
        });
      } else {
        // Optionally push null or skip if below threshold
        // results.push(null); 
      }
    }
  } catch (error) {
    console.error(`[Worker][processCandidates] Error during similarity calculation:`, error);
    // Don't clear cache on error necessarily
  } finally {
    // Decide if clearing vector cache is needed here. 
    // It might prematurely remove the source vector if the worker instance is reused.
    // clearVectorCache(); 
  }

  console.log(`[Worker][processCandidates] Finished processing candidates. Found ${results.filter(r => r !== null).length} potential matches above threshold.`);
  return results;
}
  source: { doc: string[]; title: string; body: string; id: string },
  candidates: Set<number>,
  processedTargets: Array<{ doc: string[]; title: string; body: string; id: string }>,
  allDocs: string[][]
): Promise<Array<{ url: string; title: string; similarity: number; suggestedAnchor: string } | null>> {
  const results: Array<{ url: string; title: string; similarity: number; suggestedAnchor: string } | null> = [];
  const candidateArray = Array.from(candidates);
  
  try {
    // Pre-calculate source vector once
    const sourceVector = calculateTFIDF(source.doc, allDocs);
    
    // Process batches in parallel with a limit
    for (let i = 0; i < candidateArray.length; i += CANDIDATE_BATCH_SIZE * MAX_CONCURRENT_BATCHES) {
      const batchPromises = [];
      
      for (let j = 0; j < MAX_CONCURRENT_BATCHES; j++) {
        const start = i + j * CANDIDATE_BATCH_SIZE;
        const batch = candidateArray.slice(start, start + CANDIDATE_BATCH_SIZE);
        
        if (batch.length > 0) {
          // Check memory status
          while (!checkMemory()) {
            await new Promise(resolve => setTimeout(resolve, 100));
            clearVectorCache();
          }
          
          batchPromises.push(processBatch(batch, source, processedTargets, allDocs, sourceVector));
        }
      }
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
      
      // Small delay between major batch groups
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally {
    clearVectorCache();
  }
  
  return results;
}