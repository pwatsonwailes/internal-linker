// @ts-ignore - @vscode/vscode-languagedetection package doesn't have type definitions
import { ModelOperations } from '@vscode/vscode-languagedetection';

// Language detection using VS Code's language detection (async, web-compatible)
export async function detectLanguage(text: string): Promise<'en' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'ja'> {
  try {
    // Initialize the model operations
    const modelOperations = new ModelOperations();
    
    // Detect language (returns array of results with confidence scores)
    const results = await modelOperations.runModel(text);
    
    // Map VS Code language detection results to our supported languages
    const languageMap: Record<string, 'en' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'ja'> = {
      'en': 'en',       // English
      'eng': 'en',
      'english': 'en',
      'fr': 'fr',       // French
      'fra': 'fr', 
      'french': 'fr',
      'de': 'de',       // German
      'deu': 'de',
      'ger': 'de',
      'german': 'de',
      'es': 'es',       // Spanish
      'spa': 'es',
      'spanish': 'es',
      'it': 'it',       // Italian
      'ita': 'it',
      'italian': 'it',
      'pt': 'pt',       // Portuguese
      'por': 'pt',
      'portuguese': 'pt',
      'ja': 'ja',       // Japanese
      'jpn': 'ja',
      'japanese': 'ja'
    };

    // Get the most confident result
    if (results && results.length > 0) {
      const topResult = results[0];
      const detectedLang = topResult.languageId?.toLowerCase();
      
      if (detectedLang && languageMap[detectedLang]) {
        return languageMap[detectedLang];
      }
    }

    // Fallback to English if detection fails or language not supported
    return 'en';
    
  } catch (error) {
    console.warn('Language detection failed, falling back to English:', error);
    return 'en';
  }
}

// Synchronous fallback function for cases where async is not possible
export function detectLanguageSync(text: string): 'en' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'ja' {
  // Simple heuristic fallback for synchronous cases
  const lowerText = text.toLowerCase();
  
  // Check for distinctive patterns
  if (/\b(le|la|les|est|sont|dans|avec|pour)\b/.test(lowerText)) return 'fr';
  if (/\b(der|die|das|ist|und|für|mit|von)\b/.test(lowerText)) return 'de';
  if (/\b(el|la|los|las|que|con|para|por)\b/.test(lowerText)) return 'es';
  if (/\b(il|lo|la|gli|le|che|con|per)\b/.test(lowerText)) return 'it';
  if (/\b(que|para|com|uma|mais|seu|pela|pelo)\b/.test(lowerText)) return 'pt';
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) return 'ja';
  
  // Default to English
  return 'en';
}