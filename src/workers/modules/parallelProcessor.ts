import { checkMemory } from './memoryManager';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

export async function processBatchInParallel<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  onProgress: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  let completed = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    // Check memory status
    while (!checkMemory()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(async (item, index) => {
      try {
        const result = await withRetry(() => processor(item));
        completed++;
        onProgress(completed, items.length);
        return result;
      } catch (error) {
        console.error(`Error processing item ${i + index}:`, error);
        throw error;
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results[i + index] = result.value;
      }
    });
    
    // Small delay between batches to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}