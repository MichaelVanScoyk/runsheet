/**
 * DataQualityPanel - Data quality issues and outlier detection
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, CheckCircle, RefreshCw, Search,
  Clock, AlertCircle, XCircle, ExternalLink,
  Filter, ChevronDown
} from 'lucide-react';

import analyticsApi from '../../api/analytics-api';

const DataQualityPanel = ({ dateRange }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    loadIssues();
  }, [showResolved]);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const data = await analyticsApi.getDataQualityIssues(showResolved, 100);
      setSummary(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const result = await analyticsApi.scanForOutliers({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });
      
      alert(`Scan complete! Found ${result.issues_found} new issues.`);
      loadIssues();
    } catch (err) {
      alert('Scan failed: ' + (err.response?.data?.detail || 'Unknown error'));
    } finally {
      setScanning(false);
    }
  };

  const resolveIssue = async (issueId) => {
    try {
      await analyticsApi.resolveDataQualityIssue(issueId, resolutionNotes);
      setSelectedIssue(null);
      setResolutionNotes('');
      loadIssues();
    } catch (err) {
      alert('Failed to resolve issue');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error': return <XCircle className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      case 'info': return <AlertCircle className="w-5 h-5" />;
      default: return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getIssueTypeLabel = (type) => {
    const labels = {
      'response_time_outlier': 'Response Time Outlier',
      'time_sequence_error': 'Time Sequence Error',
      'suspiciously_fast_response': 'Suspiciously Fast Response',
      'missing_data': 'Missing Data'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Total Issues</div>
          <div className="text-2xl font-bold text-gray-900">
            {summary?.total_issues || 0}
          </div>
        </div>
        
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Unresolved</div>
          <div className="text-2xl font-bold text-red-600">
            {summary?.unresolved_issues || 0}
          </div>
        </div>
        
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Errors</div>
          <div className="text-2xl font-bold text-red-600">
            {summary?.by_severity?.error || 0}
          </div>
        </div>
        
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Warnings</div>
          <div className="text-2xl font-bold text-yellow-600">
            {summary?.by_severity?.warning || 0}
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {scanning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {scanning ? 'Scanning...' : 'Scan for Issues'}
          </button>
          
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show resolved issues
          </label>
        </div>

        <div className="text-sm text-gray-500">
          Date range: {dateRange.startDate} to {dateRange.endDate}
        </div>
      </div>

      {/* Issues by Type */}
      {summary?.by_type && Object.keys(summary.by_type).length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">Issues by Type</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(summary.by_type).map(([type, count]) => (
              <div 
                key={type}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm"
              >
                <span className="text-gray-700">{getIssueTypeLabel(type)}</span>
                <span className="font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues List */}
      <div className="bg-white border rounded-lg">
        <div className="px-4 py-3 border-b">
          <h3 className="font-medium text-gray-900">
            {showResolved ? 'All Issues' : 'Unresolved Issues'}
          </h3>
        </div>
        
        {summary?.recent_issues?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="font-medium">No issues found!</p>
            <p className="text-sm mt-1">
              Run a scan to check for data quality issues in your incidents.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {summary?.recent_issues?.map(issue => (
              <div 
                key={issue.id}
                className={`p-4 ${issue.resolved_at ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-4">
                  {/* Severity Icon */}
                  <div className={`p-2 rounded-lg ${getSeverityColor(issue.severity)}`}>
                    {getSeverityIcon(issue.severity)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {getIssueTypeLabel(issue.issue_type)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${getSeverityColor(issue.severity)}`}>
                        {issue.severity}
                      </span>
                      {issue.resolved_at && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          Resolved
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-600 mt-1">
                      {issue.description}
                    </p>
                    
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {issue.internal_incident_number && (
                        <a 
                          href={`/incidents/${issue.incident_id}`}
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          Incident #{issue.internal_incident_number}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      
                      {issue.current_value && (
                        <span>Value: {issue.current_value}</span>
                      )}
                      
                      {issue.expected_range && (
                        <span>Expected: {issue.expected_range}</span>
                      )}
                      
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(issue.detected_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {issue.resolved_at && issue.resolved_by_name && (
                      <p className="text-xs text-gray-500 mt-2">
                        Resolved by {issue.resolved_by_name} on {new Date(issue.resolved_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  {!issue.resolved_at && (
                    <button
                      onClick={() => setSelectedIssue(issue)}
                      className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {selectedIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Resolve Issue</h3>
            
            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
              <p className="font-medium text-gray-900">
                {getIssueTypeLabel(selectedIssue.issue_type)}
              </p>
              <p className="text-gray-600 mt-1">{selectedIssue.description}</p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resolution Notes (optional)
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g., Fixed timestamp in database, Confirmed data is correct, etc."
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setSelectedIssue(null);
                  setResolutionNotes('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => resolveIssue(selectedIssue.id)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Mark as Resolved
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Box */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">About Data Quality Checks</h4>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            <strong>Response Time Outliers:</strong> Unit response times that are more than 3 standard deviations 
            from the average, which may indicate data entry errors or unusual circumstances.
          </p>
          <p>
            <strong>Time Sequence Errors:</strong> Timestamps that are out of order (e.g., arrived before dispatched), 
            indicating data import or entry issues.
          </p>
          <p>
            <strong>Suspiciously Fast Responses:</strong> Response times under 30 seconds, which are physically 
            unlikely and may indicate timestamp errors.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DataQualityPanel;
