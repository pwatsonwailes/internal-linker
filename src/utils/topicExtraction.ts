import { filterStopWordsForTopics } from './stopwords';

/**
 * Standardized topic extraction function used across the application
 * This ensures consistent stop word filtering and topic extraction
 */
export function extractSimpleTopics(doc: string[], maxTopics: number = 5): string[] {
  if (!doc || doc.length === 0) return [];
  
  // Filter out stop words and short terms using the standardized function
  const filteredTerms = filterStopWordsForTopics(doc, 3);
  
  if (filteredTerms.length === 0) return [];
  
  // Count term frequencies
  const termFreq = new Map<string, number>();
  filteredTerms.forEach(term => {
    // Ensure consistent lowercasing
    const normalizedTerm = term.toLowerCase().trim();
    if (normalizedTerm) {
      termFreq.set(normalizedTerm, (termFreq.get(normalizedTerm) || 0) + 1);
    }
  });
  
  // Sort by frequency and take top terms
  const sortedTerms = Array.from(termFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([term]) => term);
  
  return sortedTerms;
}

/**
 * Extract topics from multiple documents
 */
export function extractTopicsFromDocuments(docs: string[][], maxTopicsPerDoc: number = 5): Map<number, string[]> {
  const results = new Map<number, string[]>();
  
  docs.forEach((doc, index) => {
    const topics = extractSimpleTopics(doc, maxTopicsPerDoc);
    results.set(index, topics);
  });
  
  return results;
}

/**
 * Get unique topics across all documents
 */
export function getUniqueTopics(docs: string[][], maxTopicsPerDoc: number = 5): Set<string> {
  const uniqueTopics = new Set<string>();
  
  docs.forEach(doc => {
    const topics = extractSimpleTopics(doc, maxTopicsPerDoc);
    topics.forEach(topic => uniqueTopics.add(topic));
  });
  
  return uniqueTopics;
}
