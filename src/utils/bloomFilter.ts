// Bloom Filter with GPU acceleration
// import { gpuManager } from './gpuManager';
import { createHash } from 'crypto';

export class BloomFilter {
  private bits: Uint32Array;
  private numHashes: number;
  private size: number;
  private hashCache: Map<string, number[]>;
  // private hashKernel: any = null;
  // private testKernel: any = null;

  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    this.size = this.calculateOptimalSize(expectedItems, falsePositiveRate);
    this.numHashes = this.calculateOptimalHashes(expectedItems, this.size);
    this.bits = new Uint32Array(Math.ceil(this.size / 32));
    this.hashCache = new Map();

    /* // Removed GPU kernel initialization
    if (gpuManager.isAvailable()) {
      try {
        this.hashKernel = gpuManager.createKernel(function(
            itemHash: number, // Pre-hashed item 
            seeds: number[]     // Seeds for k hash functions
          ): number[] { // Return k hash indices
            const indices = new Array(this.constants.k as number);
            for (let i = 0; i < (this.constants.k as number); i++) {
                // Simple secondary hash function (needs improvement for distribution)
                indices[i] = Math.abs(itemHash ^ seeds[i]) % (this.constants.size as number);
            }
            return indices; // Needs flattening/adjustment for GPU.js output
        }, { 
            output: [this.numHashes], // k indices per item
            constants: { 
                k: this.numHashes, 
                size: this.size 
            } 
        });

        this.testKernel = gpuManager.createKernel(function(
            itemHash: number, 
            seeds: number[], 
            bitArray: number[] // The Bloom filter bit array
          ): number { // Return 1 if potentially present, 0 otherwise
            let potentiallyPresent = 1;
            for (let i = 0; i < (this.constants.k as number); i++) {
                const index = Math.abs(itemHash ^ seeds[i]) % (this.constants.size as number);
                if (bitArray[index] === 0) {
                    potentiallyPresent = 0;
                    break; // Exit loop early
                }
            }
            return potentiallyPresent;
        }, { 
            output: [1], 
            constants: { 
                k: this.numHashes, 
                size: this.size 
            } 
        });

        gpuManager.registerKernel('bloomFilterHash', this.hashKernel);
        gpuManager.registerKernel('bloomFilterTest', this.testKernel);

      } catch (error) {
          console.error("Failed to create Bloom Filter GPU kernels:", error);
      }
    }
    */ // End of removed block
  }

  private calculateOptimalSize(n: number, p: number): number {
    return Math.ceil(-(n * Math.log(p)) / (Math.log(2) * Math.log(2)));
  }

  private calculateOptimalHashes(n: number, m: number): number {
    return Math.max(1, Math.min(Math.ceil((m / n) * Math.log(2)), 16));
  }

  private stringToCharArray(value: string): number[] {
    const chars = new Array(256).fill(0);
    for (let i = 0; i < Math.min(value.length, 256); i++) {
      chars[i] = value.charCodeAt(i);
    }
    return chars;
  }

  private getHashValues(value: string): number[] {
    if (this.hashCache.has(value)) {
      return this.hashCache.get(value)!;
    }

    /* // Removed GPU path
    if (this.hashKernel) {
        try {
            const chars = this.stringToCharArray(value);
            const seeds = new Array(this.numHashes).fill(0).map((_, i) => i + 1);
            
            const hashes = this.hashKernel(chars, seeds, this.numHashes) as number[];
            const hashValues = Array.from(hashes).map(hash => Math.abs(hash % this.size));
            
            this.hashCache.set(value, hashValues);
            return hashValues;
        } catch (e) {
            console.error("GPU hash computation failed, falling back to CPU:", e);
        }
    }
    */

    // CPU fallback
    const hashValues = new Array(this.numHashes);
    for (let i = 0; i < this.numHashes; i++) {
      let hash = i + 1;
      for (let j = 0; j < value.length; j++) {
        hash = Math.imul(hash, 31) + value.charCodeAt(j);
        hash = hash >>> 0;
      }
      hashValues[i] = Math.abs(hash % this.size);
    }

    this.hashCache.set(value, hashValues);
    return hashValues;
  }

  public add(value: string): void {
    const hashValues = this.getHashValues(value);
    for (const hash of hashValues) {
      const arrayIndex = Math.floor(hash / 32);
      const bitIndex = hash % 32;
      this.bits[arrayIndex] |= 1 << bitIndex;
    }
  }

  public test(value: string): boolean {
    const hashValues = this.getHashValues(value);

    /* // Removed GPU path
    if (this.testKernel) {
        try {
            const results = this.testKernel(
                hashValues,
                Array.from(this.bits),
                this.numHashes,
                32
            ) as number[];
            
            return results.every(result => result === 1);
        } catch (e) {
            console.error("GPU test computation failed, falling back to CPU:", e);
        }
    }
    */

    // CPU fallback
    for (const hash of hashValues) {
      const arrayIndex = Math.floor(hash / 32);
      const bitIndex = hash % 32;
      if (!(this.bits[arrayIndex] & (1 << bitIndex))) {
        return false;
      }
    }
    return true;
  }

  public clear(): void {
    this.bits.fill(0);
    this.hashCache.clear();
  }

  public getEstimatedFalsePositiveRate(): number {
    let setBits = 0;
    for (let i = 0; i < this.bits.length; i++) {
      setBits += this.countBits(this.bits[i]);
    }
    const probability = setBits / (this.size);
    return Math.pow(probability, this.numHashes);
  }

  private countBits(n: number): number {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
  }
}

export default BloomFilter;