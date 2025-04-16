// MinHash implementation for Locality-Sensitive Hashing (LSH)
import { gpuManager } from './gpuManager';

export class MinHash {
  private numHashes: number;
  private hashSeeds: Uint32Array;
  private documents: Map<number, Uint32Array> = new Map();
  private bands: number;
  private buckets: Map<string, Set<number>> = new Map();
  private readonly prime: number = 4294967311; // First prime larger than 2^32
  private hashKernel: any;

  constructor(numHashes: number, bands: number = 20) {
    this.numHashes = numHashes;
    this.bands = bands;
    this.hashSeeds = new Uint32Array(numHashes);
    this.initializeHashSeeds();
    
    try {
      if (gpuManager.isAvailable()) {
        // Create kernel for parallel hash computation
        this.hashKernel = gpuManager.createKernel(function(
          term: number[],
          seeds: number[],
          prime: number
        ) {
          const i = this.thread.x;
          if (i < this.constants.numHashes) {
            let hash = seeds[i];
            for (let j = 0; j < this.constants.termLength; j++) {
              hash = (hash * 31 + term[j]) % prime;
            }
            return hash >>> 0;
          }
          return 0;
        })
        .setConstants({ numHashes: numHashes, termLength: 256 })
        .setOutput([numHashes]);

        gpuManager.registerKernel('minHash', this.hashKernel);
      }
    } catch (error) {
      console.warn('Failed to initialize MinHash GPU kernel:', error);
    }
  }

  private initializeHashSeeds(): void {
    const prime = 31;
    for (let i = 0; i < this.numHashes; i++) {
      this.hashSeeds[i] = Math.abs(
        (prime * (i + 1)) % Number.MAX_SAFE_INTEGER
      );
    }
  }

  private termToNumbers(term: string): number[] {
    const numbers = new Array(256).fill(0);
    for (let i = 0; i < Math.min(term.length, 256); i++) {
      numbers[i] = term.charCodeAt(i);
    }
    return numbers;
  }

  public addDocument(docId: number, terms: Set<string>): void {
    const signature = new Uint32Array(this.numHashes);
    signature.fill(Infinity);

    for (const term of terms) {
      try {
        if (this.hashKernel) {
          const termNumbers = this.termToNumbers(term);
          const hashes = this.hashKernel(
            termNumbers,
            Array.from(this.hashSeeds),
            this.prime
          ) as number[];
          
          for (let i = 0; i < this.numHashes; i++) {
            signature[i] = Math.min(signature[i], hashes[i]);
          }
        } else {
          throw new Error('GPU kernel not available');
        }
      } catch (error) {
        // CPU fallback
        for (let i = 0; i < this.numHashes; i++) {
          let hash = this.hashSeeds[i];
          for (let j = 0; j < term.length; j++) {
            hash = (hash * 31 + term.charCodeAt(j)) % this.prime;
          }
          signature[i] = Math.min(signature[i], hash >>> 0);
        }
      }
    }

    this.documents.set(docId, signature);

    // LSH bucketing
    const rowsPerBand = Math.floor(this.numHashes / this.bands);
    for (let i = 0; i < this.bands; i++) {
      const bandSignature = signature.slice(i * rowsPerBand, (i + 1) * rowsPerBand);
      const bucketKey = `${i}:${bandSignature.join(',')}`;
      
      if (!this.buckets.has(bucketKey)) {
        this.buckets.set(bucketKey, new Set());
      }
      this.buckets.get(bucketKey)!.add(docId);
    }
  }

  public findSimilarDocuments(terms: Set<string>): Set<number> {
    const signature = new Uint32Array(this.numHashes);
    signature.fill(Infinity);

    for (const term of terms) {
      try {
        if (this.hashKernel) {
          const termNumbers = this.termToNumbers(term);
          const hashes = this.hashKernel(
            termNumbers,
            Array.from(this.hashSeeds),
            this.prime
          ) as number[];
          
          for (let i = 0; i < this.numHashes; i++) {
            signature[i] = Math.min(signature[i], hashes[i]);
          }
        } else {
          throw new Error('GPU kernel not available');
        }
      } catch (error) {
        // CPU fallback
        for (let i = 0; i < this.numHashes; i++) {
          let hash = this.hashSeeds[i];
          for (let j = 0; j < term.length; j++) {
            hash = (hash * 31 + term.charCodeAt(j)) % this.prime;
          }
          signature[i] = Math.min(signature[i], hash >>> 0);
        }
      }
    }

    const candidates = new Set<number>();
    const rowsPerBand = Math.floor(this.numHashes / this.bands);

    for (let i = 0; i < this.bands; i++) {
      const bandSignature = signature.slice(i * rowsPerBand, (i + 1) * rowsPerBand);
      const bucketKey = `${i}:${bandSignature.join(',')}`;
      
      const bucket = this.buckets.get(bucketKey);
      if (bucket) {
        bucket.forEach(docId => candidates.add(docId));
      }
    }

    return candidates;
  }

  public clear(): void {
    this.documents.clear();
    this.buckets.clear();
  }
}