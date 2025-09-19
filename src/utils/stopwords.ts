import { detectLanguage } from './languageDetection';
// @ts-ignore - stopword package doesn't have type definitions
import { removeStopwords, eng, fra, deu, spa, ita, por, jpn } from 'stopword';

// Map language codes to stopword package language arrays
const languageStopwordMap = {
  en: eng,
  fr: fra, 
  de: deu,
  es: spa,
  it: ita,
  pt: por,
  ja: jpn
} as const;

/**
 * Get the appropriate stopwords array for a language
 */
function getStopwordsForLanguage(lang: keyof typeof languageStopwordMap): string[] {
  return languageStopwordMap[lang] || eng; // Fallback to English
}

/**
 * Filters stop words from a document using the removeStopwords function
 * @param doc Array of words/tokens
 * @param minLength Minimum word length (default: 3)
 * @returns Array of words with stop words removed
 */
export function filterStopWordsForTopics(doc: string[], minLength: number = 3): string[] {
  if (!doc || doc.length === 0) return [];
  
  // Detect language from the document
  const text = doc.join(' ');
  const lang = detectLanguage(text);
  
  // Get stopwords array for the detected language
  const stopwordsArray = getStopwordsForLanguage(lang);
  
  // Use removeStopwords function to filter out stop words
  const filteredWords = removeStopwords(doc, stopwordsArray);
  
  // Additional filtering for minimum length and valid terms
  return filteredWords.filter(term => 
    term && 
    term.trim().length >= minLength &&
    /^[a-zA-ZÀ-ÿ]+$/.test(term) // Only alphabetic characters
  );
}