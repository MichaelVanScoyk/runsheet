/**
 * PredictionsPanel - Incident prediction and pattern analysis
 */

import React, { useState, useEffect } from 'react';
import { 
  Zap, Clock, Calendar, TrendingUp, RefreshCw,
  Sun, Moon, AlertCircle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';

import analyticsApi from '../../api/analytics-api';

const PredictionsPanel = () => {
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await analyticsApi.getPredictions();
      setPredictions(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load predictions');
    } finally {
      setLoading(false);
    }
  };

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

  if (!predictions) return null;

  const formatHour = (hour) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  // Prepare hourly data for chart
  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const period = predictions.busiest_periods?.find(p => p.hour === i);
    return {
      hour: i,
      label: formatHour(i),
      probability: period?.probability || 0,
      hoursFromNow: period?.hours_from_now
    };
  });

  // Day of week data
  const dayData = predictions.seasonal_patterns?.by_day 
    ? Object.entries(predictions.seasonal_patterns.by_day).map(([day, count]) => ({
        day,
        count
      }))
    : [];

  // Monthly data
  const monthData = predictions.seasonal_patterns?.by_month
    ? Object.entries(predictions.seasonal_patterns.by_month).map(([month, count]) => ({
        month,
        count
      }))
    : [];

  // Current hour for highlighting
  const currentHour = new Date().getHours();

  return (
    <div className="space-y-6">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Next Likely Period */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5" />
            <span className="text-sm font-medium opacity-90">Peak Activity Hour</span>
          </div>
          <div className="text-3xl font-bold">
            {formatHour(predictions.next_likely_hour)}
          </div>
          <div className="text-sm opacity-80 mt-1">
            {(predictions.probability * 100).toFixed(1)}% of incidents occur at this hour
          </div>
        </div>

        {/* Current Period */}
        <div className="bg-white border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2 text-gray-600">
            <Clock className="w-5 h-5" />
            <span className="text-sm font-medium">Right Now</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatHour(currentHour)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {currentHour >= 6 && currentHour < 18 ? (
              <span className="flex items-center gap-1">
                <Sun className="w-4 h-4 text-yellow-500" />
                Daytime hours (typically busier)
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Moon className="w-4 h-4 text-blue-500" />
                Nighttime hours
              </span>
            )}
          </div>
        </div>

        {/* Top 5 Busiest Periods */}
        <div className="bg-white border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3 text-gray-600">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-medium">Busiest Hours (Next 24h)</span>
          </div>
          <div className="space-y-2">
            {predictions.busiest_periods?.slice(0, 5).map((period, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {formatHour(period.hour)}
                  {period.hours_from_now === 0 && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                      Now
                    </span>
                  )}
                </span>
                <span className="text-gray-500">
                  {(period.probability * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly Distribution Chart */}
      <div className="bg-white border rounded-lg p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Hourly Incident Distribution</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 10 }}
                interval={2}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
              />
              <Tooltip 
                formatter={(val) => [`${(val * 100).toFixed(1)}%`, 'Probability']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Bar dataKey="probability" radius={[2, 2, 0, 0]}>
                {hourlyData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`}
                    fill={entry.hour === currentHour ? '#10B981' : '#3B82F6'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          <span className="inline-block w-3 h-3 bg-green-500 rounded mr-1"></span>
          Current hour highlighted
        </p>
      </div>

      {/* Day of Week and Monthly Patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Day of Week */}
        <div className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 mb-4">By Day of Week</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis 
                  type="category" 
                  dataKey="day" 
                  tick={{ fontSize: 12 }}
                  width={80}
                />
                <Tooltip 
                  formatter={(val) => [val.toLocaleString(), 'Incidents']}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly */}
        <div className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 mb-4">By Month (Seasonality)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(val) => [val.toLocaleString(), 'Incidents']}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">About These Predictions</p>
            <p className="text-sm text-blue-700 mt-1">
              These patterns are based on your historical incident data from the past 2-5 years. 
              They show when incidents have been most likely to occur based on time of day, day of week, 
              and seasonal patterns. Use this information for staffing decisions and resource planning, 
              but remember that actual incidents can occur at any time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictionsPanel;
