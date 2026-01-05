/**
 * DateRangePicker - Reusable date range selection component
 */

import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

const DateRangePicker = ({ startDate, endDate, onChange }) => {
  const [showPresets, setShowPresets] = useState(false);

  const presets = [
    { 
      label: 'Last 7 Days', 
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    },
    { 
      label: 'Last 30 Days', 
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    },
    { 
      label: 'Last 90 Days', 
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 90);
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    },
    { 
      label: 'This Year', 
      getValue: () => {
        const end = new Date();
        const start = new Date(end.getFullYear(), 0, 1);
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    },
    { 
      label: 'Last Year', 
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setFullYear(start.getFullYear() - 1);
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    },
    { 
      label: 'Last 2 Years', 
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setFullYear(start.getFullYear() - 2);
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    },
    { 
      label: 'Last 5 Years', 
      getValue: () => {
        const end = new Date();
        const start = new Date();
        start.setFullYear(start.getFullYear() - 5);
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    },
    { 
      label: 'All Time', 
      getValue: () => {
        const end = new Date();
        const start = new Date(2008, 0, 1); // Earliest possible data
        return { startDate: formatDate(start), endDate: formatDate(end) };
      }
    }
  ];

  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };

  const applyPreset = (preset) => {
    const range = preset.getValue();
    onChange(range);
    setShowPresets(false);
  };

  const handleStartChange = (e) => {
    onChange({ startDate: e.target.value, endDate });
  };

  const handleEndChange = (e) => {
    onChange({ startDate, endDate: e.target.value });
  };

  // Format for display
  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
        <Calendar className="w-4 h-4 text-gray-400" />
        
        <input
          type="date"
          value={startDate}
          onChange={handleStartChange}
          className="border-0 focus:ring-0 text-sm p-0 w-32"
        />
        
        <span className="text-gray-400">to</span>
        
        <input
          type="date"
          value={endDate}
          onChange={handleEndChange}
          className="border-0 focus:ring-0 text-sm p-0 w-32"
        />
      </div>
      
      {/* Presets Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          Quick Select
          <ChevronDown className={`w-4 h-4 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </button>
        
        {showPresets && (
          <>
            <div 
              className="fixed inset-0 z-10"
              onClick={() => setShowPresets(false)}
            />
            <div className="absolute right-0 mt-1 w-40 bg-white border rounded-lg shadow-lg z-20 py-1">
              {presets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPreset(preset)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DateRangePicker;
