/**
 * Consolidated TF-IDF Implementation
 * 
 * This module provides a single, consistent implementation of TF-IDF
 * with proper normalization and caching strategies.
 */

// Browser-compatible hash function
async function createHash(algorithm: string) {
  return {
    update: (data: string) => ({
      digest: async (encoding: string) => {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    })
  };
}

// Global caches for consistency across the application
const vectorCache = new Map<string, Float64Array>();
const termIndexCache = new Map<string, number>();
const idfCache = new Map<string, number>();
let globalVocabulary: string[] | null = null;
let corpusHash: string | null = null;

// Configuration constants
const MIN_TERM_FREQUENCY = 1;
const SMOOTHING_FACTOR = 1;
const LOG_BASE = Math.E; // Use natural log for TF-IDF

export interface TFIDFConfig {
  useLogTF?: boolean;
  useSmoothedIDF?: boolean;
  normalizeVectors?: boolean;
  minTermFrequency?: number;
}

const defaultConfig: Required<TFIDFConfig> = {
  useLogTF: true,
  useSmoothedIDF: true,
  normalizeVectors: true,
  minTermFrequency: MIN_TERM_FREQUENCY
};

/**
 * Generate a robust hash for corpus change detection
 */
async function generateCorpusHash(allDocs: string[][]): Promise<string> {
  const docHashes = allDocs
    .map(doc => doc.sort().join('|'))
    .sort()
    .join('||');
  
  const hasher = await createHash('sha256');
  return await hasher.update(docHashes).digest('hex');
}

/**
 * Calculate Term Frequency with proper normalization
 */
export function calculateTF(terms: string[], config: TFIDFConfig = {}): Map<string, number> {
  const { useLogTF, minTermFrequency } = { ...defaultConfig, ...config };
  const tf = new Map<string, number>();
  const docLength = terms.length;
  
  if (docLength === 0) return tf;
  
  // Count raw term frequencies
  const rawCounts = new Map<string, number>();
  terms.forEach(term => {
    rawCounts.set(term, (rawCounts.get(term) || 0) + 1);
  });
  
  // Apply TF calculation with proper normalization
  rawCounts.forEach((count, term) => {
    if (count >= minTermFrequency) {
      if (useLogTF) {
        // Log normalization: 1 + log(count)
        tf.set(term, 1 + Math.log(count) / Math.log(LOG_BASE));
      } else {
        // Raw frequency normalization: count / total_terms
        tf.set(term, count / docLength);
      }
    }
  });
  
  return tf;
}

/**
 * Precompute IDF values for the entire corpus
 */
export async function precomputeIDF(allDocs: string[][], config: TFIDFConfig = {}): Promise<Map<string, number>> {
  if (!Array.isArray(allDocs) || allDocs.length === 0) {
    throw new Error('Invalid input: allDocs must be a non-empty array');
  }
  
  const { useSmoothedIDF } = { ...defaultConfig, ...config };
  const newCorpusHash = await generateCorpusHash(allDocs);
  
  // Return cached values if corpus hasn't changed
  if (corpusHash === newCorpusHash && idfCache.size > 0 && globalVocabulary) {
    console.log(`Using cached IDF values for ${globalVocabulary.length} terms`);
    return idfCache;
  }
  
  console.log(`Computing IDF for ${allDocs.length} documents...`);
  
  // Clear all caches for new corpus
  clearAllCaches();
  corpusHash = newCorpusHash;
  
  const docFrequencies = new Map<string, number>();
  const uniqueTerms = new Set<string>();
  const numDocs = allDocs.length;
  
  // Count document frequencies
  allDocs.forEach((doc, docIndex) => {
    if (!Array.isArray(doc)) {
      throw new Error(`Invalid document format at index ${docIndex}: each document must be an array of terms`);
    }
    
    const seenInDoc = new Set<string>();
    doc.forEach(term => {
      if (typeof term !== 'string' || term.trim() === '') {
        return; // Skip invalid terms
      }
      
      uniqueTerms.add(term);
      if (!seenInDoc.has(term)) {
        docFrequencies.set(term, (docFrequencies.get(term) || 0) + 1);
        seenInDoc.add(term);
      }
    });
  });
  
  // Create sorted vocabulary for consistent indexing
  globalVocabulary = Array.from(uniqueTerms).sort();
  
  // Build term index cache
  termIndexCache.clear();
  globalVocabulary.forEach((term, index) => {
    termIndexCache.set(term, index);
  });
  
  // Calculate IDF values
  idfCache.clear();
  globalVocabulary.forEach(term => {
    const df = docFrequencies.get(term) || 0;
    let idf: number;
    
    if (useSmoothedIDF) {
      // Smoothed IDF: log(N+1 / df+1) + 1
      idf = Math.log((numDocs + SMOOTHING_FACTOR) / (df + SMOOTHING_FACTOR)) / Math.log(LOG_BASE) + SMOOTHING_FACTOR;
    } else {
      // Standard IDF: log(N / df)
      idf = Math.log(numDocs / Math.max(df, 1)) / Math.log(LOG_BASE);
    }
    
    idfCache.set(term, idf);
  });
  
  console.log(`Computed IDF for ${globalVocabulary.length} unique terms`);
  return idfCache;
}

/**
 * Calculate TF-IDF vector for a document
 */
export async function calculateTFIDF(
  doc: string[],
  allDocs?: string[][],
  config: TFIDFConfig = {}
): Promise<Float64Array> {
  if (!Array.isArray(doc)) {
    throw new Error('Invalid input: doc must be an array of terms');
  }
  
  const { normalizeVectors } = { ...defaultConfig, ...config };
  
  // Generate cache key
  const docKey = doc.sort().join('|') + JSON.stringify(config);
  
  // Return cached vector if available
  if (vectorCache.has(docKey)) {
    return vectorCache.get(docKey)!;
  }
  
  // Ensure IDF is computed
  if (idfCache.size === 0 || !globalVocabulary) {
    if (!allDocs) {
      throw new Error('IDF values not available. Must call precomputeIDF first or provide allDocs');
    }
    await precomputeIDF(allDocs, config);
  }
  
  if (!globalVocabulary) {
    throw new Error('Vocabulary not available');
  }
  
  // Create vector
  const vector = new Float64Array(globalVocabulary.length);
  const tf = calculateTF(doc, config);
  
  // Calculate TF-IDF values
  tf.forEach((termFreq, term) => {
    const termIndex = termIndexCache.get(term);
    if (termIndex !== undefined) {
      const idf = idfCache.get(term) || 0;
      vector[termIndex] = termFreq * idf;
    }
  });
  
  // L2 normalize if requested
  if (normalizeVectors) {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
  }
  
  // Cache the result
  vectorCache.set(docKey, vector);
  return vector;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
  if (!vecA || !vecB || !(vecA instanceof Float64Array) || !(vecB instanceof Float64Array)) {
    throw new Error('Invalid input: vectors must be Float64Array instances');
  }
  
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimensions mismatch: ${vecA.length} vs ${vecB.length}`);
  }
  
  if (vecA.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  // Calculate dot product and norms in single pass
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  // Handle edge cases
  if (magnitude === 0) return 0;
  
  const similarity = dotProduct / magnitude;
  return Math.max(-1, Math.min(1, similarity)); // Clamp to [-1, 1]
}

/**
 * Batch cosine similarity calculation
 */
export function batchCosineSimilarity(
  sourceVec: Float64Array,
  targetVecs: Float64Array[]
): number[] {
  if (!sourceVec || !(sourceVec instanceof Float64Array)) {
    throw new Error('Invalid source vector');
  }
  
  if (!Array.isArray(targetVecs)) {
    throw new Error('Invalid target vectors array');
  }
  
  return targetVecs.map(targetVec => cosineSimilarity(sourceVec, targetVec));
}

/**
 * Get current vocabulary and term indices
 */
export function getVocabulary(): { terms: string[]; indices: Map<string, number> } {
  if (!globalVocabulary || termIndexCache.size === 0) {
    throw new Error('Vocabulary not available. Must call precomputeIDF first');
  }
  
  return {
    terms: [...globalVocabulary], // Return copy to prevent mutation
    indices: new Map(termIndexCache) // Return copy to prevent mutation
  };
}

/**
 * Check if corpus has changed
 */
export async function hasCorpusChanged(allDocs: string[][]): Promise<boolean> {
  if (!corpusHash) return true;
  const newHash = await generateCorpusHash(allDocs);
  return newHash !== corpusHash;
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  vectorCache.clear();
  termIndexCache.clear();
  idfCache.clear();
  globalVocabulary = null;
  corpusHash = null;
  console.log('All TF-IDF caches cleared');
}

/**
 * Clear only vector cache (keep IDF and vocabulary)
 */
export function clearVectorCache(): void {
  vectorCache.clear();
  console.log('TF-IDF vector cache cleared');
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  vectorCacheSize: number;
  vocabularySize: number;
  idfCacheSize: number;
  corpusHash: string | null;
} {
  return {
    vectorCacheSize: vectorCache.size,
    vocabularySize: globalVocabulary?.length || 0,
    idfCacheSize: idfCache.size,
    corpusHash
  };
}

/**
 * Validate document quality
 */
export function validateDocument(doc: string[], minWords: number = 3): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  if (!Array.isArray(doc)) {
    issues.push('Document must be an array of terms');
  } else {
    if (doc.length === 0) {
      issues.push('Document is empty');
    } else if (doc.length < minWords) {
      issues.push(`Document has fewer than ${minWords} words`);
    }
    
    const invalidTerms = doc.filter(term => typeof term !== 'string' || term.trim() === '');
    if (invalidTerms.length > 0) {
      issues.push(`Document contains ${invalidTerms.length} invalid terms`);
    }
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}
