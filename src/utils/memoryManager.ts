const MEMORY_CHECK_INTERVAL = 500; // Reduced from 1000ms
const MEMORY_THRESHOLD = 0.7; // Reduced from 0.8
let lastMemoryCheck = Date.now();
let isMemoryOK = true;

export function checkMemory(): boolean {
  const now = Date.now();
  if (now - lastMemoryCheck < MEMORY_CHECK_INTERVAL) {
    return isMemoryOK;
  }

  lastMemoryCheck = now;
  
  if (globalThis.performance?.memory) {
    const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
    isMemoryOK = usedJSHeapSize / jsHeapSizeLimit < MEMORY_THRESHOLD;
  }
  
  return isMemoryOK;
}

export async function clearMemory(): Promise<void> {
  const heapSize = performance?.memory?.usedJSHeapSize;
  const heapLimit = performance?.memory?.jsHeapSizeLimit;
  
  if (heapSize && heapLimit && heapSize / heapLimit > MEMORY_THRESHOLD) {
    // Force garbage collection if available
    globalThis.gc?.();
    
    // Clear module-level caches
    await clearModuleCaches();
  }
}

async function clearModuleCaches(): Promise<void> {
  // Clear any module-level caches that might be holding references
  try {
    // Add cache clearing for specific modules using dynamic imports
    const modulePromises = [
      import('../utils/bloomFilter'),
      import('../utils/invertedIndex'),
      import('../utils/minHash'),
      import('../utils/prefixIndex'),
      import('../utils/topicModeling'),
      import('../workers/modules/preprocessing')
    ];

    const modules = await Promise.all(modulePromises);

    modules.forEach(module => {
      if (typeof module.clearCache === 'function') {
        module.clearCache();
      }
    });
  } catch (error) {
    console.warn('Error clearing module caches:', error);
  }
}