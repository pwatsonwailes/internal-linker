/**
 * Optimized vector cache with LRU eviction and memory management
 */
export class VectorCache {
  private cache = new Map<string, Float64Array>();
  private accessOrder = new Map<string, number>();
  private maxSize: number;
  private maxMemoryMB: number;
  private currentMemoryMB = 0;
  private accessCounter = 0;

  constructor(maxSize: number = 1000, maxMemoryMB: number = 100) {
    this.maxSize = maxSize;
    this.maxMemoryMB = maxMemoryMB;
  }

  /**
   * Get a vector from cache
   */
  public get(key: string): Float64Array | undefined {
    const vector = this.cache.get(key);
    if (vector) {
      this.accessOrder.set(key, ++this.accessCounter);
      return vector;
    }
    return undefined;
  }

  /**
   * Store a vector in cache
   */
  public set(key: string, vector: Float64Array): void {
    // Calculate memory usage (Float64Array = 8 bytes per element)
    const memoryMB = (vector.length * 8) / (1024 * 1024);
    
    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      this.remove(key);
    }

    // Check if we need to evict entries
    while (
      (this.cache.size >= this.maxSize || this.currentMemoryMB + memoryMB > this.maxMemoryMB) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(key, vector);
    this.accessOrder.set(key, ++this.accessCounter);
    this.currentMemoryMB += memoryMB;
  }

  /**
   * Remove a specific entry
   */
  private remove(key: string): void {
    const vector = this.cache.get(key);
    if (vector) {
      const memoryMB = (vector.length * 8) / (1024 * 1024);
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.currentMemoryMB -= memoryMB;
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey = '';
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.remove(oldestKey);
    }
  }

  /**
   * Clear all cached vectors
   */
  public clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.currentMemoryMB = 0;
    this.accessCounter = 0;
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    maxSize: number;
    memoryMB: number;
    maxMemoryMB: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryMB: this.currentMemoryMB,
      maxMemoryMB: this.maxMemoryMB
    };
  }

  /**
   * Check if cache has a key
   */
  public has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get cache size
   */
  public size(): number {
    return this.cache.size;
  }
}

// Global vector cache instance
export const vectorCache = new VectorCache(1000, 100);

/**
 * Generate a cache key for a document
 */
export function generateVectorCacheKey(doc: string[], idfMap?: Map<string, number>): string {
  // Create a more robust hash to prevent collisions
  const docContent = doc.join('|');
  const idfContent = idfMap ? Array.from(idfMap.keys()).sort().join('|') : '';
  
  // Use a simple hash function to create a shorter, collision-resistant key
  let hash = 0;
  const content = `${docContent}:${idfContent}`;
  
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `vec:${Math.abs(hash).toString(36)}:${doc.length}:${idfMap?.size || 0}`;
}

/**
 * Precompute and cache vectors for a batch of documents
 */
export async function precomputeVectors(
  documents: string[][],
  calculateTFIDF: (doc: string[]) => Promise<Float64Array>,
  batchSize: number = 50
): Promise<Float64Array[]> {
  const vectors: Float64Array[] = [];
  
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    const batchPromises = batch.map(async (doc) => {
      const cacheKey = generateVectorCacheKey(doc);
      
      // Check cache first
      let vector = vectorCache.get(cacheKey);
      if (!vector) {
        vector = await calculateTFIDF(doc);
        vectorCache.set(cacheKey, vector);
      }
      
      return vector;
    });
    
    const batchVectors = await Promise.all(batchPromises);
    vectors.push(...batchVectors);
  }
  
  return vectors;
}
