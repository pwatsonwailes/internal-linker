import { detectLanguage } from './languageDetection';
import * as stopword from 'stopword';

// Map language codes to stopword package language codes
const languageMap = {
  en: 'eng',
  fr: 'fra', 
  de: 'deu',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  ja: 'jpn'
} as const;

// Create stopwords sets from the npm package
export const stopWords = {
  en: new Set(stopword.eng),
  fr: new Set(stopword.fra),
  de: new Set(stopword.deu),
  es: new Set(stopword.spa),
  it: new Set(stopword.ita),
  pt: new Set(stopword.por),
  ja: new Set(stopword.jpn)
};

/**
 * Filters stop words from a document for topic extraction
 * @param doc Array of words/tokens
 * @param minLength Minimum word length (default: 3)
 * @returns Array of words with stop words removed
 */
export function filterStopWordsForTopics(doc: string[], minLength: number = 3): string[] {
  if (!doc || doc.length === 0) return [];
  
  // Detect language from the document
  const text = doc.join(' ');
  const lang = detectLanguage(text);
  
  // Get stop words for the detected language
  const languageStopWords = stopWords[lang] || stopWords.en;
  
  // Filter out stop words and short words
  return doc.filter(term => 
    term && 
    term.length >= minLength && 
    !languageStopWords.has(term.toLowerCase())
  );
}