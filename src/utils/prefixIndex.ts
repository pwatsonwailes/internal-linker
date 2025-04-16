// Prefix-based index with GPU acceleration
import { gpuManager } from './gpuManager';

export class PrefixIndex {
  private index: Map<string, Set<number>> = new Map();
  private prefixLength: number = 3;
  private matchKernel: any;

  constructor() {
    try {
      if (gpuManager.isAvailable()) {
        // Create kernel for parallel prefix matching
        this.matchKernel = gpuManager.createKernel(function(
          prefixChars: number[],
          textChars: number[],
          prefixLength: number,
          textLength: number
        ) {
          const startPos = this.thread.x;
          if (startPos < textLength - prefixLength + 1) {
            let matches = true;
            for (let i = 0; i < prefixLength; i++) {
              if (textChars[startPos + i] !== prefixChars[i]) {
                matches = false;
                break;
              }
            }
            return matches ? 1 : 0;
          }
          return 0;
        })
        .setOutput([1024]); // Adjust based on maximum text length

        gpuManager.registerKernel('prefixMatch', this.matchKernel);
      }
    } catch (error) {
      console.warn('Failed to initialize prefix matching GPU kernel:', error);
    }
  }

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
        
        try {
          if (this.matchKernel) {
            // Convert prefix and word to character arrays for GPU processing
            const prefixChars = Array.from(prefix).map(c => c.charCodeAt(0));
            const wordChars = Array.from(word).map(c => c.charCodeAt(0));
            
            // Use GPU to find prefix matches
            const matches = this.matchKernel(
              prefixChars,
              wordChars,
              this.prefixLength,
              word.length
            ) as number[];
            
            // Get matching documents
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
          } else {
            throw new Error('GPU kernel not available');
          }
        } catch (error) {
          // CPU fallback
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
      }
    });

    return candidates;
  }
}