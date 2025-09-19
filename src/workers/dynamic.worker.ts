// Dynamic worker with error handling and fallbacks
import { filterStopWordsForTopics } from '../utils/stopwords';

let similarityProcessor: any = null;
let isInitialized = false;

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

async function initializeWorker() {
  if (isInitialized) return;
  
  try {
    console.log('[DynamicWorker] Initializing...');
    
    // Try to dynamically import the similarity processing modules
    const [
      { preprocessUrl },
      { processCandidates },
      { calculateTFIDF }
    ] = await Promise.all([
      import('./modules/preprocessing'),
      import('./modules/candidateProcessor'),
      import('./modules/vectorization')
    ]);
    
    similarityProcessor = {
      preprocessUrl,
      processCandidates,
      calculateTFIDF
    };
    
    isInitialized = true;
    console.log('[DynamicWorker] Successfully initialized with dynamic imports');
    
  } catch (error) {
    console.error('[DynamicWorker] Failed to initialize:', error);
    throw new Error(`Worker initialization failed: ${error.message}`);
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, payload } = e.data;

  try {
    console.log(`[DynamicWorker] Processing task ${id}`);
    
    // Handle test task first (before initialization)
    if (payload?.test) {
      self.postMessage({
        type: 'result',
        taskId: id,
        result: { testResult: 'Worker is working!' }
      });
      return;
    }
    
    // Initialize if not already done
    if (!isInitialized) {
      await initializeWorker();
    }
    
    const { source, targets, targetVectors, idfMap, vocabulary, targetListId } = payload;

    if (!source || !targets || !targetVectors || !idfMap) {
      throw new Error('Missing required payload data');
    }

    console.log(`[DynamicWorker] Processing source URL: ${source.url}`);
    console.log(`[DynamicWorker] Number of targets: ${targets.length}`);

    // Calculate source vector
    const sourceVector = await similarityProcessor.calculateTFIDF(source.doc);

    if (!sourceVector || sourceVector.length === 0) {
      throw new Error('Failed to calculate source vector');
    }

    console.log(`[DynamicWorker] Source vector calculated with length: ${sourceVector.length}`);

    // Process candidates
    const candidateIndices = Array.from({ length: targets.length }, (_, i) => i);
    
    const results = await similarityProcessor.processCandidates(
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

    console.log(`[DynamicWorker] Found ${validMatches.length} valid matches`);

    // Extract topics from source document
    const sourceTopics = extractSimpleTopics(source.doc || []);
    
    self.postMessage({
      type: 'result',
      taskId: id,
      result: {
        sourceUrl: source.url,
        sourceTitle: source.title,
        matches: validMatches,
        topics: sourceTopics,
        shouldMarkProcessed: validMatches.length > 0
      }
    });

    console.log(`[DynamicWorker] Task ${id} completed successfully`);

  } catch (error) {
    console.error(`[DynamicWorker] Error processing task ${id}:`, error);
    
    const errorMessage = error instanceof Error 
      ? error.message
      : 'Unknown error occurred';

    self.postMessage({
      type: 'error',
      taskId: id,
      message: `Dynamic worker error: ${errorMessage}`
    });
  }
};

self.onerror = (error: ErrorEvent) => {
  console.error('[DynamicWorker] Global error:', error);
};

console.log('[DynamicWorker] Worker script loaded');
