// TF-IDF calculation with caching (GPU removed)
// import { GPU } from 'gpu.js'; // Removed gpu.js import

const vectorCache = new Map<string, Float64Array>();
const termIndexCache = new Map<string, number>();
let cachedUniqueTerms: string[] | null = null;
let cachedIdfValues = new Map<string, number>(); // Cache for IDF values
let cachedAllDocsHash: string | null = null; // To check if allDocs changed

// Removed GPU initialization and kernels

export function clearVectorCache(fullClear: boolean = false): void {
  vectorCache.clear();
  // Only clear term/IDF cache if the underlying documents change significantly
  if (fullClear) {
    termIndexCache.clear();
    cachedUniqueTerms = null;
    cachedIdfValues.clear();
    cachedAllDocsHash = null; // Reset hash tracking
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
  // Normalize TF (optional, but common)
  // for (const [term, count] of tf.entries()) {
  //   tf.set(term, count / docLength);
  // }
  return tf;
}

// Calculates IDF for a single term based on pre-calculated counts or allDocs
// This should ideally be replaced by pre-calculation
function calculateSingleIDF(allDocs: string[][], term: string): number {
   // Check cache first
   if (cachedIdfValues.has(term)) {
     return cachedIdfValues.get(term)!;
   }
   // Inefficient calculation if not cached:
   const docsWithTerm = allDocs.filter(doc => doc.includes(term)).length;
   const idf = Math.log(allDocs.length / (1 + docsWithTerm));
   cachedIdfValues.set(term, idf); // Cache the result
   return idf;
}

// Pre-calculates IDF for all terms in the vocabulary
// This should be called ONCE externally when target docs are set/changed
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

    cachedUniqueTerms = Array.from(uniqueTerms).sort(); // Store sorted terms
    termIndexCache.clear();
    cachedUniqueTerms.forEach((term, index) => {
        termIndexCache.set(term, index);
    });

    cachedIdfValues.clear();
    const numDocs = allDocs.length;
    cachedUniqueTerms.forEach(term => {
        const df = docFrequencies.get(term) || 0;
        const idf = Math.log(numDocs / (1 + df)); // Using 1+df to avoid log(Infinity)
        cachedIdfValues.set(term, idf);
    });
    console.log(`Precomputed IDF for ${cachedUniqueTerms.length} unique terms.`);
    // Simple hash to track if allDocs has changed (optional)
    // This is a basic example; a more robust hash might be needed
    cachedAllDocsHash = String(allDocs.length) + '|' + (allDocs[0]?.length || 0); 
    return cachedIdfValues;
}


// Gets term indices, potentially calculating them if cache is empty
// Assumes precomputeIDF might have been called
export function getTermIndices(allDocs?: string[][]): { terms: string[]; indices: Map<string, number> } {
  if (cachedUniqueTerms && termIndexCache.size > 0) {
    return { terms: cachedUniqueTerms, indices: termIndexCache };
  } else if (allDocs) {
    // Fallback if precomputation didn't happen (less efficient)
    console.warn("Term indices not precomputed, calculating on the fly.");
    precomputeIDF(allDocs); // Compute them now
     return { terms: cachedUniqueTerms!, indices: termIndexCache };
  } else {
      throw new Error("Cannot get term indices without precomputation or providing allDocs.");
  }
}

// Calculates TF-IDF vector using precomputed IDF values if available
export function calculateTFIDF(
    doc: string[], 
    // allDocs is now optional and only used as a fallback for IDF
    allDocs?: string[][], 
    // Allow passing precomputed IDF values
    precomputedIDF?: Map<string, number> 
): Float64Array {
  const docKey = doc.join('|'); // Simple caching key
  if (vectorCache.has(docKey)) {
    return vectorCache.get(docKey)!;
  }

  const { terms, indices } = getTermIndices(allDocs); // Get vocabulary
  const idfValues = precomputedIDF || cachedIdfValues; // Use provided or cached IDF

  if (idfValues.size === 0 && allDocs) {
      // If IDF wasn't passed and isn't cached, compute it now (inefficient fallback)
      console.warn("IDF values not provided or precomputed, calculating on the fly.");
      precomputeIDF(allDocs);
  } else if (idfValues.size === 0 && !allDocs) {
       throw new Error("IDF values not available. Must call precomputeIDF first or provide allDocs.");
  }

  const vector = new Float64Array(terms.length).fill(0);
  const tf = calculateTF(doc); // Calculate Term Frequency for the doc

  for (const [term, termFreq] of tf.entries()) {
    if (indices.has(term)) {
      const index = indices.get(term)!;
      const idf = idfValues.get(term) || 0; // Get precomputed IDF
      vector[index] = termFreq * idf;
    }
  }

  vectorCache.set(docKey, vector);
  return vector;
}

// CPU implementation of Cosine Similarity
export function cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  const length = Math.min(vecA.length, vecB.length); // Use min length defensively

  if (length === 0) return 0.0;

  for (let i = 0; i < length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  // Prevent division by zero
  if (magnitude === 0) {
    return 0.0;
  } else {
    // Clamp result between -1 and 1 due to potential floating point inaccuracies
    return Math.max(-1.0, Math.min(1.0, dotProduct / magnitude));
  }
}

// Batch cosine similarity using the CPU implementation
export function batchCosineSimilarity(
  sourceVec: Float64Array,
  targetVecs: Float64Array[]
): number[] {
  return targetVecs.map(targetVec => cosineSimilarity(sourceVec, targetVec));
}

// Function to check if underlying corpus has changed (needs improvement for robustness)
export function checkCorpusChanged(allDocs: string[][]): boolean {
    const currentHash = String(allDocs.length) + '|' + (allDocs[0]?.length || 0);
    return currentHash !== cachedAllDocsHash;
}