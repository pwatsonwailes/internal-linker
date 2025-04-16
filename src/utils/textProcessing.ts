import { stopWords } from './stopwords';
import { detectLanguage } from './languageDetection';
import { TopicModel } from './topicModeling';
import { InvertedIndex } from './invertedIndex';
import { WorkerPool } from './workerPool';

// Initialize worker pool
const workerPool = new WorkerPool(
  navigator.hardwareConcurrency || 4,
  './workers/similarity.worker.ts'
);

// Use TypedArrays for vector operations
function createVector(size: number): Float64Array {
  return new Float64Array(size);
}

// Optimized cosine similarity using TypedArrays
export function cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  const length = vecA.length;
  for (let i = 0; i < length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// Batch processing for multiple similarity calculations
export function batchCosineSimilarity(
  sourceVec: Float64Array,
  targetVecs: Float64Array[]
): number[] {
  return targetVecs.map(targetVec => cosineSimilarity(sourceVec, targetVec));
}

// TF-IDF calculation with caching
const vectorCache = new Map<string, Float64Array>();
const termIndexCache = new Map<string, number>();
let cachedUniqueTerms: string[] | null = null;

export function calculateTF(terms: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  terms.forEach(term => {
    tf.set(term, (tf.get(term) || 0) + 1);
  });
  return tf;
}

export function calculateIDF(docs: string[][], term: string): number {
  const docsWithTerm = docs.filter(doc => doc.includes(term)).length;
  return Math.log(docs.length / (1 + docsWithTerm));
}

export function getTermIndices(allDocs: string[][]): { terms: string[]; indices: Map<string, number> } {
  if (cachedUniqueTerms) {
    return { terms: cachedUniqueTerms, indices: termIndexCache };
  }

  const uniqueTerms = Array.from(new Set(allDocs.flat()));
  uniqueTerms.forEach((term, index) => {
    termIndexCache.set(term, index);
  });
  cachedUniqueTerms = uniqueTerms;

  return { terms: uniqueTerms, indices: termIndexCache };
}

export function calculateTFIDF(doc: string[], allDocs: string[][]): Float64Array {
  const docKey = doc.join('|');
  if (vectorCache.has(docKey)) {
    return vectorCache.get(docKey)!;
  }

  const { terms, indices } = getTermIndices(allDocs);
  const vector = new Float64Array(terms.length);
  
  // Calculate TF-IDF
  const tf = calculateTF(doc);
  terms.forEach((term, i) => {
    const termFreq = tf.get(term) || 0;
    const idf = calculateIDF(allDocs, term);
    vector[i] = termFreq * idf;
  });

  vectorCache.set(docKey, vector);
  return vector;
}

// Cleanup function
export function cleanup(): void {
  vectorCache.clear();
  termIndexCache.clear();
  cachedUniqueTerms = null;
  workerPool.terminate();
}