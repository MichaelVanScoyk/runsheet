/**
 * Analytics Page V2 - Response Time Deep Dive & Staffing Patterns
 * 
 * ALL DATA FILTERED BY CATEGORY (Fire or EMS) - NO COMBINED VIEWS
 * 
 * Sections:
 * 1. Response Time Breakdown by Call Type
 * 2. Turnout Time vs Crew Size (by time period)
 * 3. Patterns & Predictions (monthly volume with historical trend, best performance, staffing)
 * 4. Year-over-Year Comparison
 * 5. Natural Language Query (Claude API)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, Users, TrendingUp, TrendingDown, Minus, RefreshCw,
  Flame, Heart, Calendar, MessageSquare, Send, ChevronDown, ChevronUp,
  ArrowRight, AlertCircle, Loader2, Info
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell, Legend, ComposedChart
} from 'recharts';

import api from '../api';
import PersonnelStatsSection from '../components/PersonnelStatsSection';
import { useBranding } from '../contexts/BrandingContext';

// =============================================================================
// DATE HELPERS
// =============================================================================

const getDateRange = (days) => {
  const end = new Date();
  const start = new Date();
  
  if (days === 'ytd') {
    // Year to date: Jan 1 of current year
    start.setMonth(0, 1); // January 1
  } else {
    start.setDate(start.getDate() - days);
  }
  
  // Format as local date string (YYYY-MM-DD) to avoid UTC conversion issues
  const formatLocalDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end)
  };
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  // Parse as local time by adding T00:00:00 to avoid UTC interpretation
  const localDate = new Date(dateStr + 'T00:00:00');
  return localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getPeriodLabel = (selectedDays) => {
  if (selectedDays === 'ytd') return 'YTD';
  if (selectedDays === 30) return '30d';
  if (selectedDays === 60) return '60d';
  if (selectedDays === 90) return '90d';
  if (selectedDays === 365) return '1yr';
  return `${selectedDays}d`;
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const AnalyticsPage = ({ userSession }) => {
  const branding = useBranding();
  const [dateRange, setDateRange] = useState(getDateRange('ytd'));
  const [selectedDays, setSelectedDays] = useState('ytd');
  const [category, setCategory] = useState('FIRE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Data states
  const [summary, setSummary] = useState(null);
  const [responseByType, setResponseByType] = useState(null);
  const [trends, setTrends] = useState(null);
  const [turnoutVsCrew, setTurnoutVsCrew] = useState(null);
  const [monthlyVolume, setMonthlyVolume] = useState(null);
  const [bestPerformance, setBestPerformance] = useState(null);
  const [staffingPatterns, setStaffingPatterns] = useState(null);
  const [yoyComparison, setYoyComparison] = useState(null);
  
  // NL Query states
  const [nlQuery, setNlQuery] = useState('');
  const [nlResult, setNlResult] = useState(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState(null);
  const [queryUsage, setQueryUsage] = useState(null);
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState({
    responseByType: true,
    turnoutVsCrew: true,
    patterns: true,
    yoy: true,
    nlQuery: true
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Calculate days for summary endpoint (which expects a number)
  const getSummaryDays = () => {
    if (selectedDays === 'ytd') {
      const now = new Date();
      const jan1 = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now - jan1) / (1000 * 60 * 60 * 24));
    }
    return selectedDays;
  };

  // Load all data - ALL endpoints now use category filter
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [
        summaryRes,
        responseByTypeRes,
        trendsRes,
        turnoutVsCrewRes,
        monthlyVolumeRes,
        bestPerformanceRes,
        staffingRes,
        yoyRes,
        usageRes
      ] = await Promise.all([
        api.get('/analytics/v2/summary', { params: { days: getSummaryDays(), category } }),
        api.get('/analytics/v2/response-times/by-type', { 
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, category }
        }),
        api.get('/analytics/v2/response-times/trends', { params: { category } }),
        api.get('/analytics/v2/turnout-vs-crew', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, category }
        }),
        api.get('/analytics/v2/patterns/monthly-volume', { params: { category } }),
        api.get('/analytics/v2/patterns/best-performance', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, category }
        }),
        api.get('/analytics/v2/patterns/staffing', {
          params: { start_date: dateRange.startDate, end_date: dateRange.endDate, category }
        }),
        api.get('/analytics/v2/yoy/this-week-last-year', { params: { category } }),
        api.get('/analytics/usage').catch(() => ({ data: null }))
      ]);
      
      setSummary(summaryRes.data);
      setResponseByType(responseByTypeRes.data);
      setTrends(trendsRes.data);
      setTurnoutVsCrew(turnoutVsCrewRes.data);
      setMonthlyVolume(monthlyVolumeRes.data);
      setBestPerformance(bestPerformanceRes.data);
      setStaffingPatterns(staffingRes.data);
      setYoyComparison(yoyRes.data);
      setQueryUsage(usageRes.data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err.response?.data?.detail || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedDays, category]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle date range change
  const handleDaysChange = (days) => {
    setSelectedDays(days);
    setDateRange(getDateRange(days));
  };

  // Handle NL query
  const handleNlQuery = async () => {
    if (!nlQuery.trim()) return;
    
    setNlLoading(true);
    setNlError(null);
    setNlResult(null);
    
    try {
      const response = await api.post('/analytics/query', {
        question: nlQuery,
        start_date: dateRange.startDate,
        end_date: dateRange.endDate
      });
      setNlResult(response.data);
      // Refresh usage
      const usageRes = await api.get('/analytics/usage').catch(() => ({ data: null }));
      setQueryUsage(usageRes.data);
    } catch (err) {
      setNlError(err.response?.data?.detail || 'Query failed');
    } finally {
      setNlLoading(false);
    }
  };

  const periodLabel = getPeriodLabel(selectedDays);
  const categoryColor = category === 'FIRE' ? 'red' : 'blue';
  const CategoryIcon = category === 'FIRE' ? Flame : Heart;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <CategoryIcon className={`w-6 h-6 ${category === 'FIRE' ? 'text-red-600' : 'text-blue-600'}`} />
                {category === 'FIRE' ? 'Fire' : 'EMS'} Response Analytics
              </h1>
              <p className="text-sm text-gray-500">
                {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)} · {periodLabel}
              </p>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              {/* Date Range */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                {[{ value: 'ytd', label: 'YTD' }, { value: 30, label: '30d' }, { value: 60, label: '60d' }, { value: 90, label: '90d' }, { value: 365, label: '1yr' }].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleDaysChange(opt.value)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      selectedDays === opt.value
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              
              {/* Category Toggle */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setCategory('FIRE')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    category === 'FIRE'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Flame className="w-4 h-4" /> Fire
                </button>
                <button
                  onClick={() => setCategory('EMS')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    category === 'EMS'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Heart className="w-4 h-4" /> EMS
                </button>
              </div>
              
              <button
                onClick={loadAllData}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats - Single category only */}
      {summary && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard 
              label="Dispatched" 
              value={summary.total_dispatched} 
              color={categoryColor}
            />
            <StatCard 
              label="Responded" 
              value={summary.station_responded} 
              subValue={`${Math.round((summary.station_responded / summary.total_dispatched) * 100) || 0}% response rate`}
              color={categoryColor}
            />
            <StatCard label="Avg Turnout" value={summary.avg_turnout_mins ? `${summary.avg_turnout_mins} min` : '-'} />
            <StatCard label="Avg Response" value={summary.avg_response_mins ? `${summary.avg_response_mins} min` : '-'} />
            <StatCard label="Avg On Scene" value={summary.avg_on_scene_mins ? `${summary.avg_on_scene_mins} min` : '-'} />
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        
        {/* Section 0: Personnel Stats (when logged in) */}
        <PersonnelStatsSection userSession={userSession} />

        {/* Station Analytics Divider */}
        <div className="flex items-center gap-3 pt-4">
          <div className="h-px flex-1 bg-gray-300"></div>
          <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
            <CategoryIcon className={`w-5 h-5 ${category === 'FIRE' ? 'text-red-600' : 'text-blue-600'}`} />
            {category === 'FIRE' ? 'Fire' : 'EMS'} Station Analytics
          </h2>
          <div className="h-px flex-1 bg-gray-300"></div>
        </div>

        {/* Section 1: Response Times by Call Type */}
        <CollapsibleSection
          title="Response Times by Call Type"
          periodLabel={periodLabel}
          icon={Clock}
          expanded={expandedSections.responseByType}
          onToggle={() => toggleSection('responseByType')}
        >
          {responseByType && <ResponseByTypeSection data={responseByType} trends={trends} />}
        </CollapsibleSection>

        {/* Section 2: Turnout vs Crew Size */}
        <CollapsibleSection
          title="Turnout Time vs Crew Size"
          periodLabel={periodLabel}
          icon={Users}
          expanded={expandedSections.turnoutVsCrew}
          onToggle={() => toggleSection('turnoutVsCrew')}
        >
          {turnoutVsCrew && <TurnoutVsCrewSection data={turnoutVsCrew} />}
        </CollapsibleSection>

        {/* Section 3: Patterns */}
        <CollapsibleSection
          title="Patterns & Performance"
          periodLabel={periodLabel}
          icon={TrendingUp}
          expanded={expandedSections.patterns}
          onToggle={() => toggleSection('patterns')}
        >
          <PatternsSection 
            monthlyVolume={monthlyVolume}
            bestPerformance={bestPerformance}
            staffingPatterns={staffingPatterns}
            category={category}
          />
        </CollapsibleSection>

        {/* Section 4: Year-over-Year */}
        <CollapsibleSection
          title="This Week vs Last Year"
          periodLabel="This Week"
          icon={Calendar}
          expanded={expandedSections.yoy}
          onToggle={() => toggleSection('yoy')}
        >
          {yoyComparison && <YoYSection data={yoyComparison} />}
        </CollapsibleSection>

        {/* Section 5: Natural Language Query */}
        <CollapsibleSection
          title="Ask a Question"
          periodLabel={periodLabel}
          icon={MessageSquare}
          expanded={expandedSections.nlQuery}
          onToggle={() => toggleSection('nlQuery')}
          badge={queryUsage ? `${queryUsage.queries_remaining_today}/${queryUsage.daily_limit} remaining` : null}
        >
          <NLQuerySection 
            query={nlQuery}
            setQuery={setNlQuery}
            onSubmit={handleNlQuery}
            loading={nlLoading}
            error={nlError}
            result={nlResult}
            usage={queryUsage}
          />
        </CollapsibleSection>

      </div>
    </div>
  );
};


// =============================================================================
// STAT CARD
// =============================================================================

const StatCard = ({ label, value, subValue, color }) => {
  const colorClasses = {
    red: 'text-red-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
  };
  
  return (
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color ? colorClasses[color] : 'text-gray-900'}`}>
        {value}
      </p>
      {subValue && <p className="text-xs text-gray-400">{subValue}</p>}
    </div>
  );
};


// =============================================================================
// COLLAPSIBLE SECTION
// =============================================================================

const CollapsibleSection = ({ title, periodLabel, icon: Icon, expanded, onToggle, badge, children }) => (
  <div className="bg-white rounded-lg border overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-gray-600" />
        <span className="font-semibold text-gray-900">{title}</span>
        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
          {periodLabel}
        </span>
        {badge && (
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
    </button>
    {expanded && <div className="p-4">{children}</div>}
  </div>
);


// =============================================================================
// TREND INDICATOR
// =============================================================================

// =============================================================================
// METRIC TOOLTIP
// =============================================================================

const METRIC_DEFINITIONS = {
  turnout: "Time from dispatch to first unit going enroute (getting out the door)",
  travel: "Time from first unit enroute to first unit on scene (driving time)",
  response: "Total time from dispatch to first unit on scene (Turnout + Travel)",
  onScene: "Time from first unit arrival to last unit cleared (working the call)"
};

const MetricHeader = ({ label, metric, align = 'right' }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const definition = METRIC_DEFINITIONS[metric];
  
  if (!definition) {
    return (
      <th className={`text-${align} py-2 px-3 font-medium text-gray-600`}>
        {label}
      </th>
    );
  }
  
  return (
    <th className={`text-${align} py-2 px-3 font-medium text-gray-600`}>
      <div className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <div className="relative inline-block">
          <Info 
            className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 cursor-help" 
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          />
          {showTooltip && (
            <div className="absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 text-xs font-normal text-left text-white bg-gray-800 rounded shadow-lg">
              {definition}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
            </div>
          )}
        </div>
      </div>
    </th>
  );
};


const TrendIndicator = ({ value, positiveIsGood = false, suffix = '' }) => {
  if (value == null) return <span className="text-gray-400">-</span>;
  
  const isPositive = value > 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;
  
  const Icon = value === 0 ? Minus : (isPositive ? TrendingUp : TrendingDown);
  const colorClass = value === 0 ? 'text-gray-400' : (isGood ? 'text-green-600' : 'text-red-600');
  
  return (
    <span className={`flex items-center gap-1 ${colorClass}`}>
      <Icon className="w-4 h-4" />
      <span className="text-sm font-medium">
        {value > 0 ? '+' : ''}{value}{suffix}
      </span>
    </span>
  );
};


// =============================================================================
// SECTION 1: Response Times by Call Type
// =============================================================================

const ResponseByTypeSection = ({ data, trends }) => {
  const branding = useBranding();
  if (!data?.data?.length) {
    return <p className="text-gray-500 text-center py-4">No data available</p>;
  }

  const counts = data.incident_counts;

  return (
    <div className="space-y-4">
      {/* Incident Counts Context */}
      {counts && (
        <p className="text-sm text-gray-600">
          {counts.total_dispatched} incidents dispatched, Station {branding.stationNumber} responded to {counts.station_responded}
        </p>
      )}
      
      {/* Trends Summary */}
      {trends && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 mb-1">Turnout (30d vs 90d)</p>
            <TrendIndicator value={trends.trends?.turnout} suffix=" min" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Response (30d vs 90d)</p>
            <TrendIndicator value={trends.trends?.response} suffix=" min" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">On Scene (30d vs 90d)</p>
            <TrendIndicator value={trends.trends?.on_scene} suffix=" min" />
          </div>
        </div>
      )}
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 font-medium text-gray-600">Call Type</th>
              <th className="text-right py-2 px-3 font-medium text-gray-600">Count</th>
              <MetricHeader label="Turnout" metric="turnout" />
              <MetricHeader label="Travel" metric="travel" />
              <MetricHeader label="Response" metric="response" />
              <MetricHeader label="On Scene" metric="onScene" />
            </tr>
          </thead>
          <tbody>
            {data.data.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{row.call_type}</td>
                <td className="py-2 px-3 text-right">{row.incident_count}</td>
                <td className="py-2 px-3 text-right">{row.avg_turnout_mins ?? '-'}</td>
                <td className="py-2 px-3 text-right">{row.avg_travel_mins ?? '-'}</td>
                <td className="py-2 px-3 text-right font-medium">{row.avg_response_mins ?? '-'}</td>
                <td className="py-2 px-3 text-right">{row.avg_on_scene_mins ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


// =============================================================================
// SECTION 2: Turnout vs Crew Size
// =============================================================================

const TurnoutVsCrewSection = ({ data }) => {
  const branding = useBranding();
  if (!data?.data?.length) {
    return <p className="text-gray-500 text-center py-4">No data available</p>;
  }

  const counts = data.incident_counts;
  const periods = ['daytime', 'evening', 'overnight'];
  const periodLabels = {
    daytime: 'Daytime (6a-4p)',
    evening: 'Evening (4p-12a)',
    overnight: 'Overnight (12a-6a)'
  };
  const periodColors = {
    daytime: '#f59e0b',
    evening: '#3b82f6',
    overnight: '#6366f1'
  };

  // Prepare chart data
  const chartData = data.data.map(row => ({
    bucket: row.turnout_bucket,
    daytime: row.daytime_avg_crew,
    evening: row.evening_avg_crew,
    overnight: row.overnight_avg_crew,
  }));

  return (
    <div className="space-y-4">
      {/* Incident Counts Context */}
      {counts && (
        <p className="text-sm text-gray-600">
          {counts.total_dispatched} incidents dispatched, Station {branding.stationNumber} responded to {counts.station_responded}
        </p>
      )}
      
      <p className="text-sm text-gray-600">
        First-out unit: How many crew when we leave at different turnout times? Longer wait = more crew?
      </p>
      
      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} label={{ value: 'Avg Crew', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="daytime" name={periodLabels.daytime} fill={periodColors.daytime} />
            <Bar dataKey="evening" name={periodLabels.evening} fill={periodColors.evening} />
            <Bar dataKey="overnight" name={periodLabels.overnight} fill={periodColors.overnight} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Period Summary */}
      {data.period_summary && (
        <div className="grid grid-cols-3 gap-4">
          {periods.map(period => (
            <div key={period} className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-xs text-gray-500">{periodLabels[period]}</p>
              <p className="text-lg font-bold">
                {data.period_summary[period]?.avg_crew ?? '-'} avg crew
              </p>
              <p className="text-xs text-gray-400">
                {data.period_summary[period]?.total_responses ?? 0} responses
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// =============================================================================
// SECTION 3: Patterns
// =============================================================================

const PatternsSection = ({ monthlyVolume, bestPerformance, staffingPatterns, category }) => {
  const barColor = category === 'FIRE' ? '#dc2626' : '#2563eb';
  const barColorLight = category === 'FIRE' ? '#fca5a5' : '#93c5fd';
  
  return (
    <div className="space-y-6">
      {/* Monthly Volume with Historical Trend */}
      {monthlyVolume?.data && (
        <div>
          <h4 className="font-medium text-gray-900 mb-1">
            Monthly Volume
            <span className="text-xs text-gray-500 font-normal ml-2">
              Last 2 Years · {monthlyVolume.total_years_of_data}yr trend
            </span>
          </h4>
          <p className="text-xs text-gray-500 mb-3">
            Solid bars = last 2 years avg/month · Faded bars = all-time avg/month ({monthlyVolume.total_years_of_data} years)
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyVolume.data}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip 
                  formatter={(value, name) => [
                    `${value} avg/mo`,
                    name === 'avg_all_time' ? `All-time (${monthlyVolume.total_years_of_data}yr)` : 'Last 2 Years'
                  ]}
                />
                <Legend 
                  payload={[
                    { value: 'Last 2 Years', type: 'square', color: barColor },
                    { value: `All-time (${monthlyVolume.total_years_of_data}yr)`, type: 'square', color: barColorLight }
                  ]} 
                />
                {/* Historical trend (ghosted/faded) - render first so it's behind */}
                <Bar dataKey="avg_all_time" name={`All-time (${monthlyVolume.total_years_of_data}yr)`} fill={barColorLight} opacity={0.4} />
                {/* Recent 2 years (highlighted) - render second so it's in front */}
                <Bar dataKey="avg_recent" name="Last 2 Years" fill={barColor} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {monthlyVolume.insights && (
            <p className="text-sm text-gray-600 mt-2">
              Busiest month (recent): <span className={`font-medium ${category === 'FIRE' ? 'text-red-600' : 'text-blue-600'}`}>
                {monthlyVolume.insights.busiest_month_recent}
              </span>
              {monthlyVolume.insights.busiest_month_all_time !== monthlyVolume.insights.busiest_month_recent && (
                <span className="text-gray-400 ml-2">
                  (all-time: {monthlyVolume.insights.busiest_month_all_time})
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Best Performance & Staffing - Side by Side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Fastest Turnout by Day */}
        {bestPerformance?.by_day && (
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Turnout Time by Day</h4>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bestPerformance.by_day} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} unit=" min" />
                  <YAxis type="category" dataKey="day" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip formatter={(v) => `${v} min`} />
                  <Bar dataKey="avg_turnout_mins" fill="#10b981">
                    {bestPerformance.by_day.map((entry, i) => (
                      <Cell 
                        key={i} 
                        fill={entry.day === bestPerformance.insights?.fastest_turnout_day ? '#059669' : '#6ee7b7'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {bestPerformance.insights?.fastest_turnout_day && (
              <p className="text-xs text-gray-500 mt-1">
                Fastest: <span className="font-medium text-green-600">{bestPerformance.insights.fastest_turnout_day}</span> ({bestPerformance.insights.fastest_turnout_day_mins} min)
              </p>
            )}
          </div>
        )}

        {/* Best Staffing by Day */}
        {staffingPatterns?.by_day && (
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Avg Personnel by Day</h4>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staffingPatterns.by_day} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="day" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip formatter={(v) => `${v} personnel`} />
                  <Bar dataKey="avg_personnel" fill="#8b5cf6">
                    {staffingPatterns.by_day.map((entry, i) => (
                      <Cell 
                        key={i} 
                        fill={entry.day === staffingPatterns.insights?.best_staffed_day ? '#7c3aed' : '#c4b5fd'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {staffingPatterns.insights?.best_staffed_day && (
              <p className="text-xs text-gray-500 mt-1">
                Best staffed: <span className="font-medium text-purple-600">{staffingPatterns.insights.best_staffed_day}</span> ({staffingPatterns.insights.best_staffed_day_avg} avg)
              </p>
            )}
          </div>
        )}
      </div>

      {/* By Hour Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {bestPerformance?.by_hour && (
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Turnout Time by Hour</h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bestPerformance.by_hour}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip labelFormatter={(h) => `${h}:00`} formatter={(v) => `${v} min`} />
                  <Line type="monotone" dataKey="avg_turnout_mins" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {staffingPatterns?.by_hour && (
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Avg Personnel by Hour</h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={staffingPatterns.by_hour}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                  <Tooltip labelFormatter={(h) => `${h}:00`} formatter={(v) => `${v} personnel`} />
                  <Line type="monotone" dataKey="avg_personnel" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


// =============================================================================
// SECTION 4: Year-over-Year
// =============================================================================

const YoYSection = ({ data }) => {
  const thisWeek = data.this_week?.stats;
  const lastYear = data.last_year?.stats;
  const changes = data.changes || {};

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* This Week */}
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">This Week</h4>
          <p className="text-xs text-gray-500 mb-3">
            {formatDate(data.this_week?.period?.start)} - {formatDate(data.this_week?.period?.end)}
          </p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Dispatched</span>
              <span className="font-medium">{thisWeek?.total_dispatched || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Responded</span>
              <span className="font-medium">{thisWeek?.station_responded || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Turnout</span>
              <span className="font-medium">{thisWeek?.avg_turnout_mins ?? '-'} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Response</span>
              <span className="font-medium">{thisWeek?.avg_response_mins ?? '-'} min</span>
            </div>
          </div>
        </div>

        {/* Last Year */}
        <div className="p-4 border rounded-lg bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-2">Same Week Last Year</h4>
          <p className="text-xs text-gray-500 mb-3">
            {formatDate(data.last_year?.period?.start)} - {formatDate(data.last_year?.period?.end)}
          </p>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Dispatched</span>
              <span className="font-medium">{lastYear?.total_dispatched || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Responded</span>
              <span className="font-medium">{lastYear?.station_responded || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Turnout</span>
              <span className="font-medium">{lastYear?.avg_turnout_mins ?? '-'} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Response</span>
              <span className="font-medium">{lastYear?.avg_response_mins ?? '-'} min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Changes */}
      {Object.keys(changes).length > 0 && (
        <div className="flex gap-6 p-3 bg-gray-100 rounded-lg justify-center">
          {changes.incidents_pct != null && (
            <div className="text-center">
              <p className="text-xs text-gray-500">Incidents</p>
              <TrendIndicator value={changes.incidents_pct} positiveIsGood={false} suffix="%" />
            </div>
          )}
          {changes.turnout_diff != null && (
            <div className="text-center">
              <p className="text-xs text-gray-500">Turnout</p>
              <TrendIndicator value={changes.turnout_diff} suffix=" min" />
            </div>
          )}
          {changes.response_diff != null && (
            <div className="text-center">
              <p className="text-xs text-gray-500">Response</p>
              <TrendIndicator value={changes.response_diff} suffix=" min" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// =============================================================================
// SECTION 5: Natural Language Query
// =============================================================================

const NLQuerySection = ({ query, setQuery, onSubmit, loading, error, result, usage }) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Ask questions about your incident data in plain English. Uses AI to generate and run queries.
      </p>
      
      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., What were our top 5 call types last month?"
          className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={loading || (usage?.queries_remaining_today === 0)}
        />
        <button
          onClick={onSubmit}
          disabled={loading || !query.trim() || (usage?.queries_remaining_today === 0)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ask
        </button>
      </div>

      {/* Usage Warning */}
      {usage?.queries_remaining_today === 0 && (
        <div className="flex items-center gap-2 text-amber-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          Daily query limit reached. Resets at midnight.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {typeof error === 'object' ? error.message || JSON.stringify(error) : error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Generated SQL */}
          {result.generated_sql && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">View generated SQL</summary>
              <pre className="mt-2 p-2 bg-gray-100 rounded overflow-x-auto">{result.generated_sql}</pre>
            </details>
          )}
          
          {/* Results Table */}
          {result.data && result.data.length > 0 ? (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {Object.keys(result.data[0]).map(key => (
                      <th key={key} className="text-left py-2 px-3 font-medium text-gray-600 border-b">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="py-2 px-3">
                          {val != null ? String(val) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.data.length > 50 && (
                <p className="text-xs text-gray-500 p-2">Showing 50 of {result.data.length} rows</p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No results found</p>
          )}
        </div>
      )}

      {/* Example Queries */}
      <div className="text-xs text-gray-500">
        <p className="font-medium mb-1">Example questions:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>What were the top 10 call types this year?</li>
          <li>Which day of the week has the most incidents?</li>
          <li>What's the average response time by municipality?</li>
          <li>Show me incidents with response times over 10 minutes</li>
        </ul>
      </div>
    </div>
  );
};


export default AnalyticsPage;
