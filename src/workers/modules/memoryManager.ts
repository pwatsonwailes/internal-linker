import { clearAllCaches } from '../../utils/tfidf';

const MEMORY_CHECK_INTERVAL = 5000; // Check memory every 5 seconds
const MEMORY_CRITICAL_THRESHOLD = 0.85; // Critical at 85% memory usage

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
    const usageRatio = usedJSHeapSize / jsHeapSizeLimit;
    isMemoryOK = usageRatio < MEMORY_CRITICAL_THRESHOLD;
    
    if (!isMemoryOK) {
      console.warn(`[Worker MemoryManager] High memory usage: ${Math.round(usageRatio * 100)}%`);
      performCleanup();
    }
  }
  
  return isMemoryOK;
}

export function clearMemory(): void {
  const heapSize = performance?.memory?.usedJSHeapSize;
  if (heapSize) {
    console.log(`[Worker MemoryManager] Heap size: ${Math.round(heapSize / 1024 / 1024)}MB`);
  }
  
  performCleanup();
}

function performCleanup(): void {
  // Clear TF-IDF caches
  clearAllCaches();
  
  // Force garbage collection if available
  if ('gc' in globalThis && typeof (globalThis as any).gc === 'function') {
    try {
      (globalThis as any).gc();
      console.log('[Worker MemoryManager] Forced garbage collection');
    } catch (error) {
      console.warn('[Worker MemoryManager] Failed to force GC:', error);
    }
  }
  
  // Fallback GC encouragement
  const temp = new Array(100).fill(null);
  temp.length = 0;
}