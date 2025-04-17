export class BloomFilter {
  private bits: Uint32Array;
  private numHashes: number;
  private size: number;
  private hashCache: Map<string, number[]>;

  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    this.size = this.calculateOptimalSize(expectedItems, falsePositiveRate);
    this.numHashes = this.calculateOptimalHashes(expectedItems, this.size);
    this.bits = new Uint32Array(Math.ceil(this.size / 32));
    this.hashCache = new Map();
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