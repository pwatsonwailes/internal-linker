import { detectLanguage } from '../../utils/languageDetection';
import { stopWords } from '../../utils/stopwords';
import { getPreprocessedUrl, storeUrlData } from '../../lib/supabase';
import { validateDocument } from '../../utils/tfidf';

// Cache for preprocessed URLs
const urlCache = new Map<string, {
  id: string;
  doc: string[];
  preprocessed: boolean;
}>();

export function preprocessText(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const lang = detectLanguage(text);
  const tokens = text.toLowerCase()
    .replace(/[^\p{L}\s]/gu, '') // Keep only letters and spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .split(' ')
    .filter(word => 
      word.length >= 3 && 
      word.length < 50 && // Reject extremely long words (likely errors)
      !stopWords[lang].has(word) &&
      /^[a-zA-ZÀ-ÿ]+$/.test(word) // Only alphabetic characters
    );

  return tokens;
}

export async function preprocessUrl(
  [url, title, body]: string[]
): Promise<{ id: string; doc: string[]; url: string; title: string; body: string }> {
  try {
    // Ensure we have valid strings for title and body
    const safeTitle = title || '';
    const safeBody = body || '';
    
    if (!url) {
      throw new Error('URL is required for preprocessing');
    }

    // Check cache first
    if (urlCache.has(url)) {
      const cached = urlCache.get(url)!;
      if (cached.preprocessed) {
        return { 
          id: cached.id, 
          doc: cached.doc, 
          url, 
          title: safeTitle, 
          body: safeBody 
        };
      }
    }

    // Check database cache
    const cached = await getPreprocessedUrl(url);
    if (cached?.preprocessed_data) {
      const doc = cached.preprocessed_data.tokens;
      urlCache.set(url, { id: cached.id, doc, preprocessed: true });
      return { 
        id: cached.id, 
        doc, 
        url, 
        title: cached.title || safeTitle, 
        body: cached.body || safeBody 
      };
    }

    // Process new URL
    const combinedText = `${safeTitle} ${safeBody}`.trim();
    if (!combinedText) {
      throw new Error('URL has no content to process');
    }

    const doc = preprocessText(combinedText);
    
    // Validate the processed document
    const validation = validateDocument(doc, 3);
    if (!validation.isValid) {
      console.warn(`Document validation issues for ${url}:`, validation.issues);
      // Still proceed but log the issues
    }

    if (doc.length === 0) {
      throw new Error('Document produced no valid tokens after preprocessing');
    }
    
    // Store in database
    const result = await storeUrlData(url, safeTitle, safeBody, {
      tokens: doc,
      language: detectLanguage(combinedText),
      tokenCount: doc.length,
      validationIssues: validation.issues
    });

    if (!result) {
      throw new Error('Failed to store URL data');
    }

    // Update cache
    urlCache.set(url, { id: result.id, doc, preprocessed: true });
    
    return { id: result.id, doc, url, title: safeTitle, body: safeBody };
  } catch (error) {
    console.error(`Error preprocessing URL ${url}:`, error);
    throw error;
  }
}

export function clearPreprocessingCache(): void {
  urlCache.clear();
}