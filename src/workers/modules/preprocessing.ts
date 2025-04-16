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
    // Check cache first
    if (urlCache.has(url)) {
      const cached = urlCache.get(url)!;
      if (cached.preprocessed) {
        return { id: cached.id, doc: cached.doc, url, title, body };
      }
    }

    // Check database cache
    const cached = await getPreprocessedUrl(url);
    if (cached?.preprocessed_data) {
      const doc = cached.preprocessed_data.tokens;
      urlCache.set(url, { id: cached.id, doc, preprocessed: true });
      return { id: cached.id, doc, url, title, body };
    }

    // Process new URL
    const doc = preprocessText(`${title} ${body}`);
    
    // Store in database
    const { id } = await storeUrlData(url, title, body, {
      tokens: doc,
      language: detectLanguage(`${title} ${body}`)
    });

    // Update cache
    urlCache.set(url, { id, doc, preprocessed: true });
    
    return { id, doc, url, title, body };
  } catch (error) {
    console.error(`Error preprocessing URL ${url}:`, error);
    throw error;
  }
}

export function clearPreprocessingCache(): void {
  urlCache.clear();
}