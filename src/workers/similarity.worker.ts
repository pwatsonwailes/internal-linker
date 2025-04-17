import { SimilarityResult } from '../types';
import { MinHash } from '../utils/minHash';
import { BloomFilter } from '../utils/bloomFilter';
import { InvertedIndex } from '../utils/invertedIndex';
import { PrefixIndex } from '../utils/prefixIndex';
import { TopicModel } from '../utils/topicModeling';
import { 
  batchGetSimilarityResults, 
  getTargetUrlListId,
  getProcessedSourceUrls,
  markSourceUrlProcessed,
  getTargetUrlList,
  createTargetUrlList
} from '../lib/supabase';
import { preprocessUrl, clearPreprocessingCache } from './modules/preprocessing';
import { processBatchInParallel } from './modules/parallelProcessor';
import { processCandidates } from './modules/candidateProcessor';
import { checkMemory, clearMemory } from './modules/memoryManager';

// Optimize batch sizes for better memory management
const BATCH_SIZE = 10;
const MIN_HASH_SIGNATURES = 50;
const NUM_TOPICS = 5;
const MAX_CANDIDATES_PER_SOURCE = 100;

// Initialize optimization structures with improved memory management
async function initializeStructures(
  processedTargets: Array<{ doc: string[]; title: string; body: string; id: string }>,
  updateProgress: (message: string, subProgress: number) => void
) {
  const minHash = new MinHash(MIN_HASH_SIGNATURES);
  const bloomFilter = new BloomFilter(5000);
  const invertedIndex = new InvertedIndex();
  const prefixIndex = new PrefixIndex();
  const topicModel = new TopicModel(NUM_TOPICS);

  const totalTargets = processedTargets.length;
  let processed = 0;
  const batchSize = 50;

  for (let i = 0; i < totalTargets; i += batchSize) {
    const batch = processedTargets.slice(i, i + batchSize);
    
    for (const target of batch) {
      if (!checkMemory()) {
        clearMemory();
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const { doc } = target;
      const termSet = new Set(doc);

      minHash.addDocument(processed, termSet);
      bloomFilter.add(doc.join(' '));
      invertedIndex.addDocument(processed, doc);
      prefixIndex.addDocument(processed, doc.join(' '));

      processed++;
      const progress = (processed / totalTargets) * 100;
      updateProgress(
        `Building optimization structures (${processed}/${totalTargets})...`,
        progress
      );
    }

    clearMemory();
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return {
    minHash,
    bloomFilter,
    invertedIndex,
    prefixIndex,
    topicModel
  };
}

self.onmessage = async (e: MessageEvent) => {
  const { id, payload } = e.data;

  try {
    // Initialize progress tracking
    const updateProgress = (message: string, progress: number = 0) => {
      self.postMessage({
        type: 'progress',
        taskId: id,
        progress,
        message
      });
    };

    updateProgress('Starting similarity analysis...', 0);

    // Process candidates
    const { source, targets, targetVectors, idfMap, vocabulary, targetListId } = payload;
    const candidateIndices = Array.from({ length: targets.length }, (_, i) => i);
    
    // Log task details
    console.log(`[Worker] Processing task ${id} for source URL: ${source.url}`);
    console.log(`[Worker] Number of targets: ${targets.length}`);

    const results = await processCandidates(
      source,
      source.vector,
      candidateIndices,
      targets,
      targetVectors
    );

    // Filter and sort results
    const validMatches = results
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    if (validMatches.length > 0) {
      // Mark as processed in database
      await markSourceUrlProcessed(source.url, targetListId);

      // Return results
      self.postMessage({
        type: 'result',
        taskId: id,
        result: {
          sourceUrl: source.url,
          sourceTitle: source.title,
          matches: validMatches,
          topics: [] // Topics will be computed separately if needed
        }
      });

      console.log(`[Worker] Task ${id} completed with ${validMatches.length} matches`);
    } else {
      self.postMessage({
        type: 'result',
        taskId: id,
        result: null
      });
      console.log(`[Worker] Task ${id} completed with no matches`);
    }

  } catch (error) {
    console.error(`[Worker] Error processing task ${id}:`, error);
    
    // Enhanced error reporting
    const errorMessage = error instanceof Error 
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
          cause: error.cause
        }
      : { message: 'Unknown error occurred' };

    self.postMessage({
      type: 'error',
      taskId: id,
      message: JSON.stringify(errorMessage, null, 2)
    });
  } finally {
    // Cleanup
    clearPreprocessingCache();
    clearMemory();
  }
};

// Handle worker errors
self.onerror = (error: ErrorEvent) => {
  console.error('[Worker] Global error:', {
    message: error.message,
    filename: error.filename,
    lineno: error.lineno,
    colno: error.colno,
    error: error.error
  });

  self.postMessage({
    type: 'error',
    message: `Worker error: ${error.message}\nLocation: ${error.filename}:${error.lineno}:${error.colno}\nStack: ${error.error?.stack || 'No stack trace available'}`
  });
};