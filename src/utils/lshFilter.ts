import { MinHash } from './minHash';

export interface LSHFilterConfig {
  numHashes: number;
  bands: number;
  similarityThreshold: number;
}

export class LSHFilter {
  private minHash: MinHash;
  private documentTerms: Map<number, Set<string>> = new Map();
  private config: LSHFilterConfig;

  constructor(config: LSHFilterConfig = {
    numHashes: 128,
    bands: 16,
    similarityThreshold: 0.1
  }) {
    this.config = config;
    this.minHash = new MinHash(config.numHashes, config.bands);
  }

  /**
   * Add a document to the LSH index
   */
  public addDocument(docId: number, terms: string[]): void {
    const termSet = new Set(terms);
    this.documentTerms.set(docId, termSet);
    this.minHash.addDocument(docId, termSet);
  }

  /**
   * Find candidate documents that might be similar to the query
   * This significantly reduces the number of documents that need full similarity calculation
   */
  public findCandidates(queryTerms: string[]): number[] {
    const queryTermSet = new Set(queryTerms);
    const candidates = this.minHash.findSimilarDocuments(queryTermSet);
    return Array.from(candidates);
  }

  /**
   * Get the terms for a specific document
   */
  public getDocumentTerms(docId: number): Set<string> | undefined {
    return this.documentTerms.get(docId);
  }

  /**
   * Clear all documents from the index
   */
  public clear(): void {
    this.minHash.clear();
    this.documentTerms.clear();
  }

  /**
   * Get statistics about the LSH index
   */
  public getStats(): {
    numDocuments: number;
    numHashes: number;
    bands: number;
    avgTermsPerDoc: number;
  } {
    const numDocs = this.documentTerms.size;
    const totalTerms = Array.from(this.documentTerms.values())
      .reduce((sum, terms) => sum + terms.size, 0);
    
    return {
      numDocuments: numDocs,
      numHashes: this.config.numHashes,
      bands: this.config.bands,
      avgTermsPerDoc: numDocs > 0 ? totalTerms / numDocs : 0
    };
  }
}

/**
 * Create an LSH filter optimized for similarity search
 */
export function createLSHFilter(
  documents: Array<{ id: number; terms: string[] }>,
  config?: Partial<LSHFilterConfig>
): LSHFilter {
  const defaultConfig: LSHFilterConfig = {
    numHashes: 128,
    bands: 16,
    similarityThreshold: 0.1,
    ...config
  };

  const filter = new LSHFilter(defaultConfig);
  
  // Add all documents to the filter
  for (const doc of documents) {
    filter.addDocument(doc.id, doc.terms);
  }
  
  return filter;
}
