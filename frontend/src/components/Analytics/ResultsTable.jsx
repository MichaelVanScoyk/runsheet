/**
 * ResultsTable - Display query results in a sortable table
 */

import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Download } from 'lucide-react';

const ResultsTable = ({ data, maxRows = 100 }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  if (!data || data.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        No results to display
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      
      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [data, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatValue = (value, column) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">—</span>;
    }
    
    // Format numbers
    if (typeof value === 'number') {
      // Check if it looks like a percentage
      if (column.toLowerCase().includes('percent') || column.toLowerCase().includes('pct')) {
        return `${value.toFixed(1)}%`;
      }
      // Check if it looks like minutes/time
      if (column.toLowerCase().includes('min') || column.toLowerCase().includes('time')) {
        return value.toFixed(1);
      }
      // Large numbers get commas
      if (value > 999) {
        return value.toLocaleString();
      }
      // Small decimals
      if (value % 1 !== 0) {
        return value.toFixed(2);
      }
      return value;
    }
    
    return String(value);
  };

  const formatColumnName = (name) => {
    return name
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const exportCSV = () => {
    const headers = columns.join(',');
    const rows = sortedData.map(row => 
      columns.map(col => {
        const val = row[col];
        if (typeof val === 'string' && val.includes(',')) {
          return `"${val}"`;
        }
        return val ?? '';
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayData = sortedData.slice(0, maxRows);
  const hasMore = sortedData.length > maxRows;

  return (
    <div>
      {/* Export button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={exportCSV}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(column => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    {formatColumnName(column)}
                    {sortConfig.key === column && (
                      sortConfig.direction === 'asc' 
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayData.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50">
                {columns.map(column => (
                  <td key={column} className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {formatValue(row[column], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Row count */}
      <div className="mt-2 text-sm text-gray-500">
        {hasMore ? (
          <>Showing {maxRows} of {sortedData.length} results</>
        ) : (
          <>{sortedData.length} results</>
        )}
      </div>
    </div>
  );
};

export default ResultsTable;
