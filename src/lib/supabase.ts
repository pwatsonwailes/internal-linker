import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export async function storeUrlData(
  url: string,
  title: string,
  body: string,
  preprocessedData: any
) {
  const { data, error } = await supabase
    .from('urls')
    .upsert({
      url,
      title,
      body,
      preprocessed_data: preprocessedData
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPreprocessedUrl(url: string) {
  const { data, error } = await supabase
    .from('urls')
    .select('*')
    .eq('url', url)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
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
      .single();

    if (sourceError) return null;

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
    const { data: urlData, error: urlError } = await supabase
      .from('urls')
      .select('id, url')
      .in('url', sourceUrls);

    if (urlError) {
      console.error('Error fetching URL data:', urlError);
      return new Map();
    }

    const urlMap = new Map(urlData?.map(u => [u.url, u.id]) || []);
    const sourceIds = urlData?.map(u => u.id) || [];

    if (sourceIds.length === 0) {
      return new Map();
    }

    const { data: similarityData, error: similarityError } = await supabase
      .from('similarity_results')
      .select(`
        source_url_id,
        similarity_score,
        suggested_anchor,
        source:urls!similarity_results_source_url_id_fkey(url, title),
        target:urls!target_url_id(url, title)
      `)
      .in('source_url_id', sourceIds)
      .order('similarity_score', { ascending: false });

    if (similarityError) {
      console.error('Error fetching similarity results:', similarityError);
      return new Map();
    }

    const resultMap = new Map<string, {
      url: string;
      title: string;
      similarity: number;
      suggestedAnchor: string;
    }[]>();

    similarityData?.forEach(result => {
      const sourceUrl = result.source.url;
      if (!resultMap.has(sourceUrl)) {
        resultMap.set(sourceUrl, []);
      }
      
      const matches = resultMap.get(sourceUrl)!;
      if (matches.length < 5) {
        matches.push({
          url: result.target.url,
          title: result.target.title,
          similarity: result.similarity_score,
          suggestedAnchor: result.suggested_anchor
        });
      }
    });

    return resultMap;
  } catch (error) {
    console.error('Error batch getting similarity results:', error);
    return new Map();
  }
}

// Enhanced target URL list functions
export async function getTargetUrlList(id: string) {
  const { data, error } = await supabase
    .from('target_url_lists')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
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
    .single();

  if (error) throw error;
  return data.id;
}

export async function getTargetUrlListId(urls: string[]) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(urls.join('|'))
  ).then(buf => Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  );

  const { data: existingList } = await supabase
    .from('target_url_lists')
    .select('id')
    .eq('hash', hash)
    .single();

  if (existingList) {
    return existingList.id;
  }

  const { data: newList, error } = await supabase
    .from('target_url_lists')
    .insert({ urls, hash })
    .select('id')
    .single();

  if (error) throw error;
  return newList.id;
}

export async function getProcessedSourceUrls(sourceUrls: string[], targetListId: string) {
  const { data, error } = await supabase
    .from('source_url_processing_status')
    .select('source_url, processed')
    .in('source_url', sourceUrls)
    .eq('target_list_id', targetListId);

  if (error) throw error;

  return new Map(
    data.map(({ source_url, processed }) => [source_url, processed])
  );
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

export async function hasProcessedSourceUrl(sourceUrl: string, targetUrls: string[]) {
  try {
    const targetListId = await getTargetUrlListId(targetUrls);
    const { data, error } = await supabase
      .from('source_url_processing_status')
      .select('processed')
      .eq('source_url', sourceUrl)
      .eq('target_list_id', targetListId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.processed || false;
  } catch (error) {
    console.error('Error checking processed source URL:', error);
    return false;
  }
}