import { WorkerTask, WorkerResponse } from '../types';

interface WorkerInfo {
    worker: Worker;
    isBusy: boolean;
    taskId: string | null;
    workerId: string;
}

export class WorkerPool {
    private workers: WorkerInfo[] = [];
    private taskQueue: Array<{ task: WorkerTask<any>; resolve: (value: WorkerResponse<any>) => void; reject: (reason?: any) => void }> = [];
    private taskPromises: Map<string, { resolve: (value: WorkerResponse<any>) => void; reject: (reason?: any) => void }> = new Map();
    private shuttingDown: boolean = false;
    private workerScriptUrl: string | URL;
    private workerOptions?: WorkerOptions;

    constructor(workerScriptUrl: string | URL, numWorkers?: number, workerOptions?: WorkerOptions) {
        // Optimize worker count based on CPU cores and task type
        const cpuCores = navigator.hardwareConcurrency || 4;
        const maxWorkers = numWorkers || Math.min(cpuCores * 2, 16); // Use 2x CPU cores, max 16
        this.shuttingDown = false;
        this.workerScriptUrl = workerScriptUrl;
        this.workerOptions = workerOptions;

        console.log(`[WorkerPool] Initializing with ${maxWorkers} workers for script: ${workerScriptUrl}`);

        // Validate worker script URL
        try {
            new URL(workerScriptUrl.toString(), window.location.origin);
        } catch (error) {
            throw new Error(`[WorkerPool] Invalid worker script URL: ${workerScriptUrl}`);
        }

        for (let i = 0; i < maxWorkers; i++) {
            try {
                const worker = new Worker(workerScriptUrl, workerOptions);
                const workerId = `worker-${i}-${Date.now()}`;
                
                const workerInfo: WorkerInfo = { 
                    worker, 
                    isBusy: false, 
                    taskId: null,
                    workerId 
                };
                this.workers.push(workerInfo);

                worker.onmessage = (event: MessageEvent) => {
                    try {
                        this.handleWorkerMessage(workerInfo, event);
                    } catch (error) {
                        console.error(`[WorkerPool][${workerId}] Error in message handler:`, error);
                        this.handleWorkerError(
                            workerInfo,
                            new ErrorEvent('error', {
                                error,
                                message: `Message handler error: ${error.message}`
                            }),
                            workerInfo.taskId
                        );
                    }
                };
                
                worker.onerror = (event: ErrorEvent) => {
                    const currentTaskId = workerInfo.taskId;
                    workerInfo.taskId = null;
                    this.handleWorkerError(workerInfo, event, currentTaskId);
                };

                worker.onmessageerror = (event: MessageEvent) => {
                    const currentTaskId = workerInfo.taskId;
                    workerInfo.taskId = null;
                    this.handleWorkerError(
                        workerInfo, 
                        new ErrorEvent('messageerror', { 
                            message: `Malformed message received for task ${currentTaskId || 'unknown'} in worker ${workerId}`
                        }),
                        currentTaskId
                    );
                };

                console.log(`[WorkerPool] Successfully initialized worker ${workerId}`);

            } catch (error) {
                console.error(`[WorkerPool] Failed to create worker ${i}:`, error);
                // Continue creating other workers but throw if none can be created
                if (this.workers.length === 0 && i === maxWorkers - 1) {
                    throw new Error(`[WorkerPool] Failed to create any workers: ${error.message}`);
                }
            }
        }
        console.log(`[WorkerPool] Successfully created ${this.workers.length} workers.`);
    }

    private handleWorkerMessage(workerInfo: WorkerInfo, event: MessageEvent): void {
        const message = event.data;
        const taskId = message?.taskId;

        if (!taskId) {
            console.warn(`[WorkerPool][${workerInfo.workerId}] Received message without taskId:`, message);
            return;
        }

        const promiseCallbacks = this.taskPromises.get(taskId);

        if (message.type === 'result') {
            console.log(`[WorkerPool][${workerInfo.workerId}] Received result for task ${taskId}`);
            promiseCallbacks?.resolve({ type: 'result', result: message.result, taskId });
            this.taskPromises.delete(taskId);
            this.markWorkerIdle(workerInfo);
            this.processQueue(); // Ensure queue continues processing
        } else if (message.type === 'error') {
            console.error(`[WorkerPool][${workerInfo.workerId}] Received error from worker for task ${taskId}:`, message.message);
            promiseCallbacks?.reject(new Error(message.message));
            this.taskPromises.delete(taskId);
            this.markWorkerIdle(workerInfo);
            this.processQueue(); // Ensure queue continues processing
        } else if (message.type === 'progress' || message.type === 'log') {
            console.log(`[WorkerPool][${workerInfo.workerId}][Task ${taskId}] ${message.type}:`, message.message || message.progress);
        } else {
            console.warn(`[WorkerPool][${workerInfo.workerId}] Received unknown message type from worker ${taskId}:`, message);
        }
    }
    
    private handleWorkerError(workerInfo: WorkerInfo, error: ErrorEvent, taskId?: string | null): void {
        const effectiveTaskId = taskId || workerInfo.taskId || this.extractTaskIdFromError(error);
        
        const errorDetails = {
            type: error.type,
            message: error.message || 'Unknown error occurred',
            filename: error.filename,
            lineno: error.lineno,
            colno: error.colno,
            error: error.error
        };

        // Enhanced error logging
        console.error(`[WorkerPool][${workerInfo.workerId}] Worker error occurred:`, {
            taskId: effectiveTaskId || 'unknown',
            errorType: error.type,
            message: error.message,
            filename: error.filename,
            lineNumber: error.lineno,
            columnNumber: error.colno,
            error: error.error,
            stack: error.error?.stack
        });

        const errorMessage = error.error instanceof Error 
            ? `${error.error.message}\nStack: ${error.error.stack}`
            : `Worker error (${error.type}): ${errorDetails.message}`;

        if (effectiveTaskId) {
            const promiseCallbacks = this.taskPromises.get(effectiveTaskId);
            if (promiseCallbacks) {
                promiseCallbacks.reject(new Error(errorMessage));
                this.taskPromises.delete(effectiveTaskId);
            }
        } else {
            console.warn(`[WorkerPool][${workerInfo.workerId}] Error without associated task:`, errorMessage);
        }

        this.markWorkerIdle(workerInfo);

        if (this.isWorkerCriticalError(error)) {
            console.log(`[WorkerPool][${workerInfo.workerId}] Critical error detected, attempting worker restart...`);
            this.restartWorker(workerInfo).then(() => this.processQueue());
        } else {
            this.processQueue(); // Ensure queue continues processing
        }
    }

    private extractTaskIdFromError(error: ErrorEvent): string | null {
        const taskIdMatch = error.message?.match(/task(?:\s+|_|-)id[:\s]+([a-zA-Z0-9-]+)/i);
        return taskIdMatch ? taskIdMatch[1] : null;
    }

    private isWorkerCriticalError(error: ErrorEvent): boolean {
        const criticalErrors = [
            'Failed to load script',
            'Out of memory',
            'Worker terminated',
            'SecurityError',
            'NetworkError'
        ];
        
        return error.type === 'error' && (
            criticalErrors.some(errMsg => error.message?.includes(errMsg)) ||
            error.error instanceof TypeError ||
            error.error instanceof ReferenceError
        );
    }

    private async restartWorker(workerInfo: WorkerInfo): Promise<void> {
        try {
            console.log(`[WorkerPool][${workerInfo.workerId}] Attempting worker restart...`);
            
            // Store original worker script URL from constructor
            const originalWorkerScript = this.workerScriptUrl;
            const originalWorkerOptions = this.workerOptions;
            
            // Terminate old worker
            const oldWorker = workerInfo.worker;
            oldWorker.terminate();
            
            // Create new worker with same configuration
            const newWorker = new Worker(originalWorkerScript, originalWorkerOptions);
            
            // Set up event handlers
            newWorker.onmessage = (event: MessageEvent) => {
                try {
                    this.handleWorkerMessage(workerInfo, event);
                } catch (error) {
                    console.error(`[WorkerPool][${workerInfo.workerId}] Error in restarted worker message handler:`, error);
                    this.handleWorkerError(
                        workerInfo,
                        new ErrorEvent('error', {
                            error,
                            message: `Restarted worker message handler error: ${error.message}`
                        }),
                        workerInfo.taskId
                    );
                }
            };
            
            newWorker.onerror = (event: ErrorEvent) => {
                const currentTaskId = workerInfo.taskId;
                workerInfo.taskId = null;
                this.handleWorkerError(workerInfo, event, currentTaskId);
            };

            newWorker.onmessageerror = (event: MessageEvent) => {
                const currentTaskId = workerInfo.taskId;
                workerInfo.taskId = null;
                this.handleWorkerError(
                    workerInfo, 
                    new ErrorEvent('messageerror', { 
                        message: `Malformed message received in restarted worker for task ${currentTaskId || 'unknown'}`
                    }),
                    currentTaskId
                );
            };
            
            // Update worker info
            workerInfo.worker = newWorker;
            workerInfo.isBusy = false;
            workerInfo.taskId = null;
            
            console.log(`[WorkerPool][${workerInfo.workerId}] Worker successfully restarted`);
        } catch (error) {
            console.error(`[WorkerPool][${workerInfo.workerId}] Failed to restart worker:`, error);
            throw new Error(`Failed to restart worker ${workerInfo.workerId}: ${error.message}`);
        }
    }
    
    private markWorkerIdle(workerInfo: WorkerInfo): void {
        if (workerInfo.isBusy) {
            workerInfo.isBusy = false;
            workerInfo.taskId = null;
            this.processQueue(); // Ensure queue continues processing
        }
    }

    private findAvailableWorker(): WorkerInfo | null {
        return this.workers.find(w => !w.isBusy) || null;
    }

    private processQueue(): void {
        if (this.taskQueue.length === 0 || this.shuttingDown) {
            return;
        }

        const availableWorkerInfo = this.findAvailableWorker();
        if (availableWorkerInfo) {
            const { task, resolve, reject } = this.taskQueue.shift()!;
            
            availableWorkerInfo.isBusy = true;
            availableWorkerInfo.taskId = task.id;
            this.taskPromises.set(task.id, { resolve, reject });

            try {
                console.log(`[WorkerPool][${availableWorkerInfo.workerId}] Assigning task ${task.id} to worker (Queue length: ${this.taskQueue.length})`);
                availableWorkerInfo.worker.postMessage(task);
            } catch (error) {
                console.error(`[WorkerPool][${availableWorkerInfo.workerId}] Error posting message to worker for task ${task.id}:`, error);
                reject(error);
                this.taskPromises.delete(task.id);
                this.markWorkerIdle(availableWorkerInfo);
            }
        } else {
            console.log(`[WorkerPool] No available workers, queue length: ${this.taskQueue.length}`);
        }
    }

    public addTask<T, R>(task: WorkerTask<T>): Promise<WorkerResponse<R>> {
        if (this.shuttingDown) {
            return Promise.reject(new Error("WorkerPool is shutting down."));
        }
        return new Promise<WorkerResponse<any>>((resolve, reject) => {
            console.log(`[WorkerPool] Queuing task ${task.id} (Current queue length: ${this.taskQueue.length})`);
            this.taskQueue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    public cancelAllTasks(): void {
        console.log(`[WorkerPool] Cancelling all tasks. Queue length: ${this.taskQueue.length}, Active tasks: ${this.taskPromises.size}`);
        
        // Clear task queue
        this.taskQueue = [];

        // Reject all pending promises
        this.taskPromises.forEach(({ reject }, taskId) => {
            console.log(`[WorkerPool] Rejecting promise for task ${taskId} due to cancellation`);
            reject(new Error("Task cancelled by user."));
        });
        this.taskPromises.clear();

        // Handle busy workers
        const busyWorkers = this.workers.filter(w => w.isBusy);
        console.log(`[WorkerPool] Found ${busyWorkers.length} busy workers to handle`);

        busyWorkers.forEach(workerInfo => {
            const currentTaskId = workerInfo.taskId;
            console.warn(`[WorkerPool][${workerInfo.workerId}] Terminating busy worker for task ${currentTaskId} due to cancellation`);
            
            // Terminate the worker
            try {
                workerInfo.worker.terminate();
            } catch (error) {
                console.error(`[WorkerPool][${workerInfo.workerId}] Error terminating worker:`, error);
            }
            
            // Reset worker state immediately
            workerInfo.isBusy = false;
            workerInfo.taskId = null;
            
            // Restart worker asynchronously to avoid blocking
            this.restartWorker(workerInfo).catch(error => {
                console.error(`[WorkerPool][${workerInfo.workerId}] Error restarting worker after cancellation:`, error);
            });
        });

        console.log(`[WorkerPool] Task cancellation complete`);
    }

    public async shutdown(): Promise<void> {
        console.log('[WorkerPool] Initiating shutdown...');
        this.shuttingDown = true;
        this.cancelAllTasks();

        await new Promise(resolve => setTimeout(resolve, 100));

        this.workers.forEach(workerInfo => {
            try {
                console.log(`[WorkerPool][${workerInfo.workerId}] Terminating worker`);
                workerInfo.worker.terminate();
            } catch (error) {
                console.warn(`[WorkerPool][${workerInfo.workerId}] Error terminating worker during shutdown:`, error);
            }
        });
        this.workers = [];
        console.log('[WorkerPool] Shutdown complete');
    }

    public getNumWorkers(): number {
        return this.workers.length;
    }
}

export default WorkerPool;