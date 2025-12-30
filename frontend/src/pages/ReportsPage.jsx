import { useState, useEffect, useRef } from 'react';

const API_BASE = '';

// =============================================================================
// MAIN REPORTS PAGE - AI-Powered with Traditional Reports
// =============================================================================

function ReportsPage() {
  // =========================================================================
  // STATE
  // =========================================================================
  
  // AI Query
  const [query, setQuery] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  
  // Report selection
  const [activeReport, setActiveReport] = useState('chiefs'); // chiefs, overview, personnel, unit, custom
  const [categoryFilter, setCategoryFilter] = useState('FIRE');
  
  // Date controls
  const [reportMonth, setReportMonth] = useState(() => new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(() => new Date().getFullYear());
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Report data
  const [chiefsReport, setChiefsReport] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [personnelData, setPersonnelData] = useState(null);
  const [unitData, setUnitData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  
  // Loading/UI
  const [loading, setLoading] = useState(false);

  const queryInputRef = useRef(null);

  // =========================================================================
  // LOAD DATA
  // =========================================================================

  useEffect(() => {
    loadChiefsReport();
  }, [reportMonth, reportYear, categoryFilter]);

  useEffect(() => {
    if (activeReport === 'overview') {
      loadOverviewData();
    } else if (activeReport === 'personnel') {
      loadPersonnelData();
    } else if (activeReport === 'unit') {
      loadUnitData();
    }
  }, [activeReport, startDate, endDate, categoryFilter]);

  const loadChiefsReport = async () => {
    setLoading(true);
    try {
      const params = `year=${reportYear}&month=${reportMonth}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/monthly?${params}`);
      const data = await res.json();
      setChiefsReport(data);
    } catch (err) {
      console.error('Failed to load chiefs report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOverviewData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}`;
      const [summaryRes, trendRes] = await Promise.all([
        fetch(`${API_BASE}/api/reports/summary?${params}`),
        fetch(`${API_BASE}/api/reports/monthly-trend?year=${reportYear}`),
      ]);
      setSummaryData(await summaryRes.json());
      setTrendData(await trendRes.json());
    } catch (err) {
      console.error('Failed to load overview:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPersonnelData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}&limit=50`;
      const res = await fetch(`${API_BASE}/api/reports/personnel?${params}`);
      setPersonnelData(await res.json());
    } catch (err) {
      console.error('Failed to load personnel data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUnitData = async () => {
    setLoading(true);
    try {
      const params = `start_date=${startDate}&end_date=${endDate}&category=${categoryFilter}`;
      const res = await fetch(`${API_BASE}/api/reports/by-apparatus?${params}`);
      setUnitData(await res.json());
    } catch (err) {
      console.error('Failed to load unit data:', err);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // AI QUERY HANDLER
  // =========================================================================

  const handleQuerySubmit = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    
    setQueryLoading(true);
    setQueryResult(null);
    
    try {
      // Parse natural language query and execute
      const result = await executeNaturalQuery(query);
      setQueryResult(result);
      setActiveReport('custom');
    } catch (err) {
      console.error('Query failed:', err);
      setQueryResult({ error: err.message });
    } finally {
      setQueryLoading(false);
    }
  };

  const executeNaturalQuery = async (naturalQuery) => {
    // Simple query parsing - in production this would use Claude API
    const q = naturalQuery.toLowerCase();
    
    // Detect date ranges
    let queryStart = startDate;
    let queryEnd = endDate;
    let queryCategory = null;
    
    if (q.includes('last 30 days') || q.includes('past 30 days')) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      queryStart = start.toISOString().split('T')[0];
      queryEnd = end.toISOString().split('T')[0];
    } else if (q.includes('this month') || q.includes('month to date')) {
      const now = new Date();
      queryStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      queryEnd = now.toISOString().split('T')[0];
    } else if (q.includes('this year') || q.includes('year to date') || q.includes('ytd')) {
      const now = new Date();
      queryStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      queryEnd = now.toISOString().split('T')[0];
    } else if (q.includes('last year')) {
      const now = new Date();
      queryStart = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
      queryEnd = new Date(now.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
    }
    
    // Detect category
    if (q.includes('fire')) queryCategory = 'FIRE';
    else if (q.includes('ems') || q.includes('medical')) queryCategory = 'EMS';
    
    // Detect report type and fetch data
    if (q.includes('chiefs') || q.includes('monthly report') || q.includes('chief')) {
      // Extract month/year if specified
      const monthMatch = q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
      const yearMatch = q.match(/\b(20\d{2})\b/);
      
      let month = reportMonth;
      let year = reportYear;
      
      if (monthMatch) {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        month = months.indexOf(monthMatch[1].toLowerCase()) + 1;
      }
      if (yearMatch) {
        year = parseInt(yearMatch[1]);
      }
      
      const cat = queryCategory || categoryFilter;
      const res = await fetch(`${API_BASE}/api/reports/monthly?year=${year}&month=${month}&category=${cat}`);
      const data = await res.json();
      
      return {
        type: 'chiefs',
        title: `Chiefs Report - ${data.month_name} ${data.year} (${cat})`,
        data,
        query: naturalQuery,
        // Store params for PDF download
        pdfParams: { year, month, category: cat },
      };
    }
    
    if (q.includes('personnel') || q.includes('responder') || q.includes('firefighter')) {
      const cat = queryCategory || categoryFilter;
      const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}&limit=50`;
      const res = await fetch(`${API_BASE}/api/reports/personnel?${params}`);
      const data = await res.json();
      
      return {
        type: 'personnel',
        title: `Personnel Report (${queryStart} to ${queryEnd})`,
        data,
        query: naturalQuery,
      };
    }
    
    if (q.includes('unit') || q.includes('apparatus') || q.includes('engine') || q.includes('truck')) {
      const cat = queryCategory || categoryFilter;
      const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`;
      const res = await fetch(`${API_BASE}/api/reports/by-apparatus?${params}`);
      const data = await res.json();
      
      return {
        type: 'unit',
        title: `Unit Response Report (${queryStart} to ${queryEnd})`,
        data,
        query: naturalQuery,
      };
    }
    
    if (q.includes('auto accident') || q.includes('accident') || q.includes('mva')) {
      const cat = queryCategory || 'FIRE';
      const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`;
      const res = await fetch(`${API_BASE}/api/reports/by-type?${params}`);
      const data = await res.json();
      
      // Filter to accidents
      const accidents = data.call_types?.filter(t => 
        t.call_type?.toLowerCase().includes('accident') ||
        t.call_type?.toLowerCase().includes('mva')
      ) || [];
      
      return {
        type: 'filtered',
        title: `Auto Accidents (${queryStart} to ${queryEnd})`,
        data: { call_types: accidents, total: accidents.reduce((sum, a) => sum + a.incident_count, 0) },
        query: naturalQuery,
      };
    }
    
    // Default: summary
    const cat = queryCategory || categoryFilter;
    const params = `start_date=${queryStart}&end_date=${queryEnd}&category=${cat}`;
    const res = await fetch(`${API_BASE}/api/reports/summary?${params}`);
    const data = await res.json();
    
    return {
      type: 'summary',
      title: `Summary Report (${queryStart} to ${queryEnd})`,
      data,
      query: naturalQuery,
    };
  };

  const quickQuery = (queryText) => {
    setQuery(queryText);
    setTimeout(() => handleQuerySubmit(), 100);
  };

  // =========================================================================
  // PDF DOWNLOAD - Shared function that works for both direct and query results
  // =========================================================================

  const openPrintableReport = (year, month, category) => {
    // Open WeasyPrint PDF - styled HTML converted to PDF, prints consistently
    const url = `${API_BASE}/api/reports/pdf/monthly-weasy?year=${year}&month=${month}&category=${category}`;
    window.open(url, '_blank');
  };



  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-gray-400 text-sm mt-1">
            Generate monthly chiefs reports or ask questions in plain English
          </p>
        </div>
      </div>

      {/* AI Query Bar */}
      <div className="bg-gray-800/50 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <form onSubmit={handleQuerySubmit} className="flex gap-3">
            <div className="flex-1 relative">
              <input
                ref={queryInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Try: "Show me fire calls for November 2025" or "Who ran the most calls this year?"'
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              {queryLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={queryLoading || !query.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
            >
              Run Query
            </button>
          </form>
          
          {/* Quick Query Buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-gray-500 text-sm py-1">Quick:</span>
            <button onClick={() => quickQuery('Show me the chiefs report for this month')} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
              This Month Chiefs
            </button>
            <button onClick={() => quickQuery('Fire calls year to date')} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
              YTD Fire
            </button>
            <button onClick={() => quickQuery('Top personnel responders this year')} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
              Top Responders
            </button>
            <button onClick={() => quickQuery('Auto accidents last 90 days')} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
              Recent Accidents
            </button>
            <button onClick={() => quickQuery('Unit response counts this year')} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
              Unit Stats
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Report Tabs + Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveReport('chiefs')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeReport === 'chiefs' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              📋 Monthly Report
            </button>
            <button
              onClick={() => setActiveReport('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeReport === 'overview' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              📊 Date Range
            </button>
            <button
              onClick={() => setActiveReport('personnel')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeReport === 'personnel' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              👥 Personnel
            </button>
            <button
              onClick={() => setActiveReport('unit')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeReport === 'unit' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              🚒 Units
            </button>
            {queryResult && (
              <button
                onClick={() => setActiveReport('custom')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeReport === 'custom' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-purple-900/50 text-purple-300 hover:bg-purple-900'
                }`}
              >
                ✨ Query Result
              </button>
            )}
          </div>

          {/* Category Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCategoryFilter('FIRE')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                categoryFilter === 'FIRE'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              🔥 Fire
            </button>
            <button
              onClick={() => setCategoryFilter('EMS')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                categoryFilter === 'EMS'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              🚑 EMS
            </button>
          </div>
        </div>

        {/* Report Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Loading report...</p>
          </div>
        ) : (
          <>
            {/* Chiefs Report */}
            {activeReport === 'chiefs' && (
              <ChiefsReportView
                report={chiefsReport}
                month={reportMonth}
                year={reportYear}
                category={categoryFilter}
                onMonthChange={setReportMonth}
                onYearChange={setReportYear}
                onOpenPrint={() => openPrintableReport(reportYear, reportMonth, categoryFilter)}
                showControls={true}
              />
            )}

            {/* Overview */}
            {activeReport === 'overview' && summaryData && (
              <OverviewReport
                summary={summaryData}
                trend={trendData}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                year={reportYear}
                onYearChange={setReportYear}
              />
            )}

            {/* Personnel */}
            {activeReport === 'personnel' && personnelData && (
              <PersonnelReport
                data={personnelData}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            )}

            {/* Unit */}
            {activeReport === 'unit' && unitData && (
              <UnitReport
                data={unitData}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
            )}

            {/* Custom Query Result */}
            {activeReport === 'custom' && queryResult && (
              <CustomQueryResult 
                result={queryResult} 
                onOpenPrint={openPrintableReport}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// CHIEFS REPORT VIEW - Matches Paper Format
// =============================================================================

function ChiefsReportView({ report, month, year, category, onMonthChange, onYearChange, onOpenPrint, showControls = false }) {
  if (!report) return null;

  const cs = report.call_summary || {};
  const isFireReport = category === 'FIRE';
  
  return (
    <div className="space-y-6">
      {/* Controls - only shown for main view, not embedded */}
      {showControls && (
        <div className="flex flex-wrap items-center gap-4 bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-sm">Month:</label>
            <select
              value={month}
              onChange={(e) => onMonthChange(parseInt(e.target.value))}
              className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-sm">Year:</label>
            <select
              value={year}
              onChange={(e) => onYearChange(parseInt(e.target.value))}
              className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
            >
              {[...Array(5)].map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={onOpenPrint}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              🖨️ Print Report
            </button>
          </div>
        </div>
      )}

      {/* Report Header */}
      <div className="text-center bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold">GLEN MOORE FIRE CO. MONTHLY REPORT</h2>
        <p className="text-lg text-gray-300 mt-1">
          {report.month_name} {report.year} - {category === 'FIRE' ? '🔥 Fire' : '🚑 EMS'}
        </p>
      </div>

      {/* Call Summary */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">CALL SUMMARY</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-blue-400">{cs.number_of_calls || 0}</div>
            <div className="text-gray-400 text-sm">Calls for Month</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-green-400">{cs.number_of_men || 0}</div>
            <div className="text-gray-400 text-sm">Number of Men</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">{(cs.hours || 0).toFixed(1)}</div>
            <div className="text-gray-400 text-sm">Hours</div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-purple-400">{(cs.man_hours || 0).toFixed(1)}</div>
            <div className="text-gray-400 text-sm">Man Hours</div>
          </div>
        </div>
        
        {/* Damage/Injury Stats - FIRE ONLY */}
        {isFireReport && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">${((cs.property_at_risk || 0) / 100).toLocaleString()}</div>
              <div className="text-gray-400 text-sm">Property at Risk</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400">${((cs.fire_damages || 0) / 100).toLocaleString()}</div>
              <div className="text-gray-400 text-sm">Fire Damages</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-500">{cs.ff_injuries || 0}</div>
              <div className="text-gray-400 text-sm">FF Injuries</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-pink-400">{cs.civilian_injuries || 0}</div>
              <div className="text-gray-400 text-sm">Civilian Injuries</div>
            </div>
          </div>
        )}
        
        {/* YoY Comparison */}
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <span className="text-gray-400">vs Same Month Last Year:</span>
          <span className={`font-semibold ${cs.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {cs.change >= 0 ? '+' : ''}{cs.change || 0} ({cs.percent_change >= 0 ? '+' : ''}{cs.percent_change || 0}%)
          </span>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Municipality Summary */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">MUNICIPALITY SUMMARY</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left pb-2">Municipality</th>
                  <th className="text-right pb-2">Calls</th>
                  <th className="text-right pb-2">Man Hrs</th>
                  {isFireReport && (
                    <>
                      <th className="text-right pb-2">Prop Risk</th>
                      <th className="text-right pb-2">Damages</th>
                      <th className="text-right pb-2">FF Inj</th>
                      <th className="text-right pb-2">Civ Inj</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(report.municipalities || []).map((m, i) => (
                  <tr key={i} className="border-t border-gray-700">
                    <td className="py-2">{m.municipality}</td>
                    <td className="py-2 text-right font-mono">{m.calls}</td>
                    <td className="py-2 text-right font-mono">{m.manhours?.toFixed(1)}</td>
                    {isFireReport && (
                      <>
                        <td className="py-2 text-right font-mono text-orange-400">${((m.property_at_risk || 0) / 100).toLocaleString()}</td>
                        <td className="py-2 text-right font-mono text-red-400">${((m.fire_damages || 0) / 100).toLocaleString()}</td>
                        <td className="py-2 text-right font-mono text-yellow-500">{m.ff_injuries || 0}</td>
                        <td className="py-2 text-right font-mono text-pink-400">{m.civilian_injuries || 0}</td>
                      </>
                    )}
                  </tr>
                ))}
                {(!report.municipalities || report.municipalities.length === 0) && (
                  <tr><td colSpan={isFireReport ? 7 : 3} className="py-4 text-center text-gray-500">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Responses Per Unit */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">RESPONSES PER UNIT</h3>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left pb-2">Unit</th>
                <th className="text-right pb-2">Responses</th>
              </tr>
            </thead>
            <tbody>
              {(report.responses_per_unit || []).map((u, i) => (
                <tr key={i} className="border-t border-gray-700">
                  <td className="py-2">{u.unit_name || u.unit}</td>
                  <td className="py-2 text-right font-mono">{u.responses}</td>
                </tr>
              ))}
              {(!report.responses_per_unit || report.responses_per_unit.length === 0) && (
                <tr><td colSpan="2" className="py-4 text-center text-gray-500">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Type of Incident */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">TYPE OF INCIDENT</h3>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left pb-2">Type</th>
                <th className="text-right pb-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {(report.incident_types || []).map((t, i) => (
                <tr key={i} className="border-t border-gray-700">
                  <td className="py-2">{t.type}</td>
                  <td className="py-2 text-right font-mono">{t.count}</td>
                </tr>
              ))}
              {(!report.incident_types || report.incident_types.length === 0) && (
                <tr><td colSpan="2" className="py-4 text-center text-gray-500">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mutual Aid - FIRE ONLY */}
        {isFireReport && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">MUTUAL AID ASSIST TO</h3>
            <table className="w-full">
              <thead>
                <tr className="text-gray-400 text-sm">
                  <th className="text-left pb-2">Station</th>
                  <th className="text-right pb-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {(report.mutual_aid || []).map((ma, i) => (
                  <tr key={i} className="border-t border-gray-700">
                    <td className="py-2">{ma.station}</td>
                    <td className="py-2 text-right font-mono">{ma.count}</td>
                  </tr>
                ))}
                {(!report.mutual_aid || report.mutual_aid.length === 0) && (
                  <tr><td colSpan="2" className="py-4 text-center text-gray-500">None</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Response Times */}
      {report.response_times && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">RESPONSE TIMES</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {report.response_times.avg_turnout_minutes?.toFixed(1) || '-'} min
              </div>
              <div className="text-gray-400 text-sm">Avg Turnout</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {report.response_times.avg_response_minutes?.toFixed(1) || '-'} min
              </div>
              <div className="text-gray-400 text-sm">Avg Response</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {report.response_times.avg_on_scene_minutes?.toFixed(1) || '-'} min
              </div>
              <div className="text-gray-400 text-sm">Avg On Scene</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// OVERVIEW REPORT
// =============================================================================

function OverviewReport({ summary, trend, startDate, endDate, onStartDateChange, onEndDateChange, year, onYearChange }) {
  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Date Range Controls */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-blue-400">{summary.total_incidents}</div>
          <div className="text-gray-400 mt-1">Total Incidents</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-green-400">{summary.total_personnel_responses}</div>
          <div className="text-gray-400 mt-1">Personnel Responses</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-yellow-400">{summary.total_manhours?.toFixed(1)}</div>
          <div className="text-gray-400 mt-1">Total Manhours</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-purple-400">
            {summary.response_times?.avg_response_minutes?.toFixed(1) || '-'}
          </div>
          <div className="text-gray-400 mt-1">Avg Response (min)</div>
        </div>
      </div>

      {/* Monthly Trend */}
      {trend && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Monthly Trend - {year}</h3>
            <select
              value={year}
              onChange={(e) => onYearChange(parseInt(e.target.value))}
              className="bg-gray-900 border border-gray-600 rounded px-3 py-1 text-sm"
            >
              {[...Array(5)].map((_, i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
          <div className="flex items-end gap-1 h-48">
            {trend.months?.map((m, i) => {
              const maxCount = Math.max(...trend.months.map(x => x.incident_count), 1);
              const height = (m.incident_count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex flex-col items-center justify-end h-40">
                    <span className="text-xs text-gray-400 mb-1">{m.incident_count || ''}</span>
                    <div
                      className="w-full bg-blue-500 rounded-t transition-all"
                      style={{ height: `${height}%`, minHeight: m.incident_count > 0 ? '4px' : '0' }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 mt-2">{m.month_name?.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>
          <div className="text-center mt-4 text-gray-400">
            Total: <span className="font-bold text-white">{trend.total_incidents}</span> incidents
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// PERSONNEL REPORT
// =============================================================================

function PersonnelReport({ data, startDate, endDate, onStartDateChange, onEndDateChange }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Date Controls */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
          />
        </div>
      </div>

      {/* Personnel Table */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Top Responders</h3>
        <table className="w-full">
          <thead>
            <tr className="text-gray-400 text-sm">
              <th className="text-left pb-3">#</th>
              <th className="text-left pb-3">Name</th>
              <th className="text-left pb-3">Rank</th>
              <th className="text-right pb-3">Calls</th>
              <th className="text-right pb-3">Hours</th>
            </tr>
          </thead>
          <tbody>
            {(data.personnel || []).map((p, i) => (
              <tr key={p.id} className={`border-t border-gray-700 ${i < 3 ? 'bg-gray-700/30' : ''}`}>
                <td className="py-3 text-2xl">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-gray-500 text-sm">{i + 1}</span>}
                </td>
                <td className="py-3 font-medium">{p.name}</td>
                <td className="py-3 text-gray-400">{p.rank || '-'}</td>
                <td className="py-3 text-right font-mono text-blue-400">{p.incident_count}</td>
                <td className="py-3 text-right font-mono text-green-400">{p.total_hours?.toFixed(1)}</td>
              </tr>
            ))}
            {(!data.personnel || data.personnel.length === 0) && (
              <tr><td colSpan="5" className="py-8 text-center text-gray-500">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// =============================================================================
// UNIT REPORT
// =============================================================================

function UnitReport({ data, startDate, endDate, onStartDateChange, onEndDateChange }) {
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Date Controls */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">From:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">To:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="bg-gray-900 border border-gray-600 rounded px-3 py-2"
          />
        </div>
      </div>

      {/* Unit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data.apparatus || []).map((u, i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-bold">{u.unit_designator}</span>
              <span className="text-gray-400 text-sm">{u.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{u.incident_count}</div>
                <div className="text-gray-400 text-xs">Incidents</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{u.total_responses}</div>
                <div className="text-gray-400 text-xs">Responses</div>
              </div>
            </div>
          </div>
        ))}
        {(!data.apparatus || data.apparatus.length === 0) && (
          <div className="col-span-full py-8 text-center text-gray-500">No unit data</div>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// CUSTOM QUERY RESULT
// =============================================================================

function CustomQueryResult({ result, onOpenPrint }) {
  if (!result) return null;

  if (result.error) {
    return (
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
        <h3 className="text-red-400 font-semibold mb-2">Query Error</h3>
        <p className="text-gray-300">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Query Info + PDF Button for chiefs reports */}
      <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-purple-300">
              <span>✨</span>
              <span className="font-medium">{result.title}</span>
            </div>
            <p className="text-gray-400 text-sm mt-1">Query: "{result.query}"</p>
          </div>
          {result.type === 'chiefs' && result.pdfParams && (
            <button
              onClick={() => onOpenPrint(result.pdfParams.year, result.pdfParams.month, result.pdfParams.category)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              🖨️ Print Report
            </button>
          )}
        </div>
      </div>

      {/* Result based on type */}
      {result.type === 'chiefs' && result.data && (
        <ChiefsReportView
          report={result.data}
          month={result.data.month}
          year={result.data.year}
          category={result.data.category_filter || 'FIRE'}
          onMonthChange={() => {}}
          onYearChange={() => {}}
          onOpenPrint={() => onOpenPrint(result.pdfParams.year, result.pdfParams.month, result.pdfParams.category)}
          showControls={false}
        />
      )}

      {result.type === 'personnel' && result.data && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold border-b border-gray-700 pb-2 mb-4">Personnel Results</h3>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left pb-3">#</th>
                <th className="text-left pb-3">Name</th>
                <th className="text-left pb-3">Rank</th>
                <th className="text-right pb-3">Calls</th>
                <th className="text-right pb-3">Hours</th>
              </tr>
            </thead>
            <tbody>
              {(result.data.personnel || []).map((p, i) => (
                <tr key={p.id} className={`border-t border-gray-700 ${i < 3 ? 'bg-gray-700/30' : ''}`}>
                  <td className="py-3">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                  <td className="py-3 font-medium">{p.name}</td>
                  <td className="py-3 text-gray-400">{p.rank || '-'}</td>
                  <td className="py-3 text-right font-mono text-blue-400">{p.incident_count}</td>
                  <td className="py-3 text-right font-mono text-green-400">{p.total_hours?.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.type === 'unit' && result.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(result.data.apparatus || []).map((u, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-6">
              <div className="font-bold text-lg">{u.unit_designator}</div>
              <div className="text-gray-400 text-sm">{u.name}</div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{u.incident_count}</div>
                  <div className="text-xs text-gray-400">Incidents</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{u.total_responses}</div>
                  <div className="text-xs text-gray-400">Responses</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.type === 'filtered' && result.data && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-center mb-4">
            <div className="text-4xl font-bold text-blue-400">{result.data.total}</div>
            <div className="text-gray-400">Total Incidents</div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left pb-3">Call Type</th>
                <th className="text-right pb-3">Count</th>
              </tr>
            </thead>
            <tbody>
              {(result.data.call_types || []).map((t, i) => (
                <tr key={i} className="border-t border-gray-700">
                  <td className="py-3">{t.call_type}</td>
                  <td className="py-3 text-right font-mono">{t.incident_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.type === 'summary' && result.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-blue-400">{result.data.total_incidents}</div>
            <div className="text-gray-400 mt-1">Total Incidents</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-green-400">{result.data.total_personnel_responses}</div>
            <div className="text-gray-400 mt-1">Personnel Responses</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-yellow-400">{result.data.total_manhours?.toFixed(1)}</div>
            <div className="text-gray-400 mt-1">Total Manhours</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <div className="text-4xl font-bold text-purple-400">
              {result.data.response_times?.avg_response_minutes?.toFixed(1) || '-'}
            </div>
            <div className="text-gray-400 mt-1">Avg Response (min)</div>
          </div>
        </div>
      )}
    </div>
  );
}


export default ReportsPage;
