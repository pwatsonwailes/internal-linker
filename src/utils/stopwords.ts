import { detectLanguage, detectLanguageSync } from './languageDetection';
// @ts-ignore - stopword package doesn't have type definitions
import { removeStopwords, eng, fra, deu, spa, ita, por, jpn } from 'stopword';

// Note: We're using manual filtering instead of removeStopwords function
// due to browser compatibility issues with the stopword package

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
 * Filters stop words from a document using CLD language detection (async)
 * @param doc Array of words/tokens
 * @param minLength Minimum word length (default: 3)
 * @returns Promise<Array of words with stop words removed>
 */
export async function filterStopWordsForTopics(doc: string[], minLength: number = 3): Promise<string[]> {
  if (!doc || doc.length === 0) return [];
  
  // Detect language from the document using CLD
  const text = doc.join(' ');
  const lang = await detectLanguage(text);
  
  // Get stopwords array for the detected language
  const stopwordsArray = getStopwordsForLanguage(lang);
  
  // Manual stopwords filtering (more reliable than the package function)
  const filteredWords = doc.filter(word => {
    const lowerWord = word.toLowerCase();
    return !stopwordsArray.includes(lowerWord);
  });
  
  // Additional filtering for minimum length and valid terms
  return filteredWords.filter(term => 
    term && 
    term.trim().length >= minLength &&
    /^[a-zA-ZÀ-ÿ]+$/.test(term) // Only alphabetic characters
  );
}

/**
 * Synchronous version using fallback language detection
 * @param doc Array of words/tokens
 * @param minLength Minimum word length (default: 3)
 * @returns Array of words with stop words removed
 */
export function filterStopWordsForTopicsSync(doc: string[], minLength: number = 3): string[] {
  if (!doc || doc.length === 0) return [];
  
  // Detect language from the document using sync fallback
  const text = doc.join(' ');
  const lang = detectLanguageSync(text);
  
  // Get stopwords array for the detected language
  const stopwordsArray = getStopwordsForLanguage(lang);
  
  // Manual stopwords filtering (more reliable than the package function)
  const filteredWords = doc.filter(word => {
    const lowerWord = word.toLowerCase();
    return !stopwordsArray.includes(lowerWord);
  });
  
  // Additional filtering for minimum length and valid terms
  return filteredWords.filter(term => 
    term && 
    term.trim().length >= minLength &&
    /^[a-zA-ZÀ-ÿ]+$/.test(term) // Only alphabetic characters
  );
}