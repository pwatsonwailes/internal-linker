const MEMORY_CHECK_INTERVAL = 1000; // Check memory every second

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
    isMemoryOK = usedJSHeapSize / jsHeapSizeLimit < 0.8;
  }
  
  return isMemoryOK;
}

export function clearMemory(): void {
  const heapSize = performance?.memory?.usedJSHeapSize;
  const heapLimit = performance?.memory?.jsHeapSizeLimit;
  
  if (heapSize && heapLimit && heapSize / heapLimit > 0.8) {
    globalThis.gc?.(); // Optional GC call if available
  }
}