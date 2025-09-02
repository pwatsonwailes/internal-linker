const vectorCache = new Map<string, Float64Array>();
const termIndexCache = new Map<string, number>();
let cachedUniqueTerms: string[] | null = null;
let cachedIdfValues = new Map<string, number>();
let cachedAllDocsHash: string | null = null;

export function clearVectorCache(fullClear: boolean = false): void {
  vectorCache.clear();
  if (fullClear) {
    termIndexCache.clear();
    cachedUniqueTerms = null;
    cachedIdfValues.clear();
    cachedAllDocsHash = null;
    console.log("Performing full vector cache clear.");
  } else {
    console.log("Clearing only TF-IDF vector cache.");
  }
}

export function calculateTF(terms: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const docLength = terms.length;
  if (docLength === 0) return tf;
  
  // Count term frequencies
  terms.forEach(term => {
    tf.set(term, (tf.get(term) || 0) + 1);
  });

  // Normalize term frequencies by document length
  tf.forEach((value, key) => {
    tf.set(key, value / docLength);
  });

  return tf;
}

export function precomputeIDF(allDocs: string[][]): Map<string, number> {
  if (!Array.isArray(allDocs) || allDocs.length === 0) {
    throw new Error('Invalid input: allDocs must be a non-empty array');
  }

  console.log(`Precomputing IDF for ${allDocs.length} documents...`);
  const docFrequencies = new Map<string, number>();
  const uniqueTerms = new Set<string>();
  
  allDocs.forEach(doc => {
    if (!Array.isArray(doc)) {
      throw new Error('Invalid document format: each document must be an array of terms');
    }
    const seenInDoc = new Set<string>();
    doc.forEach(term => {
      uniqueTerms.add(term);
      if (!seenInDoc.has(term)) {
        docFrequencies.set(term, (docFrequencies.get(term) || 0) + 1);
        seenInDoc.add(term);
      }
    });
  });

  cachedUniqueTerms = Array.from(uniqueTerms).sort();
  termIndexCache.clear();
  cachedUniqueTerms.forEach((term, index) => {
    termIndexCache.set(term, index);
  });

  cachedIdfValues.clear();
  const numDocs = allDocs.length;
  cachedUniqueTerms.forEach(term => {
    const df = docFrequencies.get(term) || 0;
    const idf = Math.log((numDocs + 1) / (df + 1)) + 1; // Smoothed IDF
    cachedIdfValues.set(term, idf);
  });
  
  console.log(`Precomputed IDF for ${cachedUniqueTerms.length} unique terms.`);
  cachedAllDocsHash = String(allDocs.length) + '|' + (allDocs[0]?.length || 0);
  return cachedIdfValues;
}

export function getTermIndices(): { terms: string[]; indices: Map<string, number> } {
  if (!cachedUniqueTerms || termIndexCache.size === 0) {
    throw new Error("Term indices not available. Must call precomputeIDF first.");
  }
  return { terms: cachedUniqueTerms, indices: termIndexCache };
}

export function calculateTFIDF(
  doc: string[],
  allDocs?: string[][],
  precomputedIDF?: Map<string, number>
): Float64Array {
  if (!Array.isArray(doc)) {
    throw new Error('Invalid input: doc must be an array of terms');
  }

  const docKey = doc.join('|');
  if (vectorCache.has(docKey)) {
    return vectorCache.get(docKey)!;
  }

  let idfValues = precomputedIDF;
  let terms: string[];
  let indices: Map<string, number>;

  try {
    ({ terms, indices } = getTermIndices());
  } catch (error) {
    if (!allDocs) {
      throw new Error("Either precomputed IDF or allDocs must be provided");
    }
    idfValues = precomputeIDF(allDocs);
    ({ terms, indices } = getTermIndices());
  }

  const vector = new Float64Array(terms.length).fill(0);
  const tf = calculateTF(doc);

  for (const [term, termFreq] of tf.entries()) {
    if (indices.has(term)) {
      const index = indices.get(term)!;
      const idf = idfValues?.get(term) || 0;
      vector[index] = termFreq * idf;
    }
  }

  // L2 normalize the vector
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

  vectorCache.set(docKey, vector);
  return vector;
}

export function cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
  if (!vecA || !vecB || !(vecA instanceof Float64Array) || !(vecB instanceof Float64Array)) {
    throw new Error('Invalid input: vectors must be Float64Array instances');
  }

  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimensions mismatch: ${vecA.length} vs ${vecB.length}`);
  }

  let dotProduct = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }

  // Since vectors are already normalized, cosine similarity is just the dot product
  return Math.max(-1.0, Math.min(1.0, dotProduct));
}

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

export function checkCorpusChanged(allDocs: string[][]): boolean {
  const currentHash = String(allDocs.length) + '|' + (allDocs[0]?.length || 0);
  return currentHash !== cachedAllDocsHash;
}