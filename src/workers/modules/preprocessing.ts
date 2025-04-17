import { detectLanguage } from '../../utils/languageDetection';
import { stopWords } from '../../utils/stopwords';
import { getPreprocessedUrl, storeUrlData } from '../../lib/supabase';

// Cache for preprocessed URLs
const urlCache = new Map<string, {
  id: string;
  doc: string[];
  preprocessed: boolean;
}>();

export function preprocessText(text: string): string[] {
  const lang = detectLanguage(text);
  return text.toLowerCase()
    .replace(/[^\p{L}\s]/gu, '')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords[lang].has(word));
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
    const doc = preprocessText(`${safeTitle} ${safeBody}`);
    
    // Store in database
    const result = await storeUrlData(url, safeTitle, safeBody, {
      tokens: doc,
      language: detectLanguage(`${safeTitle} ${safeBody}`)
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