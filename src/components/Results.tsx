import React, { useState, useMemo } from 'react';
import { SimilarityResult, TopicGroup, UrlGroup } from '../types';
import { Search, ChevronDown, ChevronRight, ListTree, List, Download } from 'lucide-react';

interface ResultsProps {
  results: SimilarityResult[];
}

const ITEMS_PER_PAGE = 10;

function groupByTopics(results: SimilarityResult[]): TopicGroup[] {
  const topicMap = new Map<string, Set<{
    url: string;
    matches?: SimilarityResult['matches'];
  }>>();

  results.forEach(result => {
    // Ensure topics array exists and is valid
    if (result.topics && Array.isArray(result.topics)) {
      result.topics.forEach(topic => {
        if (topic && typeof topic === 'string') {
          if (!topicMap.has(topic)) {
            topicMap.set(topic, new Set());
          }
          topicMap.get(topic)!.add({
            url: result.sourceUrl,
            matches: result.matches
          });
        }
      });
    }

    // Ensure matches array exists and is valid
    if (result.matches && Array.isArray(result.matches)) {
      result.matches.forEach(match => {
        if (match && match.topics && Array.isArray(match.topics)) {
          match.topics.forEach(topic => {
            if (topic && typeof topic === 'string') {
              if (!topicMap.has(topic)) {
                topicMap.set(topic, new Set());
              }
              topicMap.get(topic)!.add({ url: match.url });
            }
          });
        }
      });
    }
  });

  return Array.from(topicMap.entries())
    .map(([topic, urls]) => ({
      topic,
      urls: Array.from(urls)
    }))
    .sort((a, b) => b.urls.length - a.urls.length);
}

function groupByUrls(results: SimilarityResult[]): UrlGroup[] {
  return results.map(result => ({
    url: result.sourceUrl,
    topics: result.topics || [],
    matches: result.matches || []
  }));
}

export function Results({ results }: ResultsProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'similarity' | 'topics' | 'urls'>('similarity');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  const topicGroups = useMemo(() => groupByTopics(results), [results]);
  const urlGroups = useMemo(() => groupByUrls(results), [results]);
  
  const filteredResults = useMemo(() => {
    if (!searchTerm) return results;
    
    const term = searchTerm.toLowerCase();
    return results.filter(result => 
      result.sourceUrl.toLowerCase().includes(term) ||
      (result.matches && Array.isArray(result.matches) && result.matches.some(match => 
        match.url.toLowerCase().includes(term) ||
        match.suggestedAnchor.toLowerCase().includes(term) ||
        (match.topics && Array.isArray(match.topics) && match.topics.some(topic => topic.toLowerCase().includes(term)))
      )) ||
      (result.topics && Array.isArray(result.topics) && result.topics.some(topic => topic.toLowerCase().includes(term)))
    );
  }, [results, searchTerm]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
  const pageResults = filteredResults.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const exportToCSV = () => {
    const csvData = [];
    
    // Add header row - limited to requested columns
    csvData.push([
      'Source URL',
      'Match URL',
      'Similarity Score (%)',
      'Match Topics',
      'Source Topics'
    ]);
    
    // Add data rows
    results.forEach(result => {
      const matches = result.matches || [];
      const topics = result.topics || [];
      
      if (matches.length === 0) {
        // Add row for URLs with no matches
        csvData.push([
          result.sourceUrl,
          '',
          '',
          '',
          topics.join('; ')
        ]);
      } else {
        matches.forEach(match => {
          const matchTopics = match.topics || [];
          csvData.push([
            result.sourceUrl,
            match.url,
            (match.similarity * 100).toFixed(2),
            matchTopics.join('; '),
            topics.join('; ')
          ]);
        });
      }
    });
    
    // Convert to CSV string
    const csvString = csvData.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    // Create and download file
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `internal-linker-results-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (results.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Results</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('similarity')}
              className={`p-2 rounded ${viewMode === 'similarity' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Similarity View"
            >
              <List size={20} />
            </button>
            <button
              onClick={() => setViewMode('topics')}
              className={`p-2 rounded ${viewMode === 'topics' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Topics View"
            >
              <ListTree size={20} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            title="Export to CSV"
          >
            <Download size={16} />
            Export CSV
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search results..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-md w-64"
            />
          </div>
        </div>
      </div>

      {viewMode === 'similarity' && (
        <div className="space-y-6">
          {pageResults.map((result, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-2">
                <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600">
                  {result.sourceUrl}
                </a>
              </h3>
              <div className="mb-4 flex flex-wrap gap-2">
                {(result.topics || []).map((topic, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                    {topic}
                  </span>
                ))}
              </div>
              <div className="space-y-3">
                <h4 className="font-medium">Top 5 Similar URLs:</h4>
                {(result.matches || []).map((match, matchIndex) => (
                  <div key={matchIndex} className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-gray-50 p-3 rounded">
                    <div className="mb-2 sm:mb-0 space-y-1">
                      <a href={match.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 block">
                        {match.url}
                      </a>
                      <p className="text-sm">
                        Suggested anchor text: <span className="font-medium text-emerald-600">{match.suggestedAnchor}</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(match.topics || []).map((topic, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-gray-600 font-medium whitespace-nowrap">
                      {(match.similarity * 100).toFixed(2)}% Match
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'topics' && (
        <div className="space-y-4">
          {topicGroups.map((group) => (
            <div key={group.topic} className="bg-white rounded-lg shadow-md overflow-hidden">
              <button
                onClick={() => toggleExpanded(group.topic)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expandedItems.has(group.topic) ? (
                    <ChevronDown size={20} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-500" />
                  )}
                  <span className="font-medium">{group.topic}</span>
                  <span className="text-sm text-gray-500">({group.urls.length} URLs)</span>
                </div>
              </button>
              
              {expandedItems.has(group.topic) && (
                <div className="border-t">
                  {group.urls.map((item, i) => (
                    <div key={i} className="px-6 py-3 border-b last:border-b-0 hover:bg-gray-50">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600"
                      >
                        {item.url}
                      </a>
                      {item.matches && Array.isArray(item.matches) && (
                        <div className="mt-2 pl-4 space-y-2">
                          {item.matches.map((match, j) => (
                            <div key={j} className="text-sm text-gray-600">
                              → <a href={match.url} className="text-blue-500 hover:text-blue-600">{match.url}</a>
                              <span className="ml-2 text-gray-500">({(match.similarity * 100).toFixed(1)}% match)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && viewMode === 'similarity' && (
        <div className="flex justify-center space-x-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}