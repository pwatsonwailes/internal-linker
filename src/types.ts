export interface SimilarityResult {
  sourceUrl: string;
  matches: {
    url: string;
    similarity: number;
    suggestedAnchor: string;
    topics: string[];
  }[];
  topics: string[];
}

export interface CSVRow {
  url: string;
  body: string;
}

export type WorkerMessage = 
  | { 
      type: 'progress'; 
      progress: number; 
      currentUrlProgress: number;
      message?: string;
    }
  | { type: 'complete'; results: SimilarityResult[] };

export interface TopicGroup {
  topic: string;
  urls: {
    url: string;
    matches?: {
      url: string;
      similarity: number;
      suggestedAnchor: string;
      topics: string[];
    }[];
  }[];
}

export interface UrlGroup {
  url: string;
  topics: string[];
  matches?: {
    url: string;
    similarity: number;
    suggestedAnchor: string;
    topics: string[];
  }[];
}