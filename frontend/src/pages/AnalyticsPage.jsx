/**
 * Analytics Page - Fire/EMS Performance Dashboard
 * Side-by-side comparison with response metrics and long call analysis
 */

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Minus,
  Clock, Users, Timer, AlertTriangle,
  RefreshCw, Flame, Heart
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

import analyticsApi from '../api/analytics-api';

// Get YTD date range
const getYTDRange = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  return {
    startDate: startOfYear.toISOString().split('T')[0],
    endDate: now.toISOString().split('T')[0]
  };
};

const AnalyticsPage = () => {
  const [dateRange] = useState(getYTDRange());
  const [fireStats, setFireStats] = useState(null);
  const [emsStats, setEmsStats] = useState(null);
  const [fireLongCalls, setFireLongCalls] = useState(null);
  const [emsLongCalls, setEmsLongCalls] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAllData();
  }, [dateRange]);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [fireS, emsS, fireL, emsL] = await Promise.all([
        analyticsApi.getCategoryStats(dateRange.startDate, dateRange.endDate, 'F'),
        analyticsApi.getCategoryStats(dateRange.startDate, dateRange.endDate, 'E'),
        analyticsApi.getLongCalls(dateRange.startDate, dateRange.endDate, 'F', 25),
        analyticsApi.getLongCalls(dateRange.startDate, dateRange.endDate, 'E', 25)
      ]);
      setFireStats(fireS);
      setEmsStats(emsS);
      setFireLongCalls(fireL);
      setEmsLongCalls(emsL);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err.response?.data?.detail || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

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
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Response Analytics</h1>
              <p className="text-sm text-gray-500">
                Year to Date: {new Date(dateRange.startDate).toLocaleDateString()} - {new Date(dateRange.endDate).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={loadAllData}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Side by Side */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* FIRE Column */}
          <CategoryColumn
            title="Fire"
            icon={Flame}
            color="red"
            stats={fireStats}
            longCalls={fireLongCalls}
          />

          {/* EMS Column */}
          <CategoryColumn
            title="EMS"
            icon={Heart}
            color="blue"
            stats={emsStats}
            longCalls={emsLongCalls}
          />
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// CATEGORY COLUMN COMPONENT
// ============================================================================

const CategoryColumn = ({ title, icon: Icon, color, stats, longCalls }) => {
  const colorClasses = {
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      header: 'bg-red-600',
      bar: '#dc2626'
    },
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      header: 'bg-blue-600',
      bar: '#2563eb'
    }
  };

  const colors = colorClasses[color];

  return (
    <div className={`rounded-xl border-2 ${colors.border} overflow-hidden`}>
      {/* Column Header */}
      <div className={`${colors.header} text-white px-4 py-3 flex items-center gap-3`}>
        <Icon className="w-6 h-6" />
        <span className="text-xl font-bold">{title}</span>
        <span className="ml-auto text-lg font-semibold">
          {stats?.total_incidents || 0} Incidents
        </span>
      </div>

      {/* Stats Cards */}
      <div className="p-4 space-y-3">
        <StatCard
          label="Response Rate"
          value={stats?.response_rate != null ? `${stats.response_rate}%` : 'N/A'}
          trend={stats?.response_rate_trend}
          trendPositiveIsGood={true}
          icon={Users}
          sublabel="Incidents with unit on-scene"
        />
        
        <StatCard
          label="Turnout Time"
          value={stats?.avg_turnout_mins != null ? `${stats.avg_turnout_mins} min` : 'N/A'}
          trend={stats?.turnout_trend}
          trendPositiveIsGood={false}
          icon={Timer}
          sublabel="Dispatch → Enroute"
        />
        
        <StatCard
          label="Response Time"
          value={stats?.avg_response_mins != null ? `${stats.avg_response_mins} min` : 'N/A'}
          trend={stats?.response_trend}
          trendPositiveIsGood={false}
          icon={Clock}
          sublabel="Dispatch → On Scene"
        />
      </div>

      {/* Long Calls Section */}
      <div className={`${colors.bg} p-4 border-t ${colors.border}`}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className={`w-5 h-5 ${colors.text}`} />
          <span className="font-semibold text-gray-900">
            Calls 25+ Minutes On Scene
          </span>
          <span className={`ml-auto text-lg font-bold ${colors.text}`}>
            {longCalls?.total_long_calls || 0}
          </span>
        </div>

        {/* By Day of Week */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">By Day of Week</p>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={longCalls?.by_day || []}>
                <XAxis 
                  dataKey="day" 
                  tick={{ fontSize: 10 }} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip 
                  formatter={(value) => [value, 'Calls']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" fill={colors.bar} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Hour of Day */}
        <div>
          <p className="text-xs text-gray-500 mb-2">By Hour of Day</p>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={longCalls?.by_hour || []}>
                <XAxis 
                  dataKey="hour" 
                  tick={{ fontSize: 8 }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis hide />
                <Tooltip 
                  formatter={(value) => [value, 'Calls']}
                  labelFormatter={(hour) => `${hour}:00`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" fill={colors.bar} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

const StatCard = ({ label, value, trend, trendPositiveIsGood, icon: Icon, sublabel }) => {
  // Determine trend direction and color
  let TrendIcon = Minus;
  let trendColor = 'text-gray-400';
  let trendBg = 'bg-gray-100';
  
  if (trend != null && trend !== 0) {
    if (trend > 0) {
      TrendIcon = TrendingUp;
      trendColor = trendPositiveIsGood ? 'text-green-600' : 'text-red-600';
      trendBg = trendPositiveIsGood ? 'bg-green-100' : 'bg-red-100';
    } else {
      TrendIcon = TrendingDown;
      trendColor = trendPositiveIsGood ? 'text-red-600' : 'text-green-600';
      trendBg = trendPositiveIsGood ? 'bg-red-100' : 'bg-green-100';
    }
  }

  return (
    <div className="bg-white rounded-lg p-3 border">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {sublabel && (
              <p className="text-xs text-gray-500">{sublabel}</p>
            )}
          </div>
        </div>
        
        {trend != null && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${trendBg}`}>
            <TrendIcon className={`w-4 h-4 ${trendColor}`} />
            <span className={`text-sm font-medium ${trendColor}`}>
              {trend > 0 ? '+' : ''}{trend}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};


export default AnalyticsPage;
