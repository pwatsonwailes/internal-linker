import { WorkerTask, WorkerResponse } from '../types'; // Use types consistent with App.tsx

// Removed internal Task interface, using WorkerTask/WorkerResponse generics instead

// Interface for internal tracking
interface WorkerInfo {
    worker: Worker;
    isBusy: boolean;
    taskId: string | null; // Track current task ID
}

export class WorkerPool {
    private workers: WorkerInfo[] = [];
    private taskQueue: Array<{ task: WorkerTask<any>; resolve: (value: WorkerResponse<any>) => void; reject: (reason?: any) => void }> = [];
    private taskPromises: Map<string, { resolve: (value: WorkerResponse<any>) => void; reject: (reason?: any) => void }> = new Map();
    private shuttingDown: boolean = false;

    // Removed GPU kernel properties and complex metrics

    constructor(workerScriptUrl: string | URL, numWorkers?: number, workerOptions?: WorkerOptions) {
        const maxWorkers = numWorkers || navigator.hardwareConcurrency || 4;
        this.shuttingDown = false;

        console.log(`[WorkerPool] Initializing with ${maxWorkers} workers for script: ${workerScriptUrl}`);

        // Removed GPU kernel initialization logic

        for (let i = 0; i < maxWorkers; i++) {
            try {
                // Ensure workerScriptUrl is a valid URL or path for the Worker constructor
                const worker = new Worker(workerScriptUrl, workerOptions); 
                
                const workerInfo: WorkerInfo = { worker, isBusy: false, taskId: null };
                this.workers.push(workerInfo);

                worker.onmessage = (event: MessageEvent) => this.handleWorkerMessage(workerInfo, event);
                worker.onerror = (event: ErrorEvent) => this.handleWorkerError(workerInfo, event);
                worker.onmessageerror = (event: MessageEvent) => {
                     console.error(`[WorkerPool] Worker message error:`, event);
                     this.handleWorkerError(workerInfo, new ErrorEvent('messageerror', { message: 'Malformed message received' }));
                };

            } catch (error) {
                 console.error(`[WorkerPool] Failed to create worker ${i}:`, error);
                 // Handle error appropriately - maybe throw or log and continue with fewer workers?
            }
        }
         console.log(`[WorkerPool] Successfully created ${this.workers.length} workers.`);
    }

    private handleWorkerMessage(workerInfo: WorkerInfo, event: MessageEvent): void {
        const message = event.data; // Assuming message has { type: string, taskId: string, ... }
        const taskId = message?.taskId; // Get taskId from the message

        if (!taskId) {
            console.warn(`[WorkerPool] Received message from worker without taskId:`, message);
             // Handle untracked messages? Maybe global logs?
            return;
        }

        const promiseCallbacks = this.taskPromises.get(taskId);

        if (message.type === 'result') {
            console.log(`[WorkerPool] Received result for task ${taskId}`);
            promiseCallbacks?.resolve({ type: 'result', result: message.result, taskId });
            this.taskPromises.delete(taskId); // Task completed successfully
            this.markWorkerIdle(workerInfo);
        } else if (message.type === 'error') {
             console.error(`[WorkerPool] Received error from worker for task ${taskId}:`, message.message);
            promiseCallbacks?.reject(new Error(message.message)); // Reject promise with error
            this.taskPromises.delete(taskId); // Task completed with error
            this.markWorkerIdle(workerInfo);
        } else if (message.type === 'progress' || message.type === 'log') {
            // Handle progress/log messages (e.g., emit event, log to console)
            // These typically don't resolve/reject the main task promise
            console.log(`[WorkerPool][Task ${taskId}] ${message.type}:`, message.message || message.progress);
        } else {
            console.warn(`[WorkerPool] Received unknown message type from worker ${taskId}:`, message);
        }
    }
    
    private handleWorkerError(workerInfo: WorkerInfo, error: ErrorEvent): void {
        console.error(`[WorkerPool] Worker error occurred (Task ID: ${workerInfo.taskId || 'unknown'}):`, error.message, error);
        const taskId = workerInfo.taskId;
        
        if (taskId) {
            const promiseCallbacks = this.taskPromises.get(taskId);
            promiseCallbacks?.reject(new Error(`Worker error: ${error.message}`)); // Reject the associated task promise
            this.taskPromises.delete(taskId);
        } else {
            // Handle error for an idle worker? Maybe try to replace the worker?
             console.error(`[WorkerPool] Error from idle worker or unknown task.`);
        }

        // Mark worker as idle, potentially remove/replace it later
        this.markWorkerIdle(workerInfo); 
        // Consider more robust error handling (e.g., restarting worker)
    }
    
    private markWorkerIdle(workerInfo: WorkerInfo): void {
         if (workerInfo.isBusy) {
             workerInfo.isBusy = false;
             workerInfo.taskId = null;
             // Process next task from queue if available
             this.processQueue(); 
         }
    }

    // Simple round-robin or find first available worker
    private findAvailableWorker(): WorkerInfo | null {
        return this.workers.find(w => !w.isBusy) || null;
    }

    // Process the next task in the queue if a worker is available
    private processQueue(): void {
        if (this.taskQueue.length === 0 || this.shuttingDown) {
      return;
    }

        const availableWorkerInfo = this.findAvailableWorker();
        if (availableWorkerInfo) {
            const { task, resolve, reject } = this.taskQueue.shift()!; // Get the next task
            
            availableWorkerInfo.isBusy = true;
            availableWorkerInfo.taskId = task.id; // Track assigned task ID
            this.taskPromises.set(task.id, { resolve, reject }); // Store promise callbacks

            try {
                console.log(`[WorkerPool] Assigning task ${task.id} to worker.`);
                availableWorkerInfo.worker.postMessage(task); // Send the whole task object
            } catch (error) {
                 console.error(`[WorkerPool] Error posting message to worker for task ${task.id}:`, error);
                 reject(error); // Reject the promise if postMessage fails
                 this.taskPromises.delete(task.id);
                 this.markWorkerIdle(availableWorkerInfo);
        }
      } else {
             console.log("[WorkerPool] No available workers, queue length:", this.taskQueue.length);
        }
    }

    // Public method to add tasks - matches App.tsx usage
    public addTask<T, R>(task: WorkerTask<T>): Promise<WorkerResponse<R>> {
        if (this.shuttingDown) {
            return Promise.reject(new Error("WorkerPool is shutting down."));
        }
        // Use a type assertion if necessary, assuming WorkerResponse<any> covers all cases
        return new Promise<WorkerResponse<any>>((resolve, reject) => {
            console.log(`[WorkerPool] Queuing task ${task.id}`);
            this.taskQueue.push({ task, resolve, reject });
            this.processQueue(); // Attempt to process immediately
        });
    }

    // Basic cancellation - tries to clear queue and terminate workers
    public cancelAllTasks(): void {
        console.log(`[WorkerPool] Cancelling all tasks. Queue length: ${this.taskQueue.length}`);
        this.taskQueue = []; // Clear pending tasks

        // Reject promises for tasks that were already sent to workers and are being tracked
        this.taskPromises.forEach(({ reject }, taskId) => {
            console.log(`[WorkerPool] Rejecting promise for active/pending task ${taskId} due to cancellation.`);
            reject(new Error("Task cancelled by user."));
        });
        this.taskPromises.clear();

        // Attempt to signal workers (basic termination)
        // A more advanced approach would involve sending an 'abort' message
        this.workers.forEach(workerInfo => {
            if (workerInfo.isBusy) {
                console.warn(`[WorkerPool] Terminating busy worker for task ${workerInfo.taskId} due to cancellation.`);
                // Terminating might abruptly stop processing. Consider sending a message first if workers support it.
                 workerInfo.worker.terminate(); 
                 // Re-create worker? Or handle potential errors?
                 // For simplicity here, we just terminate. The pool might become unusable after this.
            }
            workerInfo.isBusy = false;
            workerInfo.taskId = null;
        });
        // It might be better to call shutdown() here if cancellation means stopping everything.
    }

    // Shutdown method
    public async shutdown(): Promise<void> {
        console.log('[WorkerPool] Shutting down...');
        this.shuttingDown = true;
        this.cancelAllTasks(); // Clear queue and reject pending promises

        // Wait for any potentially remaining worker activity to cease (best effort)
        await new Promise(resolve => setTimeout(resolve, 100)); 

        this.workers.forEach(workerInfo => {
            try {
                console.log(`[WorkerPool] Terminating worker.`);
                workerInfo.worker.terminate();
      } catch (error) {
                console.warn('[WorkerPool] Error terminating worker during shutdown:', error);
      }
    });
    this.workers = [];
         console.log('[WorkerPool] Shutdown complete.');
    }

    // Helper to get number of workers
    public getNumWorkers(): number {
        return this.workers.length;
    }
}

// Export default for compatibility with App.tsx import
export default WorkerPool;