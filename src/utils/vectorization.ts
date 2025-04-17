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
  terms.forEach(term => {
    tf.set(term, (tf.get(term) || 0) + 1);
  });
  return tf;
}

function calculateSingleIDF(allDocs: string[][], term: string): number {
  if (cachedIdfValues.has(term)) {
    return cachedIdfValues.get(term)!;
  }
  const docsWithTerm = allDocs.filter(doc => doc.includes(term)).length;
  const idf = Math.log(allDocs.length / (1 + docsWithTerm));
  cachedIdfValues.set(term, idf);
  return idf;
}

export function precomputeIDF(allDocs: string[][]): Map<string, number> {
    console.log(`Precomputing IDF for ${allDocs.length} documents...`);
    const docFrequencies = new Map<string, number>();
    const uniqueTerms = new Set<string>();
    allDocs.forEach(doc => {
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
        const idf = Math.log(numDocs / (1 + df));
        cachedIdfValues.set(term, idf);
    });
    console.log(`Precomputed IDF for ${cachedUniqueTerms.length} unique terms.`);
    cachedAllDocsHash = String(allDocs.length) + '|' + (allDocs[0]?.length || 0);
    return cachedIdfValues;
}

export function getTermIndices(allDocs?: string[][]): { terms: string[]; indices: Map<string, number> } {
  if (cachedUniqueTerms && termIndexCache.size > 0) {
    return { terms: cachedUniqueTerms, indices: termIndexCache };
  } else if (allDocs) {
    console.warn("Term indices not precomputed, calculating on the fly.");
    precomputeIDF(allDocs);
    return { terms: cachedUniqueTerms!, indices: termIndexCache };
  } else {
    throw new Error("Cannot get term indices without precomputation or providing allDocs.");
  }
}

export function calculateTFIDF(
    doc: string[], 
    allDocs?: string[][], 
    precomputedIDF?: Map<string, number> 
): Float64Array {
  const docKey = doc.join('|');
  if (vectorCache.has(docKey)) {
    return vectorCache.get(docKey)!;
  }

  const { terms, indices } = getTermIndices(allDocs);
  const idfValues = precomputedIDF || cachedIdfValues;

  if (idfValues.size === 0 && allDocs) {
    console.warn("IDF values not provided or precomputed, calculating on the fly.");
    precomputeIDF(allDocs);
  } else if (idfValues.size === 0 && !allDocs) {
    throw new Error("IDF values not available. Must call precomputeIDF first or provide allDocs.");
  }

  const vector = new Float64Array(terms.length).fill(0);
  const tf = calculateTF(doc);

  for (const [term, termFreq] of tf.entries()) {
    if (indices.has(term)) {
      const index = indices.get(term)!;
      const idf = idfValues.get(term) || 0;
      vector[index] = termFreq * idf;
    }
  }

  vectorCache.set(docKey, vector);
  return vector;
}

export function cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  const length = Math.min(vecA.length, vecB.length);

  if (length === 0) return 0.0;

  for (let i = 0; i < length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) {
    return 0.0;
  } else {
    return Math.max(-1.0, Math.min(1.0, dotProduct / magnitude));
  }
}

export function batchCosineSimilarity(
  sourceVec: Float64Array,
  targetVecs: Float64Array[]
): number[] {
  return targetVecs.map(targetVec => cosineSimilarity(sourceVec, targetVec));
}

export function checkCorpusChanged(allDocs: string[][]): boolean {
    const currentHash = String(allDocs.length) + '|' + (allDocs[0]?.length || 0);
    return currentHash !== cachedAllDocsHash;
}