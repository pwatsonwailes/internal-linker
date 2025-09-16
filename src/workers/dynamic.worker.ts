// Dynamic worker with error handling and fallbacks
let similarityProcessor: any = null;
let isInitialized = false;

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

    self.postMessage({
      type: 'result',
      taskId: id,
      result: {
        sourceUrl: source.url,
        sourceTitle: source.title,
        matches: validMatches,
        topics: [],
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
