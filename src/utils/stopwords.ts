import { detectLanguage } from './languageDetection';
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
 * Filters stop words from a document using the removeStopwords function
 * @param doc Array of words/tokens
 * @param minLength Minimum word length (default: 3)
 * @returns Array of words with stop words removed
 */
export function filterStopWordsForTopics(doc: string[], minLength: number = 3): string[] {
  console.log('filterStopWordsForTopics called with:', doc, 'minLength:', minLength);
  
  if (!doc || doc.length === 0) {
    console.log('Empty input, returning empty array');
    return [];
  }
  
  // Detect language from the document
  const text = doc.join(' ');
  const lang = detectLanguage(text);
  console.log('Detected language:', lang);
  
  // Get stopwords array for the detected language
  const stopwordsArray = getStopwordsForLanguage(lang);
  console.log('Stopwords array length:', stopwordsArray.length);
  console.log('First few stopwords:', stopwordsArray.slice(0, 10));
  
  // Manual stopwords filtering (more reliable than the package function)
  const filteredWords = doc.filter(word => {
    const lowerWord = word.toLowerCase();
    const isStopword = stopwordsArray.includes(lowerWord);
    console.log(`Word "${word}" -> "${lowerWord}" is stopword: ${isStopword}`);
    return !isStopword;
  });
  
  console.log('After stopwords filtering:', filteredWords);
  
  // Additional filtering for minimum length and valid terms
  const finalResult = filteredWords.filter(term => 
    term && 
    term.trim().length >= minLength &&
    /^[a-zA-ZÀ-ÿ]+$/.test(term) // Only alphabetic characters
  );
  
  console.log('Final result:', finalResult);
  return finalResult;
}