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
const BATCH_SIZE = 10; // Reduced from 25
const MIN_HASH_SIGNATURES = 50; // Reduced from 100
const NUM_TOPICS = 5; // Reduced from 7
const MAX_CANDIDATES_PER_SOURCE = 100; // New limit for candidates

// Initialize optimization structures with improved memory management
async function initializeStructures(
  processedTargets: Array<{ doc: string[]; title: string; body: string; id: string }>,
  updateProgress: (message: string, subProgress: number) => void
) {
  const minHash = new MinHash(MIN_HASH_SIGNATURES);
  const bloomFilter = new BloomFilter(5000); // Reduced size
  const invertedIndex = new InvertedIndex();
  const prefixIndex = new PrefixIndex();
  const topicModel = new TopicModel(NUM_TOPICS);

  const totalTargets = processedTargets.length;
  let processed = 0;
  const batchSize = 50; // Process in smaller batches

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

    // Force cleanup after each batch
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

self.onmessage = async (e: MessageEvent<{ sourceUrls: string[][]; targetUrls: string[][] }>) => {
  const { sourceUrls, targetUrls } = e.data;
  const results: SimilarityResult[] = [];

  try {
    // Step 1: Cache management
    self.postMessage({
      type: 'progress',
      progress: 0,
      currentUrlProgress: 0,
      message: 'Initializing and checking cache...',
    });

    const sortedTargetUrls = targetUrls.map(([url]) => url).sort();
    let targetListId = await getTargetUrlListId(sortedTargetUrls);
    let existingList = await getTargetUrlList(targetListId);

    if (!existingList) {
      targetListId = await createTargetUrlList(sortedTargetUrls);
    }

    const processedStatus = await getProcessedSourceUrls(
      sourceUrls.map(([url]) => url),
      targetListId
    );

    // Handle cached results
    const processedUrls = sourceUrls.filter(([url]) => processedStatus.get(url));
    if (processedUrls.length > 0) {
      const cachedResults = await batchGetSimilarityResults(
        processedUrls.map(([url]) => url)
      );

      processedUrls.forEach(([url, title]) => {
        const matches = cachedResults.get(url);
        if (matches?.length) {
          results.push({ sourceUrl: url, sourceTitle: title, matches });
        }
      });
    }

    // Filter unprocessed URLs
    const urlsToProcess = sourceUrls.filter(([url]) => !processedStatus.get(url));
    if (!urlsToProcess.length) {
      self.postMessage({ type: 'complete', results });
      return;
    }

    // Step 2: Pre-process in smaller batches
    self.postMessage({
      type: 'progress',
      progress: 10,
      currentUrlProgress: 0,
      message: 'Pre-processing URLs...',
    });

    const processedTargets = await processBatchInParallel(
      targetUrls,
      BATCH_SIZE,
      preprocessUrl,
      (completed, total) => {
        self.postMessage({
          type: 'progress',
          progress: 10 + (completed / total) * 30,
          currentUrlProgress: 0,
          message: `Pre-processing target URLs (${completed}/${total})...`,
        });
      }
    );

    const processedSources = await processBatchInParallel(
      urlsToProcess,
      BATCH_SIZE,
      preprocessUrl,
      (completed, total) => {
        self.postMessage({
          type: 'progress',
          progress: 40 + (completed / total) * 20,
          currentUrlProgress: 0,
          message: `Pre-processing source URLs (${completed}/${total})...`,
        });
      }
    );

    // Step 3: Initialize structures with better memory management
    const updateStructureProgress = (message: string, subProgress: number) => {
      self.postMessage({
        type: 'progress',
        progress: 60 + (subProgress * 0.1),
        currentUrlProgress: 0,
        message,
      });
    };

    const structures = await initializeStructures(processedTargets, updateStructureProgress);

    // Step 4: Process similarities with improved batching
    let totalProcessed = 0;
    const sourceBatchSize = 5; // Process sources in very small batches

    for (let i = 0; i < processedSources.length; i += sourceBatchSize) {
      const sourceBatch = processedSources.slice(i, i + sourceBatchSize);
      
      for (const source of sourceBatch) {
        try {
          // Ensure memory is available
          while (!checkMemory()) {
            clearMemory();
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          totalProcessed++;
          const progress = 80 + (totalProcessed / processedSources.length) * 20;
          
          self.postMessage({
            type: 'progress',
            progress,
            currentUrlProgress: 0,
            message: `Processing source URL ${totalProcessed}/${processedSources.length}...`,
          });

          // Get candidates with improved filtering
          const candidates = new Set<number>();
          const minHashCandidates = structures.minHash.findSimilarDocuments(new Set(source.doc));
          const invertedIndexCandidates = structures.invertedIndex.search(source.doc);
          const prefixCandidates = structures.prefixIndex.findCandidates(source.doc.join(' '));

          // Prioritize candidates that appear in multiple indices
          const candidateCounts = new Map<number, number>();
          
          for (const candidate of [...minHashCandidates, ...invertedIndexCandidates, ...prefixCandidates]) {
            candidateCounts.set(candidate, (candidateCounts.get(candidate) || 0) + 1);
          }

          // Select top candidates that appear in multiple indices
          Array.from(candidateCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_CANDIDATES_PER_SOURCE)
            .forEach(([candidate]) => candidates.add(candidate));

          // Process candidates
          const matches = await processCandidates(
            source,
            candidates,
            processedTargets,
            [source.doc, ...processedTargets.map(t => t.doc)]
          );

          if (matches?.length) {
            const validMatches = matches
              .filter((m): m is NonNullable<typeof m> => m !== null)
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 5);

            if (validMatches.length) {
              results.push({
                sourceUrl: source.url,
                sourceTitle: source.title,
                matches: validMatches,
              });

              await markSourceUrlProcessed(source.url, targetListId);
            }
          }

          // Cleanup after each source
          clearPreprocessingCache();
          structures.topicModel.clearCache();
          clearMemory();

        } catch (error) {
          console.error('Error processing source:', source.url, error);
          self.postMessage({
            type: 'progress',
            progress: 80 + (totalProcessed / processedSources.length) * 20,
            currentUrlProgress: 0,
            message: `Error processing source URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        // Small delay between sources
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Cleanup after each batch
      clearMemory();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    self.postMessage({
      type: 'complete',
      results: results.filter(r => r.matches.length > 0),
    });

  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({
      type: 'progress',
      progress: 0,
      currentUrlProgress: 0,
      message: `Error: ${error instanceof Error ? error.message : 'Processing failed'}`,
    });
  }
};