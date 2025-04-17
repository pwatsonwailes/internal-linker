// Prefix-based index without GPU acceleration
export class PrefixIndex {
  private index: Map<string, Set<number>> = new Map();
  private prefixLength: number = 3;

  public addDocument(docId: number, text: string): void {
    const words = text.toLowerCase().split(/\s+/);
    
    words.forEach(word => {
      if (word.length >= this.prefixLength) {
        const prefix = word.slice(0, this.prefixLength);
        if (!this.index.has(prefix)) {
          this.index.set(prefix, new Set());
        }
        this.index.get(prefix)!.add(docId);
      }
    });
  }

  public findCandidates(phrase: string): Set<number> {
    const words = phrase.toLowerCase().split(/\s+/);
    const candidates = new Set<number>();
    let isFirst = true;

    words.forEach(word => {
      if (word.length >= this.prefixLength) {
        const prefix = word.slice(0, this.prefixLength);
        const matchingDocs = this.index.get(prefix);
        
        if (matchingDocs) {
          if (isFirst) {
            matchingDocs.forEach(id => candidates.add(id));
            isFirst = false;
          } else {
            for (const id of candidates) {
              if (!matchingDocs.has(id)) {
                candidates.delete(id);
              }
            }
          }
        }
      }
    });

    return candidates;
  }
}