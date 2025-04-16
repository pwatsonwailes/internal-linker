import { gpuManager } from './gpuManager';

const vectorCache = new Map<string, Float64Array>();
const termIndexCache = new Map<string, number>();
let cachedUniqueTerms: string[] | null = null;

// Fallback CPU implementations
function cpuDotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function cpuVectorNorm(vec: number[]): number {
  return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
}

// Initialize kernels
let vectorDotProductKernel: any = null;
let vectorNormKernel: any = null;
let tfidfKernel: any = null;
let batchSimilarityKernel: any = null;

try {
  if (gpuManager.isAvailable()) {
    vectorDotProductKernel = gpuManager.createKernel(function(a: number[], b: number[]) {
      let sum = 0;
      for (let i = 0; i < this.constants.vectorLength; i++) {
        sum += a[i] * b[i];
      }
      return sum;
    })
    .setConstants({ vectorLength: 1024 })
    .setOutput([1]);

    vectorNormKernel = gpuManager.createKernel(function(vec: number[]) {
      let sum = 0;
      for (let i = 0; i < this.constants.vectorLength; i++) {
        sum += vec[i] * vec[i];
      }
      return Math.sqrt(sum);
    })
    .setConstants({ vectorLength: 1024 })
    .setOutput([1]);

    tfidfKernel = gpuManager.createKernel(function(
      tf: number[],
      idf: number[],
      length: number
    ) {
      const i = this.thread.x;
      if (i < length) {
        return tf[i] * idf[i];
      }
      return 0;
    })
    .setOutput([1024]);

    batchSimilarityKernel = gpuManager.createKernel(function(
      source: number[],
      targets: number[][],
      vectorLength: number,
      numTargets: number
    ) {
      const targetIndex = this.thread.x;
      if (targetIndex < numTargets) {
        let dotProduct = 0;
        let normSource = 0;
        let normTarget = 0;
        
        for (let i = 0; i < vectorLength; i++) {
          dotProduct += source[i] * targets[targetIndex][i];
          normSource += source[i] * source[i];
          normTarget += targets[targetIndex][i] * targets[targetIndex][i];
        }
        
        const magnitude = Math.sqrt(normSource) * Math.sqrt(normTarget);
        return magnitude === 0 ? 0 : dotProduct / magnitude;
      }
      return 0;
    })
    .setOutput([1000]); // Adjust based on batch size
  }
} catch (error) {
  console.warn('Failed to initialize GPU kernels:', error);
}

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
  const tfArray = new Float64Array(terms.length);
  const idfArray = new Float64Array(terms.length);
  
  const tf = calculateTF(doc);
  terms.forEach((term, i) => {
    tfArray[i] = tf.get(term) || 0;
    idfArray[i] = calculateIDF(allDocs, term);
  });

  let result: Float64Array;

  try {
    if (tfidfKernel) {
      const gpuResult = tfidfKernel(Array.from(tfArray), Array.from(idfArray), terms.length) as number[];
      result = new Float64Array(gpuResult);
    } else {
      result = new Float64Array(terms.length);
      for (let i = 0; i < terms.length; i++) {
        result[i] = tfArray[i] * idfArray[i];
      }
    }
  } catch (error) {
    console.warn('GPU computation failed, falling back to CPU:', error);
    result = new Float64Array(terms.length);
    for (let i = 0; i < terms.length; i++) {
      result[i] = tfArray[i] * idfArray[i];
    }
  }

  vectorCache.set(docKey, result);
  return result;
}

export function cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
  const a = Array.from(vecA);
  const b = Array.from(vecB);
  
  let dotProduct: number;
  let normA: number;
  let normB: number;

  try {
    if (vectorDotProductKernel && vectorNormKernel) {
      dotProduct = vectorDotProductKernel(a, b)[0] as number;
      normA = vectorNormKernel(a)[0] as number;
      normB = vectorNormKernel(b)[0] as number;
    } else {
      dotProduct = cpuDotProduct(a, b);
      normA = cpuVectorNorm(a);
      normB = cpuVectorNorm(b);
    }
  } catch (error) {
    console.warn('GPU computation failed, falling back to CPU:', error);
    dotProduct = cpuDotProduct(a, b);
    normA = cpuVectorNorm(a);
    normB = cpuVectorNorm(b);
  }
  
  const magnitude = normA * normB;
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

export function batchCosineSimilarity(sourceVec: Float64Array, targetVecs: Float64Array[]): number[] {
  const source = Array.from(sourceVec);
  const targets = targetVecs.map(vec => Array.from(vec));

  try {
    if (batchSimilarityKernel) {
      return batchSimilarityKernel(
        source,
        targets,
        sourceVec.length,
        targetVecs.length
      ) as number[];
    }
  } catch (error) {
    console.warn('GPU batch similarity failed, falling back to CPU:', error);
  }

  // CPU fallback
  return targetVecs.map(targetVec => cosineSimilarity(sourceVec, targetVec));
}

export function clearVectorCache(): void {
  vectorCache.clear();
  termIndexCache.clear();
  cachedUniqueTerms = null;
}