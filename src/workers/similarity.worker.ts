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
import { calculateTFIDF, precomputeIDF, clearVectorCache } from './modules/vectorization';

self.onmessage = async (e: MessageEvent) => {
  const { id, payload } = e.data;

  try {
    const updateProgress = (message: string, progress: number = 0) => {
      self.postMessage({
        type: 'progress',
        taskId: id,
        progress,
        message
      });
    };

    updateProgress('Starting similarity analysis...', 0);

    const { source, targets, targetVectors, idfMap, vocabulary, targetListId } = payload;

    if (!source || !targets || !targetVectors || !idfMap) {
      console.error('[Worker] Missing required payload data:', {
        hasSource: !!source,
        hasTargets: !!targets,
        hasTargetVectors: !!targetVectors,
        hasIdfMap: !!idfMap
      });
      throw new Error('Missing required payload data');
    }

    console.log(`[Worker] Processing task ${id} for source URL: ${source.url}`);
    console.log(`[Worker] Number of targets: ${targets.length}`);
    console.log(`[Worker] IDF Map size: ${idfMap.size}`);

    // Use the precomputed IDF from the main thread
    // The IDF should already be computed for the entire corpus
    console.log(`[Worker] Using precomputed IDF with ${idfMap.size} terms`);

    // Calculate source vector using the precomputed target vectors' vocabulary
    updateProgress('Calculating source vector...', 20);
    const sourceVector = await calculateTFIDF(source.doc);

    if (!sourceVector || sourceVector.length === 0) {
      console.error('[Worker] Failed to calculate source vector:', {
        sourceDocLength: source.doc.length,
        vectorLength: sourceVector?.length
      });
      throw new Error('Failed to calculate source vector');
    }

    console.log(`[Worker] Source vector calculated with length: ${sourceVector.length}`);

    // Use the precomputed target vectors from main thread
    updateProgress('Using precomputed target vectors...', 60);
    console.log(`[Worker] Using ${targetVectors.length} precomputed target vectors`);

    // Process candidates with precomputed target vectors
    const candidateIndices = Array.from({ length: targets.length }, (_, i) => i);
    
    updateProgress('Calculating similarities...', 70);
    const results = await processCandidates(
      source,
      sourceVector,
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
      await markSourceUrlProcessed(source.url, targetListId);

      // Log similarity scores for debugging
      console.log('[Worker] Match similarity scores:', 
        validMatches.map(m => ({
          url: m.url,
          similarity: m.similarity
        }))
      );

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
    clearPreprocessingCache();
    clearMemory();
    clearVectorCache(true);
  }
};

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