import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import { filterStopWordsForTopics } from '../utils/stopwords';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

const BATCH_SIZE = 100; // Increased batch size for better performance
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Retry function with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0 && isRetryableError(error)) {
      console.warn(`Operation failed, retrying in ${delay}ms. Retries left: ${retries - 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

function extractSimpleTopics(doc: string[]): string[] {
  if (!doc || doc.length === 0) return [];
  
  // Filter out stop words and short terms
  const filteredTerms = filterStopWordsForTopics(doc, 3);
  
  // Count term frequencies
  const termFreq = new Map<string, number>();
  filteredTerms.forEach(term => {
    termFreq.set(term, (termFreq.get(term) || 0) + 1);
  });
  
  // Sort by frequency and take top terms
  const sortedTerms = Array.from(termFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5) // Take top 5 terms
    .map(([term]) => term);
  
  return sortedTerms;
}

function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Network errors
  if (error.message?.includes('fetch')) return true;
  
  // Supabase specific errors that might be temporary
  const retryableCodes = ['PGRST301', 'PGRST302', '23505']; // Connection issues, rate limits
  if (error.code && retryableCodes.includes(error.code)) return true;
  
  // HTTP status codes that are retryable
  if (error.status && [408, 429, 500, 502, 503, 504].includes(error.status)) return true;
  
  return false;
}

export async function storeUrlData(
  url: string,
  title: string,
  body: string,
  preprocessedData: any
) {
  // Ensure body is never null
  const safeBody = body || '';
  const safeTitle = title || '';
  
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('urls')
      .upsert({
        url,
        title: safeTitle,
        body: safeBody,
        preprocessed_data: preprocessedData
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error storing URL data:', { url, error });
      throw error;
    }
    return data;
  });
}

export async function getPreprocessedUrl(url: string) {
  const { data, error } = await supabase
    .from('urls')
    .select('*')
    .eq('url', url)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function storeSimilarityResult(
  sourceUrlId: string,
  targetUrlId: string,
  similarityScore: number,
  suggestedAnchor: string
) {
  const { error } = await supabase
    .from('similarity_results')
    .upsert({
      source_url_id: sourceUrlId,
      target_url_id: targetUrlId,
      similarity_score: similarityScore,
      suggested_anchor: suggestedAnchor
    });

  if (error) throw error;
}

export async function getSimilarityResults(sourceUrl: string) {
  try {
    const { data: sourceUrlData, error: sourceError } = await supabase
      .from('urls')
      .select('id')
      .eq('url', sourceUrl)
      .maybeSingle();

    if (sourceError || !sourceUrlData) return null;

    const { data, error } = await supabase
      .from('similarity_results')
      .select(`
        similarity_score,
        suggested_anchor,
        target_url:urls!target_url_id (
          url,
          title
        )
      `)
      .eq('source_url_id', sourceUrlData.id)
      .order('similarity_score', { ascending: false })
      .limit(5);

    if (error) throw error;

    return data?.map(result => ({
      url: result.target_url.url,
      title: result.target_url.title,
      similarity: result.similarity_score,
      suggestedAnchor: result.suggested_anchor
    })) || null;
  } catch (error) {
    console.error('Error getting similarity results:', error);
    return null;
  }
}

export async function batchGetSimilarityResults(sourceUrls: string[]) {
  try {
    // Process in batches to avoid large queries
    const results = new Map<string, {
      url: string;
      title: string;
      similarity: number;
      suggestedAnchor: string;
      topics: string[];
      sourceDoc?: string[];
    }[]>();

    for (let i = 0; i < sourceUrls.length; i += BATCH_SIZE) {
      const batch = sourceUrls.slice(i, i + BATCH_SIZE);
      
      const { data: urlData, error: urlError } = await supabase
        .from('urls')
        .select('id, url')
        .in('url', batch);

      if (urlError) {
        console.error('Error fetching URL batch data:', urlError);
        continue;
      }

      if (!urlData?.length) continue;

      const urlMap = new Map(urlData.map(u => [u.url, u.id]));
      const sourceIds = urlData.map(u => u.id);

      const { data: similarityData, error: similarityError } = await supabase
        .from('similarity_results')
        .select(`
          source_url_id,
          similarity_score,
          suggested_anchor,
          source:urls!similarity_results_source_url_id_fkey(url, title, preprocessed_data),
          target:urls!target_url_id(url, title, preprocessed_data)
        `)
        .in('source_url_id', sourceIds)
        .order('similarity_score', { ascending: false });

      if (similarityError) {
        console.error('Error fetching similarity batch results:', similarityError);
        continue;
      }

      // Process results for this batch
      similarityData?.forEach(result => {
        const sourceUrl = result.source.url;
        if (!results.has(sourceUrl)) {
          results.set(sourceUrl, []);
        }
        
        const matches = results.get(sourceUrl)!;
        if (matches.length < 5) {
          // Extract topics from target document
          const targetTopics = extractSimpleTopics(result.target.preprocessed_data?.tokens || []);
          
          matches.push({
            url: result.target.url,
            title: result.target.title,
            similarity: result.similarity_score,
            suggestedAnchor: result.suggested_anchor,
            topics: targetTopics,
            sourceDoc: result.source.preprocessed_data?.tokens || []
          });
        }
      });

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  } catch (error) {
    console.error('Error batch getting similarity results:', error);
    return new Map();
  }
}

export async function getTargetUrlList(id: string) {
  const { data, error } = await supabase
    .from('target_url_lists')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createTargetUrlList(urls: string[]) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(urls.join('|'))
  ).then(buf => Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  );

  const { data, error } = await supabase
    .from('target_url_lists')
    .insert({ urls, hash })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to create target URL list');
  return data.id;
}

export async function getTargetUrlListId(urls: string[]) {
  return withRetry(async () => {
    const sortedUrls = [...urls].sort(); // Create sorted copy for consistent hashing
    
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(sortedUrls.join('|'))
    ).then(buf => Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    );

    // Check if list already exists
    const { data: existingList, error: selectError } = await supabase
      .from('target_url_lists')
      .select('id')
      .eq('hash', hash)
      .maybeSingle();

    if (selectError) {
      console.error('Error checking existing target list:', selectError);
      throw selectError;
    }

    if (existingList) {
      console.log(`Using existing target list: ${existingList.id}`);
      return existingList.id;
    }

    // Create new list
    const { data: newList, error: insertError } = await supabase
      .from('target_url_lists')
      .insert({ urls: sortedUrls, hash })
      .select('id')
      .maybeSingle();

    if (insertError) {
      console.error('Error creating target URL list:', insertError);
      throw insertError;
    }
    
    if (!newList) {
      throw new Error('Failed to create target URL list - no data returned');
    }
    
    console.log(`Created new target list: ${newList.id}`);
    return newList.id;
  });
}

export async function getProcessedSourceUrls(sourceUrls: string[], targetListId: string) {
  const results = new Map<string, boolean>();
  
  // Process in batches
  for (let i = 0; i < sourceUrls.length; i += BATCH_SIZE) {
    const batch = sourceUrls.slice(i, i + BATCH_SIZE);
    
    const { data, error } = await supabase
      .from('source_url_processing_status')
      .select('source_url, processed')
      .in('source_url', batch)
      .eq('target_list_id', targetListId);

    if (error) {
      console.error('Error fetching processed status batch:', error);
      continue;
    }

    // Update results map with this batch
    data?.forEach(({ source_url, processed }) => {
      results.set(source_url, processed);
    });

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return results;
}

export async function markSourceUrlProcessed(sourceUrl: string, targetListId: string) {
  const { error } = await supabase
    .from('source_url_processing_status')
    .upsert({
      source_url: sourceUrl,
      target_list_id: targetListId,
      processed: true
    });

  if (error) throw error;
}

export async function clearSourceUrlProcessingStatus(sourceUrl: string, targetListId: string) {
  const { error } = await supabase
    .from('source_url_processing_status')
    .delete()
    .eq('source_url', sourceUrl)
    .eq('target_list_id', targetListId);

  if (error) throw error;
}

export async function hasProcessedSourceUrl(sourceUrl: string, targetUrls: string[]) {
  try {
    const targetListId = await getTargetUrlListId(targetUrls);
    const { data, error } = await supabase
      .from('source_url_processing_status')
      .select('processed')
      .eq('source_url', sourceUrl)
      .eq('target_list_id', targetListId)
      .maybeSingle();

    if (error) throw error;
    return data?.processed || false;
  } catch (error) {
    console.error('Error checking processed source URL:', error);
    return false;
  }
}