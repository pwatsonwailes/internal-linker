// Optimized inverted index with TypedArray support
export class InvertedIndex {
  private index: Map<string, Set<number>> = new Map();
  private documents: string[][] = [];
  private docIds: Map<string[][], number> = new Map();

  public clear(): void {
    this.index = new Map();
    this.documents = [];
    this.docIds = new Map();
  }

  public addDocument(docId: number, terms: string[]): void {
    // Store document
    this.documents[docId] = terms;
    this.docIds.set(terms, docId);

    // Update inverted index
    terms.forEach(term => {
      if (!this.index.has(term)) {
        this.index.set(term, new Set());
      }
      this.index.get(term)!.add(docId);
    });
  }

  public search(terms: string[]): number[] {
    if (terms.length === 0) return [];

    // Get document sets for each term
    const docSets = terms
      .map(term => this.index.get(term) || new Set<number>())
      .filter(set => set.size > 0);

    if (docSets.length === 0) return [];

    // Find intersection of all document sets
    const intersection = new Set(docSets[0]);
    for (let i = 1; i < docSets.length; i++) {
      const currentSet = docSets[i];
      for (const docId of intersection) {
        if (!currentSet.has(docId)) {
          intersection.delete(docId);
        }
      }
    }

    return Array.from(intersection);
  }

  public getDocumentById(docId: number): string[] | undefined {
    return this.documents[docId];
  }

  public getDocumentId(doc: string[]): number | undefined {
    return this.docIds.get(doc);
  }
}