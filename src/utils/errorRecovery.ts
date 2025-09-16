/**
 * Error Recovery and Monitoring System
 * 
 * This module provides comprehensive error handling, recovery mechanisms,
 * and monitoring for the application.
 */

interface ErrorContext {
  component: string;
  operation: string;
  url?: string;
  taskId?: string;
  timestamp: number;
  userAgent: string;
  memoryUsage?: number;
}

interface ErrorReport {
  message: string;
  stack?: string;
  context: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
}

class ErrorRecoveryManager {
  private errorHistory: ErrorReport[] = [];
  private maxHistoryLength = 100;
  private errorCallbacks: Array<(error: ErrorReport) => void> = [];
  private recoveryAttempts = new Map<string, number>();
  private maxRecoveryAttempts = 3;

  /**
   * Report an error with context and attempt recovery
   */
  reportError(
    error: Error,
    context: Partial<ErrorContext>,
    severity: ErrorReport['severity'] = 'medium'
  ): boolean {
    const errorReport: ErrorReport = {
      message: error.message,
      stack: error.stack,
      context: {
        component: context.component || 'unknown',
        operation: context.operation || 'unknown',
        url: context.url,
        taskId: context.taskId,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        memoryUsage: this.getMemoryUsage(),
        ...context
      },
      severity,
      recoverable: this.isRecoverable(error, context)
    };

    // Add to history
    this.errorHistory.push(errorReport);
    if (this.errorHistory.length > this.maxHistoryLength) {
      this.errorHistory.shift();
    }

    // Log error
    this.logError(errorReport);

    // Notify callbacks
    this.errorCallbacks.forEach(callback => {
      try {
        callback(errorReport);
      } catch (callbackError) {
        console.error('[ErrorRecovery] Error in callback:', callbackError);
      }
    });

    // Attempt recovery if possible
    if (errorReport.recoverable) {
      return this.attemptRecovery(errorReport);
    }

    return false;
  }

  /**
   * Attempt to recover from an error
   */
  private attemptRecovery(errorReport: ErrorReport): boolean {
    const { context, message } = errorReport;
    const recoveryKey = `${context.component}-${context.operation}`;
    
    const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
    if (attempts >= this.maxRecoveryAttempts) {
      console.error(`[ErrorRecovery] Max recovery attempts reached for ${recoveryKey}`);
      return false;
    }

    this.recoveryAttempts.set(recoveryKey, attempts + 1);
    console.log(`[ErrorRecovery] Attempting recovery for ${recoveryKey} (attempt ${attempts + 1})`);

    try {
      // Component-specific recovery strategies
      switch (context.component) {
        case 'worker':
          return this.recoverWorkerError(errorReport);
        case 'supabase':
          return this.recoverDatabaseError(errorReport);
        case 'tfidf':
          return this.recoverTFIDFError(errorReport);
        case 'csv':
          return this.recoverCSVError(errorReport);
        case 'memory':
          return this.recoverMemoryError(errorReport);
        default:
          return this.recoverGenericError(errorReport);
      }
    } catch (recoveryError) {
      console.error(`[ErrorRecovery] Recovery failed for ${recoveryKey}:`, recoveryError);
      return false;
    }
  }

  /**
   * Recover from worker-related errors
   */
  private recoverWorkerError(errorReport: ErrorReport): boolean {
    const { context, message } = errorReport;
    
    if (message.includes('Worker terminated') || message.includes('NetworkError')) {
      console.log('[ErrorRecovery] Attempting worker restart...');
      // Worker restart is handled by WorkerPool
      return true;
    }
    
    if (message.includes('Out of memory')) {
      console.log('[ErrorRecovery] Attempting memory cleanup...');
      // Import and use memory manager
      import('./memoryManager').then(({ performCleanup }) => {
        performCleanup('aggressive');
      });
      return true;
    }

    return false;
  }

  /**
   * Recover from database-related errors
   */
  private recoverDatabaseError(errorReport: ErrorReport): boolean {
    const { message } = errorReport;
    
    if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
      console.log('[ErrorRecovery] Network error detected, will retry with backoff');
      return true; // Retry mechanism is handled by withRetry in supabase.ts
    }
    
    if (message.includes('rate limit') || message.includes('429')) {
      console.log('[ErrorRecovery] Rate limit detected, implementing delay');
      return true; // Handled by retry mechanism
    }

    return false;
  }

  /**
   * Recover from TF-IDF computation errors
   */
  private recoverTFIDFError(errorReport: ErrorReport): boolean {
    const { message } = errorReport;
    
    if (message.includes('Invalid input') || message.includes('empty')) {
      console.log('[ErrorRecovery] Input validation error, skipping invalid data');
      return true;
    }
    
    if (message.includes('Vector dimensions mismatch')) {
      console.log('[ErrorRecovery] Vector mismatch, clearing caches');
      import('../utils/tfidf').then(({ clearAllCaches }) => {
        clearAllCaches();
      });
      return true;
    }

    return false;
  }

  /**
   * Recover from CSV processing errors
   */
  private recoverCSVError(errorReport: ErrorReport): boolean {
    const { message } = errorReport;
    
    if (message.includes('parsing') || message.includes('format')) {
      console.log('[ErrorRecovery] CSV format error, providing user guidance');
      return true; // UI should show helpful error message
    }

    return false;
  }

  /**
   * Recover from memory-related errors
   */
  private recoverMemoryError(errorReport: ErrorReport): boolean {
    console.log('[ErrorRecovery] Memory error, performing emergency cleanup');
    import('./memoryManager').then(({ performCleanup }) => {
      performCleanup('aggressive');
    });
    return true;
  }

  /**
   * Generic error recovery
   */
  private recoverGenericError(errorReport: ErrorReport): boolean {
    const { severity } = errorReport;
    
    if (severity === 'critical') {
      console.log('[ErrorRecovery] Critical error, performing full cleanup');
      this.performEmergencyRecovery();
      return true;
    }

    return false;
  }

  /**
   * Perform emergency recovery procedures
   */
  private performEmergencyRecovery(): void {
    console.warn('[ErrorRecovery] Performing emergency recovery...');
    
    // Clear all caches
    import('../utils/tfidf').then(({ clearAllCaches }) => {
      clearAllCaches();
    });
    
    // Clear recovery attempts to allow fresh tries
    this.recoveryAttempts.clear();
    
    // Force garbage collection
    if ('gc' in window && typeof (window as any).gc === 'function') {
      try {
        (window as any).gc();
      } catch (error) {
        console.warn('[ErrorRecovery] Failed to force GC:', error);
      }
    }
  }

  /**
   * Check if an error is recoverable
   */
  private isRecoverable(error: Error, context: Partial<ErrorContext>): boolean {
    const { message } = error;
    const component = context.component;
    
    // Always recoverable errors
    const recoverablePatterns = [
      'network',
      'fetch',
      'timeout',
      'rate limit',
      'Worker terminated',
      'Out of memory',
      'Vector dimensions mismatch',
      'Invalid input'
    ];
    
    if (recoverablePatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()))) {
      return true;
    }
    
    // Component-specific recovery rules
    switch (component) {
      case 'worker':
        return !message.includes('SecurityError');
      case 'supabase':
        return !message.includes('authentication');
      case 'csv':
        return message.includes('parsing') || message.includes('format');
      default:
        return false;
    }
  }

  /**
   * Log error with appropriate level
   */
  private logError(errorReport: ErrorReport): void {
    const { message, context, severity } = errorReport;
    const logMessage = `[${context.component}/${context.operation}] ${message}`;
    
    switch (severity) {
      case 'low':
        console.info(logMessage, errorReport);
        break;
      case 'medium':
        console.warn(logMessage, errorReport);
        break;
      case 'high':
      case 'critical':
        console.error(logMessage, errorReport);
        break;
    }
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number | undefined {
    if ('memory' in performance && typeof (performance as any).memory === 'object') {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    }
    return undefined;
  }

  /**
   * Register error callback
   */
  onError(callback: (error: ErrorReport) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    recentErrors: number;
    errorsByComponent: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    recoverySuccessRate: number;
  } {
    const recent = this.errorHistory.filter(e => Date.now() - e.context.timestamp < 300000); // Last 5 minutes
    
    const errorsByComponent = this.errorHistory.reduce((acc, error) => {
      acc[error.context.component] = (acc[error.context.component] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const errorsBySeverity = this.errorHistory.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const recoverableErrors = this.errorHistory.filter(e => e.recoverable).length;
    const recoverySuccessRate = recoverableErrors > 0 ? 
      (recoverableErrors / this.errorHistory.length) * 100 : 0;
    
    return {
      totalErrors: this.errorHistory.length,
      recentErrors: recent.length,
      errorsByComponent,
      errorsBySeverity,
      recoverySuccessRate
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
    this.recoveryAttempts.clear();
    console.log('[ErrorRecovery] Error history cleared');
  }
}

// Create singleton instance
const errorRecoveryManager = new ErrorRecoveryManager();

// Export singleton methods
export const reportError = (
  error: Error, 
  context: Partial<ErrorContext>, 
  severity?: ErrorReport['severity']
) => errorRecoveryManager.reportError(error, context, severity);

export const onError = (callback: (error: ErrorReport) => void) => 
  errorRecoveryManager.onError(callback);

export const getErrorStats = () => errorRecoveryManager.getErrorStats();

export const clearErrorHistory = () => errorRecoveryManager.clearHistory();

// Export types
export type { ErrorContext, ErrorReport };

// Global error handlers
window.addEventListener('error', (event) => {
  reportError(
    new Error(event.message),
    {
      component: 'global',
      operation: 'runtime',
      url: event.filename
    },
    'high'
  );
});

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  reportError(
    error,
    {
      component: 'global',
      operation: 'promise'
    },
    'high'
  );
});
