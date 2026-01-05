/**
 * Analytics Page - Main Analytics Dashboard for CADReport
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, Search, AlertTriangle, 
  Clock, Calendar, Zap, ChevronDown, Save,
  Play, RefreshCw, Trash2, Share2
} from 'lucide-react';

import analyticsApi from '../api/analytics-api';
import AnalyticsChart from '../components/Analytics/AnalyticsChart';
import QueryInterface from '../components/Analytics/QueryInterface';
import DataQualityPanel from '../components/Analytics/DataQualityPanel';
import PredictionsPanel from '../components/Analytics/PredictionsPanel';
import DateRangePicker from '../components/shared/DateRangePicker';

// Helper function
const formatHour = (hour) => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
};

const AnalyticsPage = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [compareRange, setCompareRange] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('FIRE');  // FIRE, EMS, or null for ALL
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [queryUsage, setQueryUsage] = useState(null);

  useEffect(() => {
    loadDashboardData();
    loadQueryUsage();
  }, [dateRange, compareRange, categoryFilter]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const stats = await analyticsApi.getDashboardStats(
        dateRange.startDate,
        dateRange.endDate,
        compareRange?.startDate,
        compareRange?.endDate,
        categoryFilter  // Pass category filter to API
      );
      setDashboardStats(stats);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadQueryUsage = async () => {
    try {
      const usage = await analyticsApi.getQueryUsage();
      setQueryUsage(usage);
    } catch (err) {
      console.error('Failed to load query usage:', err);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'queries', label: 'Custom Queries', icon: Search },
    { id: 'trends', label: 'Trends', icon: TrendingUp },
    { id: 'predictions', label: 'Predictions', icon: Zap },
    { id: 'quality', label: 'Data Quality', icon: AlertTriangle }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
              <p className="text-sm text-gray-500">
                Insights and trends from your {categoryFilter ? categoryFilter.toLowerCase() : ''} incident data
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* FIRE/EMS Toggle */}
              <div className="flex gap-1">
                <button
                  onClick={() => setCategoryFilter('FIRE')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    categoryFilter === 'FIRE'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  🔥 Fire
                </button>
                <button
                  onClick={() => setCategoryFilter('EMS')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    categoryFilter === 'EMS'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  🚑 EMS
                </button>
                <button
                  onClick={() => setCategoryFilter(null)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    categoryFilter === null
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
              </div>
              
              {queryUsage && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">AI Queries:</span>
                  <span className={`font-medium ${
                    queryUsage.queries_remaining_today <= 1 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {queryUsage.queries_remaining_today}/{queryUsage.daily_limit} remaining
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab !== 'predictions' && (
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={setDateRange}
            />
            
            {activeTab === 'dashboard' && (
              <button
                onClick={() => setCompareRange(compareRange ? null : {
                  startDate: new Date(new Date(dateRange.startDate).setFullYear(new Date(dateRange.startDate).getFullYear() - 1)).toISOString().split('T')[0],
                  endDate: new Date(new Date(dateRange.endDate).setFullYear(new Date(dateRange.endDate).getFullYear() - 1)).toISOString().split('T')[0]
                })}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border ${
                  compareRange 
                    ? 'bg-blue-50 border-blue-300 text-blue-700' 
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                {compareRange ? 'Comparing to Previous Year' : 'Compare Periods'}
              </button>
            )}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab 
            stats={dashboardStats} 
            loading={loading} 
            error={error}
            dateRange={dateRange}
            hasComparison={!!compareRange}
            categoryFilter={categoryFilter}
          />
        )}
        
        {activeTab === 'queries' && (
          <QueryInterface 
            dateRange={dateRange}
            queryUsage={queryUsage}
            onQueryExecuted={loadQueryUsage}
          />
        )}
        
        {activeTab === 'trends' && (
          <TrendsTab dateRange={dateRange} />
        )}
        
        {activeTab === 'predictions' && (
          <PredictionsPanel />
        )}
        
        {activeTab === 'quality' && (
          <DataQualityPanel dateRange={dateRange} />
        )}
      </div>
    </div>
  );
};


// ============================================================================
// DASHBOARD TAB
// ============================================================================

const DashboardTab = ({ stats, loading, error, dateRange, hasComparison, categoryFilter }) => {
  // Build title suffix for category
  const categoryLabel = categoryFilter ? ` (${categoryFilter})` : ' (All)';
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      label: `Total ${categoryFilter || 'All'} Incidents`,
      value: stats.total_incidents?.toLocaleString() || '0',
      change: stats.incidents_change_pct,
      icon: BarChart3
    },
    {
      label: 'Avg Dispatch-to-Arrival Time',
      value: stats.avg_response_time_mins ? `${stats.avg_response_time_mins} min` : 'N/A',
      change: stats.response_time_change_pct ? -stats.response_time_change_pct : null,
      icon: Clock
    },
    {
      label: 'Unit Responses',
      value: stats.total_unit_responses?.toLocaleString() || '0',
      icon: TrendingUp
    },
    {
      label: 'Busiest Hour of Day',
      value: stats.busiest_hour !== null ? formatHour(stats.busiest_hour) : 'N/A',
      icon: Clock
    },
    {
      label: 'Busiest Day of Week',
      value: stats.busiest_day || 'N/A',
      icon: Calendar
    },
    {
      label: 'Most Common CAD Type',
      value: stats.most_common_type || 'N/A',
      icon: AlertTriangle
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <card.icon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-xl font-semibold text-gray-900">{card.value}</p>
                </div>
              </div>
              
              {card.change !== undefined && card.change !== null && hasComparison && (
                <div className={`text-sm font-medium ${
                  card.change > 0 ? 'text-green-600' : card.change < 0 ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {card.change > 0 ? '+' : ''}{card.change.toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SystemQueryChart 
          title={`Incident Count by Day of Week${categoryLabel}`}
          systemQueryName="Incidents by Day of Week"
          dateRange={dateRange}
          category={categoryFilter}
        />
        <SystemQueryChart 
          title={`Incident Count by Hour of Day${categoryLabel}`}
          systemQueryName="Incidents by Hour"
          dateRange={dateRange}
          category={categoryFilter}
        />
        <SystemQueryChart 
          title={`Incident Count by CAD Type${categoryLabel}`}
          systemQueryName="Incidents by Type"
          dateRange={dateRange}
          category={categoryFilter}
        />
        <SystemQueryChart 
          title={`Avg Response Time by Hour${categoryLabel}`}
          systemQueryName="Response Times by Hour"
          dateRange={dateRange}
          category={categoryFilter}
        />
      </div>
    </div>
  );
};


// ============================================================================
// TRENDS TAB
// ============================================================================

const TrendsTab = ({ dateRange }) => {
  const [savedQueries, setSavedQueries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSavedQueries();
  }, []);

  const loadSavedQueries = async () => {
    try {
      const queries = await analyticsApi.getSavedQueries(true);
      setSavedQueries(queries.filter(q => q.chart_config));
    } catch (err) {
      console.error('Failed to load queries:', err);
    } finally {
      setLoading(false);
    }
  };

  const systemQueries = savedQueries.filter(q => q.is_system);
  const userQueries = savedQueries.filter(q => !q.is_system);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Standard Reports</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {systemQueries.map(query => (
            <SavedQueryChart 
              key={query.id}
              query={query}
              dateRange={dateRange}
            />
          ))}
        </div>
      </div>

      {userQueries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Saved Reports</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {userQueries.map(query => (
              <SavedQueryChart 
                key={query.id}
                query={query}
                dateRange={dateRange}
                canDelete
                onDelete={() => loadSavedQueries()}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// ============================================================================
// SYSTEM QUERY CHART COMPONENT
// ============================================================================

const SystemQueryChart = ({ title, systemQueryName, dateRange, category }) => {
  const [data, setData] = useState(null);
  const [chartConfig, setChartConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [systemQueryName, dateRange, category]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let result;
      
      // Use direct chart endpoints based on query name
      switch (systemQueryName) {
        case 'Incidents by Day of Week':
          result = await analyticsApi.getIncidentsByDay(
            dateRange.startDate, dateRange.endDate, category
          );
          break;
        case 'Incidents by Hour':
          result = await analyticsApi.getIncidentsByHour(
            dateRange.startDate, dateRange.endDate, category
          );
          break;
        case 'Incidents by Type':
          result = await analyticsApi.getIncidentsByType(
            dateRange.startDate, dateRange.endDate, category, 10
          );
          break;
        case 'Response Times by Hour':
          result = await analyticsApi.getResponseTimesByHour(
            dateRange.startDate, dateRange.endDate, category
          );
          break;
        default:
          // Fallback to saved query system for unknown names
          const queries = await analyticsApi.getSavedQueries(true);
          const systemQuery = queries.find(q => q.is_system && q.name === systemQueryName);
          if (!systemQuery) {
            setError(`Query "${systemQueryName}" not found`);
            return;
          }
          result = await analyticsApi.executeSavedQuery(systemQuery.id, {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate
          });
      }
      
      setData(result.data);
      setChartConfig(result.chart_config);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load chart');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-medium text-gray-900 mb-4">{title}</h3>
      
      {loading && (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
      
      {error && (
        <div className="text-red-600 text-sm p-4 bg-red-50 rounded">
          {error}
        </div>
      )}
      
      {!loading && !error && data && chartConfig && (
        <div className="h-48">
          <AnalyticsChart data={data} config={chartConfig} />
        </div>
      )}
    </div>
  );
};


// ============================================================================
// SAVED QUERY CHART COMPONENT
// ============================================================================

const SavedQueryChart = ({ query, dateRange, canDelete, onDelete }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [query.id, dateRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyticsApi.executeSavedQuery(query.id, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });
      setData(result.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this saved query?')) return;
    try {
      await analyticsApi.deleteSavedQuery(query.id);
      onDelete?.();
    } catch (err) {
      alert('Failed to delete query');
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium text-gray-900">{query.name}</h3>
          {query.description && (
            <p className="text-sm text-gray-500">{query.description}</p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {query.is_shared && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
              Shared
            </span>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              className="p-1 text-gray-400 hover:text-red-600"
              title="Delete query"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {loading && (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
      
      {error && (
        <div className="text-red-600 text-sm p-4 bg-red-50 rounded">
          {error}
        </div>
      )}
      
      {!loading && !error && data && query.chart_config && (
        <div className="h-48">
          <AnalyticsChart data={data} config={query.chart_config} />
        </div>
      )}
    </div>
  );
};


export default AnalyticsPage;
