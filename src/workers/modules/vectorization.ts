// Import consolidated TF-IDF implementation
import * as TFIDF from '../../utils/tfidf';

export function clearVectorCache(fullClear: boolean = false): void {
  if (fullClear) {
    TFIDF.clearAllCaches();
    console.log("Performing full vector cache clear.");
  } else {
    TFIDF.clearVectorCache();
    console.log("Clearing only TF-IDF vector cache.");
  }
}

export function calculateTF(terms: string[]): Map<string, number> {
  return TFIDF.calculateTF(terms);
}

export async function precomputeIDF(allDocs: string[][]): Promise<Map<string, number>> {
  return await TFIDF.precomputeIDF(allDocs);
}

export function getTermIndices(): { terms: string[]; indices: Map<string, number> } {
  return TFIDF.getVocabulary();
}

export async function calculateTFIDF(
  doc: string[],
  allDocs?: string[][],
  precomputedIDF?: Map<string, number>
): Promise<Float64Array> {
  return await TFIDF.calculateTFIDF(doc, allDocs);
}

export function cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
  return TFIDF.cosineSimilarity(vecA, vecB);
}

export function batchCosineSimilarity(
  sourceVec: Float64Array,
  targetVecs: Float64Array[]
): number[] {
  return TFIDF.batchCosineSimilarity(sourceVec, targetVecs);
}

export async function checkCorpusChanged(allDocs: string[][]): Promise<boolean> {
  return await TFIDF.hasCorpusChanged(allDocs);
}