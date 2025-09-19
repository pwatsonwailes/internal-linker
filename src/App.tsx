import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CSVUpload } from './components/CSVUpload';
import { Results } from './components/Results';
import { ProcessingLogs } from './components/ProcessingLogs';
import { SimilarityResult, ProcessedUrl, WorkerTask, WorkerResponse } from './types';
import { ArrowRight, Loader2 } from 'lucide-react';
import WorkerPool from './utils/workerPool';
import { filterStopWordsForTopics } from './utils/stopwords';
import { preprocessUrl, clearPreprocessingCache } from './workers/modules/preprocessing';
import { processBatchInParallel } from './workers/modules/parallelProcessor';
import { 
    precomputeIDF, 
    calculateTFIDF, 
    clearVectorCache, 
    checkCorpusChanged,
    getTermIndices 
} from './workers/modules/vectorization';
import { 
    getTargetUrlListId, 
    getProcessedSourceUrls, 
    createTargetUrlList,
    batchGetSimilarityResults,
    storeSimilarityResult,
    markSourceUrlProcessed
} from './lib/supabase';

interface PrecomputedTargetData {
    processedTargets: ProcessedUrl[];
    idfMap: Map<string, number>;
    targetVectors: Float64Array[];
    vocabulary: string[];
    targetListId: string;
}

interface LogEntry {
  message: string;
  timestamp: Date;
  type: 'info' | 'error' | 'success';
}

type WorkerMessageType = 
  | { type: 'progress'; progress: number; message?: string; taskId?: string }
  | { type: 'complete'; results: SimilarityResult[]; taskId?: string }
  | { type: 'error'; message: string; taskId?: string }
  | { type: 'result'; result: SimilarityResult; taskId: string }
  | { type: 'log'; message: string; taskId?: string };

export default function App() {
  const [sourceUrls, setSourceUrls] = useState<string[][]>([]);
  const [targetUrls, setTargetUrls] = useState<string[][]>([]);
  const [results, setResults] = useState<SimilarityResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPrecomputing, setIsPrecomputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const workerPoolRef = useRef<WorkerPool | null>(null);
  const precomputedDataRef = useRef<PrecomputedTargetData | null>(null);
  const processingAbortControllerRef = useRef<AbortController | null>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    setLogs(prev => [...prev, { message, timestamp: new Date(), type }]);
  }, []);

  useEffect(() => {
    addLog('Initializing worker pool...');
    
    try {
      workerPoolRef.current = new WorkerPool(new URL('./workers/dynamic.worker.js', import.meta.url).href, undefined, { type: 'module' }); 
      
      // Test if workers are actually working by sending a test task
      const testTask = {
        id: 'test-task',
        payload: { test: true }
      };
      
      // Set a timeout to detect if workers are broken
      const testTimeout = setTimeout(() => {
        addLog('Workers appear to be broken (no response to test task). Falling back to main thread processing.', 'error');
        workerPoolRef.current?.shutdown();
        workerPoolRef.current = null;
      }, 2000);
      
      // Try to submit a test task
      try {
        const testPromise = workerPoolRef.current.addTask(testTask);
        testPromise.then(() => {
          clearTimeout(testTimeout);
          addLog(`Worker pool initialized with ${workerPoolRef.current?.getNumWorkers()} workers.`);
        }).catch(() => {
          clearTimeout(testTimeout);
          addLog('Workers failed test task. Falling back to main thread processing.', 'error');
          workerPoolRef.current?.shutdown();
          workerPoolRef.current = null;
        });
      } catch (error) {
        clearTimeout(testTimeout);
        addLog(`Failed to submit test task: ${error.message}. Falling back to main thread processing.`, 'error');
        workerPoolRef.current?.shutdown();
        workerPoolRef.current = null;
      }
      
    } catch (error) {
      addLog(`Failed to initialize worker pool: ${error.message}. Falling back to main thread processing.`, 'error');
      workerPoolRef.current = null;
    }

    return () => {
      addLog('Shutting down worker pool...');
      workerPoolRef.current?.shutdown();
      workerPoolRef.current = null;
      addLog('Worker pool shut down.');
    };
  }, [addLog]);

  const handleSourceUpload = useCallback((data: string[][]) => {
    addLog(`Loaded ${data.length} source URLs`, 'success');
    setSourceUrls(data);
    setResults([]);
  }, [addLog]);

  const handleTargetUpload = useCallback((data: string[][]) => {
    addLog(`Loaded ${data.length} target URLs`, 'success');
    setTargetUrls(data);
    setResults([]);
    precomputedDataRef.current = null;
    clearVectorCache(true);
  }, [addLog]);

  const precomputeTargetData = useCallback(async (): Promise<boolean> => {
    if (!targetUrls.length) {
      addLog('Cannot precompute: Target URLs missing.', 'error');
      return false;
    }
    if (precomputedDataRef.current && !(await checkCorpusChanged(targetUrls))) {
        addLog('Using previously precomputed target data.');
        return true;
    }

    setIsPrecomputing(true);
    setProgress(0);
    setLogs([]);
    addLog('Starting precomputation for target URLs...');
    
    try {
      addLog('Checking/Creating Supabase target list ID...');
      const sortedTargetUrls = targetUrls.map(([url]) => url).sort();
      let targetListId = await getTargetUrlListId(sortedTargetUrls);
      if (!targetListId) {
        targetListId = await createTargetUrlList(sortedTargetUrls);
        addLog(`Created new target list in Supabase with ID: ${targetListId}`);
      } else {
        addLog(`Using existing target list in Supabase with ID: ${targetListId}`);
      }

      addLog(`Preprocessing ${targetUrls.length} target URLs...`);
      clearPreprocessingCache();
      const processedTargets: ProcessedUrl[] = await processBatchInParallel(
        targetUrls,
        50,
        preprocessUrl,
        (completed, total) => {
          setProgress(10 + (completed / total) * 30);
          addLog(`Preprocessing target URLs (${completed}/${total})...`, 'info');
        }
      );
      addLog(`Finished preprocessing ${processedTargets.length} target URLs.`);
      
      addLog('Precomputing IDF map...');
      const targetDocs = processedTargets.map(t => t.doc);
      const idfMap = await precomputeIDF(targetDocs);
      const { terms: vocabulary } = getTermIndices();
      addLog(`IDF map computed for ${vocabulary.length} unique terms.`);
      setProgress(50);

      addLog('Calculating TF-IDF vectors for target URLs...');
      const targetVectors = new Array(processedTargets.length);
      for (let i = 0; i < processedTargets.length; i++) {
          targetVectors[i] = await calculateTFIDF(processedTargets[i].doc);
          if (i % 100 === 0 || i === processedTargets.length - 1) {
              setProgress(50 + ((i + 1) / processedTargets.length) * 40);
              addLog(`Calculating target vectors (${i + 1}/${processedTargets.length})...`);
          }
          if (i % 500 === 0) await new Promise(res => setTimeout(res, 0)); 
      }
      addLog(`Finished calculating ${targetVectors.length} target vectors.`);

      precomputedDataRef.current = {
        processedTargets,
        idfMap,
        targetVectors,
        vocabulary,
        targetListId
      };
      
      addLog('Precomputation complete.', 'success');
      setProgress(100);
      setIsPrecomputing(false);
      return true;

    } catch (error: any) {
      addLog(`Precomputation failed: ${error.message}`, 'error');
      setIsPrecomputing(false);
      setProgress(0);
      return false;
    }

  }, [targetUrls, addLog]);

  // Simple topic extraction function
  const extractSimpleTopics = (doc: string[]): string[] => {
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
  };

  // Main thread fallback processing function
  const processUrlInMainThread = useCallback(async (source: ProcessedUrl, targets: ProcessedUrl[], targetVectors: Float64Array[], idfMap: Map<string, number>, vocabulary: string[], targetListId: string): Promise<SimilarityResult> => {
    try {
      addLog(`Processing ${source.url} in main thread...`);
      
      // Import the necessary modules for main thread processing
      const { preprocessUrl } = await import('./workers/modules/preprocessing');
      const { processCandidates } = await import('./workers/modules/candidateProcessor');
      const { calculateTFIDF } = await import('./workers/modules/vectorization');
      
      // Calculate source vector
      const sourceVector = await calculateTFIDF(source.doc);
      
      if (!sourceVector || sourceVector.length === 0) {
        throw new Error('Failed to calculate source vector');
      }
      
      // Process candidates
      const candidateIndices = Array.from({ length: targets.length }, (_, i) => i);
      
      const results = await processCandidates(
        source,
        sourceVector,
        candidateIndices,
        targets,
        targetVectors
      );
      
      // Filter and sort results
      const validMatches = results
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
      
      const matches = validMatches;
      
      // Extract topics from source document
      const sourceTopics = extractSimpleTopics(source.doc || []);
      
      const result: SimilarityResult = {
        sourceUrl: source.url,
        sourceTitle: source.title,
        matches,
        topics: sourceTopics,
        shouldMarkProcessed: matches.length > 0
      };
      
      // Mark as processed if we have matches
      if (result.shouldMarkProcessed) {
        try {
          await markSourceUrlProcessed(source.url, targetListId);
        } catch (error) {
          console.error('Failed to mark URL as processed:', error);
        }
      }
      
      return result;
    } catch (error) {
      addLog(`Error processing ${source.url} in main thread: ${error.message}`, 'error');
      return {
        sourceUrl: source.url,
        sourceTitle: source.title,
        matches: [],
        topics: [],
        shouldMarkProcessed: false
      };
    }
  }, [addLog]);

  const compareUrls = useCallback(async () => {
    if (!workerPoolRef.current) {
        addLog('Worker pool not available. Using main thread processing.', 'info');
    }
    if (isProcessing) {
      addLog('Processing already in progress.', 'info');
      return;
    }

    if (!precomputedDataRef.current) {
        addLog('Precomputing target data first...');
        const success = await precomputeTargetData();
        if (!success) return;
         addLog('Precomputation done, starting comparison.');
    }
    
    const { processedTargets, idfMap, targetVectors, vocabulary, targetListId } = precomputedDataRef.current!;

    if (sourceUrls.length === 0 || processedTargets.length === 0) {
      addLog('Cannot compare: Missing source or valid target URLs', 'error');
      return;
    }

    setIsProcessing(true);
    setTasksCompleted(0); 
    setResults([]);
    addLog('Starting URL comparison process...');

    addLog('Checking Supabase cache for processed source URLs...');
    const sourceUrlsToCheck = sourceUrls.map(([url]) => url);
    const processedStatus = await getProcessedSourceUrls(sourceUrlsToCheck, targetListId);
    const cachedResultsMap = new Map<string, SimilarityResult[]>();

    const urlsToProcess: string[][] = [];
    const urlsAlreadyProcessed: string[] = [];

    sourceUrls.forEach(source => {
        if (processedStatus.get(source[0])) {
            urlsAlreadyProcessed.push(source[0]);
        } else {
            urlsToProcess.push(source);
        }
    });

    if (urlsAlreadyProcessed.length > 0) {
        addLog(`Fetching cached results for ${urlsAlreadyProcessed.length} source URLs...`);
        try {
            const cachedDbResults = await batchGetSimilarityResults(urlsAlreadyProcessed);
            const initialResults: SimilarityResult[] = [];
            urlsAlreadyProcessed.forEach(url => {
                const sourceInfo = sourceUrls.find(s => s[0] === url);
                const matches = cachedDbResults.get(url);
                if (sourceInfo && matches && matches.length > 0) {
                    // Extract source topics from the first match's source data
                    const firstMatch = matches[0];
                    const sourceTopics = extractSimpleTopics(firstMatch.sourceDoc || []);
                    
                    initialResults.push({
                        sourceUrl: url,
                        sourceTitle: sourceInfo[1] || url,
                        matches: matches,
                        topics: sourceTopics
                    });
                }
            });
            setResults(prev => [...prev, ...initialResults]);
            addLog(`Added ${initialResults.length} results from cache.`);
        } catch (error: any) {
            addLog(`Error fetching cached results: ${error.message}`, 'error');
        }
    }

    if (urlsToProcess.length === 0) {
        addLog('All source URLs were found in cache. Comparison complete.', 'success');
        setIsProcessing(false);
        setTotalTasks(0);
        setTasksCompleted(0);
        return;
    }
    
    addLog(`Processing ${urlsToProcess.length} new source URLs...`);
    setTotalTasks(urlsToProcess.length);

    addLog('Preprocessing source URLs...');
    const processedSources = await processBatchInParallel(
      urlsToProcess,
      20, 
      preprocessUrl,
      (completed, total) => {
        addLog(`Preprocessing source URLs (${completed}/${total})...`);
      }
    );
    addLog(`Finished preprocessing ${processedSources.length} source URLs.`);

    const submittedTaskIds = new Set<string>();
    const taskPromises: Promise<WorkerResponse<SimilarityResult>>[] = [];
    processingAbortControllerRef.current = new AbortController();

    processedSources.forEach((source, index) => {
        if (processingAbortControllerRef.current?.signal.aborted) return;

        const taskId = `task-${source.url}-${Date.now()}`;
        submittedTaskIds.add(taskId);
        addLog(`Submitting task ${index + 1}/${processedSources.length} (ID: ${taskId.substring(0, 10)}...)`);
        
        let taskPromise: Promise<{ type: 'result'; result: SimilarityResult; taskId: string }>;
        
        if (workerPoolRef.current) {
            // Use worker pool
            const taskData: WorkerTask<{
                source: ProcessedUrl;
                targets: ProcessedUrl[];
                targetVectors: Float64Array[];
                idfMap: Map<string, number>;
                vocabulary: string[];
                targetListId: string;
            }> = {
                id: taskId,
                payload: {
                    source: source,
                    targets: processedTargets,
                    targetVectors: targetVectors,
                    idfMap: idfMap,
                    vocabulary: vocabulary,
                    targetListId: targetListId,
                }
            };
            
            taskPromise = workerPoolRef.current.addTask<any, SimilarityResult>(taskData);
        } else {
            // Use main thread fallback
            taskPromise = processUrlInMainThread(source, processedTargets, targetVectors, idfMap, vocabulary, targetListId)
                .then(result => ({ type: 'result' as const, result, taskId }));
        }
        
        taskPromises.push(taskPromise);

        taskPromise.then(async response => {
            if (response?.result) {
                addLog(`Task ${taskId.substring(0,10)} completed successfully. Matches found: ${response.result.matches.length}`, 'success');
                setResults(prev => [...prev, response.result]);
            } else {
                 addLog(`Task ${taskId.substring(0,10)} completed with no significant matches.`);
            }
             setTasksCompleted(prev => prev + 1);
        }).catch(error => {
            addLog(`Task ${taskId.substring(0,10)} failed: ${error.message}`, 'error');
             setTasksCompleted(prev => prev + 1);
        }).finally(() => {
             submittedTaskIds.delete(taskId);
        });
    });

    Promise.allSettled(taskPromises).then(() => {
        addLog('All submitted tasks have settled (completed or failed).');
        setIsProcessing(false);
        if (processingAbortControllerRef.current?.signal.aborted) {
            addLog('Processing was aborted.', 'info');
        } else {
            addLog('Comparison finished.', 'success');
        }
        processingAbortControllerRef.current = null;
    });

  }, [sourceUrls, targetUrls, precomputeTargetData, addLog, isProcessing]);

  const handleCancelProcessing = () => {
        if (processingAbortControllerRef.current) {
            addLog('Attempting to cancel processing...', 'info');
            processingAbortControllerRef.current.abort();
            workerPoolRef.current?.cancelAllTasks();
      setIsProcessing(false);
        }
    };

  const overallProgress = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : (isProcessing ? 10 : 0);

  const isCompareEnabled = sourceUrls.length > 0 && targetUrls.length > 0 && !isProcessing && !isPrecomputing;
  const isLoading = isProcessing || isPrecomputing;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">URL Similarity Analyzer V2 (Worker Pool)</h1>
          <p className="mt-2 text-gray-600">
            Compare URLs using TF-IDF and Cosine Similarity with topic modeling
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8">
          <section className="bg-white rounded-lg shadow-md p-6">
            <div className="grid md:grid-cols-5 gap-6 items-center">
              <div className="md:col-span-2">
                <CSVUpload
                  onUpload={handleSourceUpload}
                  label="Source URLs"
                />
              </div>
              
              <div className="flex justify-center md:col-span-1">
                <ArrowRight size={24} className="text-gray-400" />
              </div>

              <div className="md:col-span-2">
                <CSVUpload
                  onUpload={handleTargetUpload}
                  label="Target URLs"
                />
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center space-y-6">
              <button
                onClick={compareUrls}
                disabled={!isCompareEnabled}
                className={`px-6 py-3 rounded-md transition-colors flex items-center gap-2 text-lg
                  ${isCompareEnabled 
                    ? 'bg-blue-500 text-white hover:bg-blue-600' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              >
                {isLoading && <Loader2 className="animate-spin" size={20} />}
                {isPrecomputing ? 'Precomputing...' : (isProcessing ? 'Processing...' : 'Compare URLs')}
              </button>
              
              {isLoading && (
                <div className="w-full max-w-lg space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>{isPrecomputing ? 'Precomputation Progress' : `Task Progress (${tasksCompleted}/${totalTasks})`}</span>
                      <span>{Math.round(isPrecomputing ? progress : overallProgress)}%</span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${isPrecomputing ? progress : overallProgress}%` }}
                      />
                    </div>
                  </div>
                   {isProcessing && totalTasks > 0 && (
                       <button 
                           onClick={handleCancelProcessing}
                           className="text-sm text-red-600 hover:text-red-800"
                       >
                           Cancel Processing
                       </button>
                   )}
                </div>
              )}
            </div>
          </section>

          {/* Processing Logs - shown during processing, hidden after completion */}
          {(isLoading || (logs.length > 0 && !isProcessing)) && (
            <section className="mb-6">
              <ProcessingLogs 
                logs={logs} 
                isVisible={true}
              />
            </section>
          )}
          
          {/* Results - shown after processing starts */}
          {results.length > 0 && (
            <section>
              <Results results={results} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}