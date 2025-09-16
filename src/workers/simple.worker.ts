// Simple test worker to isolate the issue
self.onmessage = async (e: MessageEvent) => {
  const { id, payload } = e.data;
  
  try {
    console.log('[SimpleWorker] Received message:', { id, hasPayload: !!payload });
    
    // Test basic functionality
    const result = {
      sourceUrl: payload?.source?.url || 'unknown',
      matches: [],
      topics: [],
      shouldMarkProcessed: false,
      testResult: 'Worker is working!'
    };
    
    self.postMessage({
      type: 'result',
      taskId: id,
      result
    });
    
    console.log('[SimpleWorker] Task completed successfully');
    
  } catch (error) {
    console.error('[SimpleWorker] Error:', error);
    
    self.postMessage({
      type: 'error',
      taskId: id,
      message: `Simple worker error: ${error.message}`
    });
  }
};

self.onerror = (error: ErrorEvent) => {
  console.error('[SimpleWorker] Global error:', error);
};

console.log('[SimpleWorker] Worker initialized successfully');
