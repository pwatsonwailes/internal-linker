import React from 'react';
import { Terminal } from 'lucide-react';

interface LogEntry {
  message: string;
  timestamp: Date;
  type: 'info' | 'error' | 'success';
}

interface ProcessingLogsProps {
  logs: LogEntry[];
  isVisible: boolean;
}

export function ProcessingLogs({ logs, isVisible }: ProcessingLogsProps) {
  if (!isVisible || logs.length === 0) return null;

  return (
    <div className="bg-gray-900 text-gray-100 rounded-lg shadow-lg overflow-hidden">
      <div className="sticky top-0 bg-gray-800 px-4 py-3 flex items-center gap-2 border-b border-gray-700">
        <Terminal size={20} />
        <h3 className="font-semibold">Processing Logs</h3>
      </div>
      
      <div className="p-4 max-h-[400px] overflow-y-auto">
        <div className="space-y-2 font-mono text-sm">
          {logs.map((log, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'success' ? 'text-green-400' :
                'text-gray-300'
              }`}
            >
              <span className="text-gray-500 whitespace-nowrap flex-shrink-0">
                {log.timestamp.toLocaleTimeString()}
              </span>
              <span className="break-words">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}