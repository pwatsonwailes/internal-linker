import React, { useCallback, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import Papa from 'papaparse';

interface CSVUploadProps {
  onUpload: (data: string[][]) => void;
  label: string;
}

export function CSVUpload({ onUpload, label }: CSVUploadProps) {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFileName(file.name);
    setUploadProgress(0);

    Papa.parse(file, {
      skipEmptyLines: 'greedy',
      complete: (results) => {
        try {
          if (!results?.data || !Array.isArray(results.data)) {
            throw new Error('No data returned from CSV parser');
          }

          // Get the data rows (skip header row)
          const rows = results.data.slice(1) as string[][];

          // Validate that each row has exactly 2 elements
          const validRows = rows.filter(row => {
            if (row.length !== 2) {
              console.warn('Invalid row:', row);
              return false;
            }
            // Check that no element is empty
            return row.every(cell => cell.trim().length > 0);
          });

          if (validRows.length === 0) {
            throw new Error('No valid data found in CSV. Each row must have a URL and body text.');
          }

          // Set final progress and call onUpload
          setUploadProgress(100);
          onUpload(validRows);
          
          // Reset state after a short delay to show 100% completion
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
          }, 500);

        } catch (error) {
          const errorMessage = error instanceof Error 
            ? error.message 
            : 'Error processing CSV file. Please check the file format.';
          
          console.error('CSV Processing Error:', {
            message: errorMessage,
            error,
            fileName: file.name,
            fileSize: file.size
          });
          
          alert(errorMessage);
          setIsUploading(false);
          setUploadProgress(0);
        }
      },
      error: (error: Papa.ParseError) => {
        const errorMessage = `Error parsing CSV file: ${error.message || 'Unknown error'}. Please ensure the file is a valid CSV.`;
        console.error('CSV Parse Error:', {
          code: error.code,
          message: error.message,
          fileName: file.name,
          fileSize: file.size
        });
        alert(errorMessage);
        setIsUploading(false);
        setUploadProgress(0);
      }
    });
  }, [onUpload]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">{label}</h2>
      </div>
      
      <div className="flex items-center justify-center w-full">
        <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer 
          ${isUploading ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'} 
          ${fileName ? 'border-blue-300' : 'border-gray-300'}`}
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            {isUploading ? (
              <>
                <Loader2 className="w-8 h-8 mb-3 text-blue-500 animate-spin" />
                <p className="mb-2 text-sm text-gray-500">
                  Processing {fileName}...
                </p>
              </>
            ) : (
              <>
                <Upload className={`w-8 h-8 mb-3 ${fileName ? 'text-blue-500' : 'text-gray-400'}`} />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">
                    {fileName ? fileName : 'Click to upload CSV'}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {fileName ? 'Click to upload a different file' : 'CSV with url and body columns'}
                </p>
              </>
            )}
          </div>
          <input
            type="file"
            className="hidden"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </label>
      </div>

      {isUploading && (
        <div className="w-full">
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-center text-sm text-gray-600 mt-2">
            {uploadProgress}% Complete
          </p>
        </div>
      )}
    </div>
  );
}