/**
 * QueryInterface - Natural Language Query Component
 * Handles AI-powered queries and saved query management
 */

import React, { useState, useEffect } from 'react';
import { 
  Search, Play, Save, Clock, Sparkles, 
  ChevronDown, Table, BarChart2, RefreshCw,
  AlertCircle, CheckCircle, BookOpen
} from 'lucide-react';

import analyticsApi from '../../api/analytics-api';
import AnalyticsChart from './AnalyticsChart';
import ResultsTable from './ResultsTable';

const QueryInterface = ({ dateRange, queryUsage, onQueryExecuted }) => {
  // Query input
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Results
  const [result, setResult] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'
  
  // Saved queries
  const [savedQueries, setSavedQueries] = useState([]);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);

  useEffect(() => {
    loadSavedQueries();
  }, []);

  const loadSavedQueries = async () => {
    try {
      const queries = await analyticsApi.getSavedQueries(true);
      setSavedQueries(queries);
    } catch (err) {
      console.error('Failed to load saved queries:', err);
    }
  };

  const executeQuery = async () => {
    if (!question.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await analyticsApi.executeNaturalLanguageQuery(question, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });
      setResult(response);
      onQueryExecuted?.();
    } catch (err) {
      if (err.response?.status === 429) {
        setError({
          type: 'rate_limit',
          message: 'Daily query limit reached. Use a saved query or try again tomorrow.',
          details: err.response.data.detail
        });
      } else {
        setError({
          type: 'error',
          message: err.response?.data?.detail || 'Query failed. Try rephrasing your question.'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const executeSavedQuery = async (query) => {
    setIsLoading(true);
    setError(null);
    setQuestion(query.natural_language);
    
    try {
      const response = await analyticsApi.executeSavedQuery(query.id, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });
      setResult(response);
      setShowSavedQueries(false);
    } catch (err) {
      setError({
        type: 'error',
        message: err.response?.data?.detail || 'Failed to execute saved query'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveCurrentQuery = async () => {
    if (!saveName.trim() || !result) return;
    
    try {
      await analyticsApi.createSavedQuery({
        name: saveName,
        natural_language: result.natural_language,
        generated_sql: result.generated_sql,
        result_type: result.result_type,
        is_shared: saveShared
      });
      
      setShowSaveDialog(false);
      setSaveName('');
      setSaveShared(false);
      loadSavedQueries();
    } catch (err) {
      alert('Failed to save query');
    }
  };

  // Filter saved queries by category
  const filteredQueries = savedQueries.filter(q => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'system') return q.is_system;
    if (selectedCategory === 'mine') return !q.is_system;
    return true;
  });

  // Example questions
  const exampleQuestions = [
    "What are our busiest hours for incidents?",
    "Show me average response times by unit",
    "How many incidents per month this year?",
    "Which day of the week has the most calls?",
    "Compare fire vs EMS incident counts",
    "What's our average turnout time?",
    "Show incidents by municipality",
    "Who responded to the most incidents?"
  ];

  return (
    <div className="space-y-6">
      {/* Query Input Section */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Ask a Question</h2>
          {queryUsage && (
            <span className={`ml-auto text-sm ${
              queryUsage.queries_remaining_today <= 1 ? 'text-red-600' : 'text-gray-500'
            }`}>
              {queryUsage.queries_remaining_today} AI queries remaining today
            </span>
          )}
        </div>
        
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeQuery()}
              placeholder="Ask about your incident data in plain English..."
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
            {question && (
              <button
                onClick={() => setQuestion('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>
          
          <button
            onClick={executeQuery}
            disabled={isLoading || !question.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run Query
          </button>
          
          <button
            onClick={() => setShowSavedQueries(!showSavedQueries)}
            className="px-4 py-3 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Saved
            <ChevronDown className={`w-4 h-4 transition-transform ${showSavedQueries ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Example Questions */}
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQuestions.slice(0, 4).map((q, idx) => (
              <button
                key={idx}
                onClick={() => setQuestion(q)}
                className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Saved Queries Dropdown */}
      {showSavedQueries && (
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-4 mb-4">
            <h3 className="font-medium text-gray-900">Saved Queries</h3>
            <div className="flex gap-2">
              {['all', 'system', 'mine'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-sm px-3 py-1 rounded-full ${
                    selectedCategory === cat
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat === 'system' ? 'Built-in' : 'My Queries'}
                </button>
              ))}
            </div>
            <span className="ml-auto text-sm text-green-600">
              ✓ No API cost
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
            {filteredQueries.map(query => (
              <button
                key={query.id}
                onClick={() => executeSavedQuery(query)}
                className="text-left p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm">{query.name}</span>
                  {query.is_system && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      Built-in
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {query.natural_language}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className={`rounded-lg border p-4 ${
          error.type === 'rate_limit' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            <AlertCircle className={`w-5 h-5 mt-0.5 ${
              error.type === 'rate_limit' ? 'text-yellow-600' : 'text-red-600'
            }`} />
            <div>
              <p className={`font-medium ${
                error.type === 'rate_limit' ? 'text-yellow-800' : 'text-red-800'
              }`}>
                {error.message}
              </p>
              {error.type === 'rate_limit' && (
                <p className="text-sm text-yellow-700 mt-1">
                  Tip: Use saved queries (they're free!) or save successful queries for reuse.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="bg-white rounded-lg border">
          {/* Results Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {result.row_count} results in {result.execution_time_ms}ms
                </span>
              </div>
              
              {/* View Toggle */}
              <div className="flex border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 text-sm flex items-center gap-1 ${
                    viewMode === 'table' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <Table className="w-4 h-4" />
                  Table
                </button>
                <button
                  onClick={() => setViewMode('chart')}
                  className={`px-3 py-1 text-sm flex items-center gap-1 ${
                    viewMode === 'chart' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <BarChart2 className="w-4 h-4" />
                  Chart
                </button>
              </div>
            </div>
            
            {/* Save Button */}
            {result.query_type === 'natural_language' && !result.saved_query_id && (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
              >
                <Save className="w-4 h-4" />
                Save Query
              </button>
            )}
          </div>

          {/* Results Content */}
          <div className="p-4">
            {viewMode === 'table' ? (
              <ResultsTable data={result.data} />
            ) : (
              <div className="h-80">
                <AnalyticsChart 
                  data={result.data} 
                  config={result.chart_config || inferChartConfig(result.data)}
                />
              </div>
            )}
          </div>

          {/* Generated SQL (collapsible) */}
          {result.generated_sql && (
            <details className="border-t">
              <summary className="px-4 py-2 text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
                View Generated SQL
              </summary>
              <pre className="px-4 py-3 bg-gray-50 text-xs overflow-x-auto">
                {result.generated_sql}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Save Query</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Query Name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., Monthly Response Times"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="shareQuery"
                  checked={saveShared}
                  onChange={(e) => setSaveShared(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="shareQuery" className="text-sm text-gray-700">
                  Share with all department members
                </label>
              </div>
              
              <p className="text-sm text-gray-500">
                Saved queries can be run anytime without using your daily AI query limit.
              </p>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentQuery}
                disabled={!saveName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Save Query
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper to infer chart config from data
const inferChartConfig = (data) => {
  if (!data || data.length === 0) return null;
  
  const keys = Object.keys(data[0]);
  const numericKeys = keys.filter(k => typeof data[0][k] === 'number');
  const stringKeys = keys.filter(k => typeof data[0][k] === 'string');
  
  if (stringKeys.length > 0 && numericKeys.length > 0) {
    return {
      type: data.length > 10 ? 'line' : 'bar',
      xField: stringKeys[0],
      yField: numericKeys[0],
      title: 'Query Results'
    };
  }
  
  return null;
};

export default QueryInterface;
