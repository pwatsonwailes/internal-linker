// Simple LDA-inspired topic modeling without GPU acceleration
export class TopicModel {
  private topics: Map<string, Set<string>>;
  private wordTopicScores: Map<string, Map<string, number>>;
  private topicThreshold = 0.5;
  private maxTopicsPerDocument = 10;
  private minTopicScore = 0.2;
  private cache: {
    documentTopics: Map<string, Set<string>>;
    modelState: Map<string, any>;
  };

  constructor(numTopics: number = 7) {
    this.topics = new Map();
    this.wordTopicScores = new Map();
    this.cache = {
      documentTopics: new Map(),
      modelState: new Map()
    };

    // Initialize topics
    for (let i = 0; i < numTopics; i++) {
      this.topics.set(`topic_${i}`, new Set());
    }
  }

  public train(documents: string[][]): void {
    const newDocs = documents.filter(doc => {
      const key = this.getDocumentKey(doc);
      return !this.cache.modelState.has(key);
    });

    if (newDocs.length === 0) return;

    const wordFreq = new Map<string, number>();
    newDocs.forEach(doc => {
      const key = this.getDocumentKey(doc);
      doc.forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        this.cache.modelState.set(`freq:${word}`, wordFreq.get(word));
      });
    });

    newDocs.forEach(doc => {
      const uniqueWords = new Set(doc);
      const wordScores = new Map<string, number>();

      uniqueWords.forEach(word => {
        let score = 0;
        uniqueWords.forEach(coword => {
          if (word !== coword) {
            const freq1 = wordFreq.get(word) || 0;
            const freq2 = wordFreq.get(coword) || 0;
            score += Math.log(1 + (freq1 * freq2));
          }
        });
        wordScores.set(word, score);
      });

      const sortedWords = Array.from(uniqueWords)
        .sort((a, b) => (wordScores.get(b) || 0) - (wordScores.get(a) || 0))
        .slice(0, 20);

      sortedWords.forEach(word => {
        if (!this.wordTopicScores.has(word)) {
          this.wordTopicScores.set(word, new Map());
        }

        sortedWords.forEach(coWord => {
          if (word !== coWord) {
            Array.from(this.topics.keys()).forEach(topic => {
              const score = this.calculateTopicScore(word, coWord, wordFreq);
              const currentScore = this.wordTopicScores.get(word)?.get(topic) || 0;
              const normalizedScore = score / (1 + Math.log(uniqueWords.size));
              this.wordTopicScores.get(word)?.set(topic, currentScore + normalizedScore);
              
              const scoreKey = `score:${word}:${topic}`;
              this.cache.modelState.set(scoreKey, this.wordTopicScores.get(word)?.get(topic));
            });
          }
        });
      });

      const key = this.getDocumentKey(doc);
      this.cache.modelState.set(key, true);
    });

    this.updateTopicAssignments();
  }

  private updateTopicAssignments(): void {
    this.wordTopicScores.forEach((topicScores, word) => {
      const scores = Array.from(topicScores.entries());
      const maxScore = Math.max(...scores.map(([_, score]) => score));
      
      const significantScores = scores
        .filter(([_, score]) => score > maxScore * this.topicThreshold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);

      significantScores.forEach(([topic, score]) => {
        if (score >= this.minTopicScore) {
          this.topics.get(topic)?.add(word);
        }
      });
    });
  }

  private getDocumentKey(doc: string[]): string {
    return doc.sort().join('|');
  }

  private calculateTopicScore(word1: string, word2: string, wordFreq: Map<string, number>): number {
    const freq1 = wordFreq.get(word1) || this.cache.modelState.get(`freq:${word1}`) || 0;
    const freq2 = wordFreq.get(word2) || this.cache.modelState.get(`freq:${word2}`) || 0;
    return Math.log(1 + (freq1 * freq2));
  }

  public getDocumentTopics(doc: string[]): Set<string> {
    const docKey = this.getDocumentKey(doc);
    
    if (this.cache.documentTopics.has(docKey)) {
      return this.cache.documentTopics.get(docKey)!;
    }

    const docTopics = new Set<string>();
    const wordCounts = new Map<string, number>();
    const topicScores = new Map<string, number>();

    doc.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    this.topics.forEach((words, topic) => {
      let matchScore = 0;
      words.forEach(word => {
        if (wordCounts.has(word)) {
          const scoreKey = `score:${word}:${topic}`;
          const cachedScore = this.cache.modelState.get(scoreKey);
          const wordScore = cachedScore || this.wordTopicScores.get(word)?.get(topic) || 0;
          matchScore += wordCounts.get(word)! * wordScore;
        }
      });

      if (matchScore > this.minTopicScore) {
        topicScores.set(topic, matchScore);
      }
    });

    Array.from(topicScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.maxTopicsPerDocument)
      .forEach(([topic, score]) => {
        docTopics.add(topic);
      });

    this.cache.documentTopics.set(docKey, docTopics);
    return docTopics;
  }

  public areDocumentsRelated(doc1: string[], doc2: string[]): boolean {
    const key1 = this.getDocumentKey(doc1);
    const key2 = this.getDocumentKey(doc2);
    const relationKey = `relation:${key1}:${key2}`;

    const cachedResult = this.cache.modelState.get(relationKey);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    const topics1 = this.getDocumentTopics(doc1);
    const topics2 = this.getDocumentTopics(doc2);

    const minCommonTopics = Math.min(topics1.size, topics2.size) >= 2 ? 2 : 1;
    let commonTopics = 0;
    
    topics1.forEach(topic => {
      if (topics2.has(topic)) commonTopics++;
    });

    const result = commonTopics >= minCommonTopics;
    this.cache.modelState.set(relationKey, result);
    return result;
  }

  public clearCache(): void {
    this.cache.documentTopics.clear();
    this.cache.modelState.clear();
  }
}