/**
 * Personnel Stats Section for Analytics Page
 * Shows personal response statistics for logged-in firefighters
 * Each stat includes hover tooltip explaining the calculation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User, Award, Zap, Target, Truck, Clock, Loader2, Info } from 'lucide-react';
import api, { getUserSession } from '../api';

const formatDateLong = (dateStr) => {
  if (!dateStr) return '';
  const localDate = new Date(dateStr + 'T00:00:00');
  return localDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Tooltip wrapper component
const Tooltip = ({ text, children }) => (
  <div className="relative group inline-block w-full">
    {children}
    <div className="absolute z-50 hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg w-64 text-left whitespace-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
    </div>
  </div>
);

const PersonnelStatsSection = () => {
  const [userSession] = useState(getUserSession());
  const [personnelDays, setPersonnelDays] = useState(365);
  const [personnelStats, setPersonnelStats] = useState(null);
  const [personnelStatsLoading, setPersonnelStatsLoading] = useState(false);
  const [personnelList, setPersonnelList] = useState([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (userSession?.personnel_id && !selectedPersonnelId) {
      setSelectedPersonnelId(userSession.personnel_id);
    }
  }, [userSession, selectedPersonnelId]);

  useEffect(() => {
    if (userSession?.role === 'ADMIN' || userSession?.role === 'OFFICER') {
      api.get('/analytics/v2/personnel/list')
        .then(res => setPersonnelList(res.data))
        .catch(err => console.error('Failed to load personnel list:', err));
    }
  }, [userSession]);

  const loadPersonnelStats = useCallback(async () => {
    if (!selectedPersonnelId) return;
    
    setPersonnelStatsLoading(true);
    try {
      const res = await api.get('/analytics/v2/personnel/stats', {
        params: { personnel_id: selectedPersonnelId, days: personnelDays }
      });
      setPersonnelStats(res.data);
    } catch (err) {
      console.error('Failed to load personnel stats:', err);
      setPersonnelStats(null);
    } finally {
      setPersonnelStatsLoading(false);
    }
  }, [selectedPersonnelId, personnelDays]);

  useEffect(() => {
    loadPersonnelStats();
  }, [loadPersonnelStats]);

  if (!userSession) return null;

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <User className="w-5 h-5 text-gray-600" />
          <span className="font-semibold text-gray-900">My Response Stats</span>
        </div>
        <div className="flex items-center gap-3">
          {(userSession.role === 'ADMIN' || userSession.role === 'OFFICER') && personnelList.length > 0 && (
            <select
              value={selectedPersonnelId || ''}
              onChange={(e) => setSelectedPersonnelId(parseInt(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="text-sm border rounded px-2 py-1 bg-white"
            >
              {personnelList.map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-1 bg-white border rounded p-0.5" onClick={(e) => e.stopPropagation()}>
            {[30, 60, 90, 365].map(days => (
              <button
                key={days}
                onClick={() => setPersonnelDays(days)}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  personnelDays === days
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {days === 365 ? '1yr' : `${days}d`}
              </button>
            ))}
          </div>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="p-4">
          {personnelStatsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : personnelStats ? (
            <PersonnelStatsContent data={personnelStats} colors={COLORS} />
          ) : (
            <p className="text-gray-500 text-center py-4">No data available</p>
          )}
        </div>
      )}
    </div>
  );
};

const PersonnelStatsContent = ({ data, colors }) => {
  const { personnel, period, calls, first_out, time_patterns, units, roles, fun_facts, details } = data;

  const periodData = Object.entries(time_patterns.period_breakdown || {}).map(([key, val]) => ({
    name: time_patterns.period_labels?.[key] || key,
    key: key,
    value: val.count,
    percentage: val.percentage,
  }));

  return (
    <div className="space-y-6">
      {/* Personnel Name & Period */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{personnel.display_name}</h3>
          {personnel.rank && <p className="text-sm text-gray-500">{personnel.rank}</p>}
        </div>
        <p className="text-sm text-gray-500">
          {formatDateLong(period.start)} - {formatDateLong(period.end)}
        </p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Total Calls */}
        <Tooltip text="Count of FIRE and EMS incidents where you are listed in incident_personnel. Excludes DETAIL category (meetings, training, etc).">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center cursor-help">
            <p className="text-xs text-emerald-600 font-medium flex items-center justify-center gap-1">
              Total Calls <Info className="w-3 h-3" />
            </p>
            <p className="text-2xl font-bold text-emerald-700">{calls.total}</p>
            <p className="text-xs text-emerald-500">{calls.calls_per_month_avg}/mo avg</p>
          </div>
        </Tooltip>

        {/* Fire */}
        <Tooltip text="Incidents where internal_incident_number starts with 'F' (Fire calls). Based on your assignment in incident_personnel.">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center cursor-help">
            <p className="text-xs text-red-600 font-medium flex items-center justify-center gap-1">
              Fire <Info className="w-3 h-3" />
            </p>
            <p className="text-2xl font-bold text-red-700">{calls.fire}</p>
          </div>
        </Tooltip>

        {/* EMS */}
        <Tooltip text="Incidents where internal_incident_number starts with 'E' (EMS calls). Based on your assignment in incident_personnel.">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center cursor-help">
            <p className="text-xs text-blue-600 font-medium flex items-center justify-center gap-1">
              EMS <Info className="w-3 h-3" />
            </p>
            <p className="text-2xl font-bold text-blue-700">{calls.ems}</p>
          </div>
        </Tooltip>

        {/* First Out */}
        <Tooltip text={`Percentage of calls where you were on the FIRST Station 48 unit to go enroute (based on earliest time_enroute in CAD data). Excludes mutual aid units. Calculated as: ${first_out.first_out_calls} first-out calls ÷ ${first_out.total_calls_with_data} calls with CAD timing data = ${first_out.first_out_percentage}%`}>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center cursor-help">
            <p className="text-xs text-amber-600 font-medium flex items-center justify-center gap-1">
              First Out <Info className="w-3 h-3" />
            </p>
            <p className="text-2xl font-bold text-amber-700">{first_out.first_out_percentage}%</p>
            <p className="text-xs text-amber-500">{first_out.first_out_calls} calls</p>
          </div>
        </Tooltip>

        {/* Streak */}
        <Tooltip text="Consecutive weeks (Mon-Sun) with at least one FIRE or EMS response, counting backwards from the current week. Resets to 0 if you miss a full week.">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center cursor-help">
            <p className="text-xs text-purple-600 font-medium flex items-center justify-center gap-1">
              Streak <Info className="w-3 h-3" />
            </p>
            <p className="text-2xl font-bold text-purple-700">{fun_facts.current_streak_weeks}</p>
            <p className="text-xs text-purple-500">weeks</p>
          </div>
        </Tooltip>

        {/* Details */}
        <Tooltip text={`Events in the DETAIL category (meetings, worknights, training, standby, etc). Hours calculated from time_event_start to time_event_end (or time_dispatched to time_last_cleared if event times not set). Total: ${details.total_events} events, ${details.total_hours} hours.`}>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center cursor-help">
            <p className="text-xs text-gray-600 font-medium flex items-center justify-center gap-1">
              Details <Info className="w-3 h-3" />
            </p>
            <p className="text-2xl font-bold text-gray-700">{details.total_events}</p>
            <p className="text-xs text-gray-500">{details.total_hours} hrs</p>
          </div>
        </Tooltip>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Unit Distribution */}
        <div>
          <Tooltip text="Count of calls by apparatus unit (from incident_units via your incident_personnel assignment). Only counts APPARATUS category units, excludes POV/Command units.">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2 cursor-help">
              <Truck className="w-4 h-4" /> Units Ridden <Info className="w-3 h-3 text-gray-400" />
            </h4>
          </Tooltip>
          {units.by_unit?.length > 0 ? (
            <div className="space-y-2">
              {units.by_unit.slice(0, 5).map((unit, i) => (
                <Tooltip key={unit.unit} text={`${unit.count} calls on ${unit.unit} (${unit.name || unit.unit}). ${unit.percentage}% of your total apparatus responses.`}>
                  <div className="flex items-center gap-2 cursor-help">
                    <div className="w-16 text-xs font-mono text-gray-600">{unit.unit}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div 
                        className="h-full rounded-full"
                        style={{ 
                          width: `${unit.percentage}%`,
                          backgroundColor: colors[i % colors.length]
                        }}
                      />
                    </div>
                    <div className="w-12 text-xs text-right text-gray-500">{unit.count}</div>
                  </div>
                </Tooltip>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No unit data</p>
          )}
          {units.favorite_unit && (
            <p className="text-xs text-gray-500 mt-2">
              Favorite: <span className="font-medium">{units.favorite_unit}</span>
            </p>
          )}
        </div>

        {/* Role Breakdown */}
        <div>
          <Tooltip text="Your role on each call from incident_personnel.role field. DRIVER = apparatus driver, OFFICER = crew officer/OIC, FF = firefighter (default if not specified). EMT counts as FF.">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2 cursor-help">
              <Target className="w-4 h-4" /> Roles <Info className="w-3 h-3 text-gray-400" />
            </h4>
          </Tooltip>
          <div className="space-y-2">
            {[
              { key: 'driver', label: 'Driver', color: '#f59e0b', tooltip: 'Times you drove the apparatus (role = DRIVER)' },
              { key: 'officer', label: 'Officer', color: '#3b82f6', tooltip: 'Times you served as officer/OIC (role = OFFICER)' },
              { key: 'ff', label: 'Firefighter', color: '#10b981', tooltip: 'Times as firefighter/crew member (role = FF, EMT, or unspecified)' },
            ].map(role => {
              const roleData = roles[role.key];
              if (!roleData || roleData.count === 0) return null;
              return (
                <Tooltip key={role.key} text={`${role.tooltip}. ${roleData.count} calls (${roleData.percentage}% of total).`}>
                  <div className="flex items-center gap-2 cursor-help">
                    <div className="w-20 text-xs text-gray-600">{role.label}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div 
                        className="h-full rounded-full"
                        style={{ width: `${roleData.percentage}%`, backgroundColor: role.color }}
                      />
                    </div>
                    <div className="w-16 text-xs text-right text-gray-500">
                      {roleData.count} ({roleData.percentage}%)
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Time of Day */}
        <div>
          <Tooltip text="When your calls occurred based on time_dispatched (converted to local Eastern time). Daytime = 6am-4pm, Evening = 4pm-12am, Overnight = 12am-6am.">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2 cursor-help">
              <Clock className="w-4 h-4" /> Response Times <Info className="w-3 h-3 text-gray-400" />
            </h4>
          </Tooltip>
          <div className="space-y-2">
            {periodData.map((p, i) => (
              <Tooltip key={p.key} text={`${p.value} calls during ${p.name} (${p.percentage}% of calls with dispatch time data).`}>
                <div className="flex items-center gap-2 cursor-help">
                  <div className="w-24 text-xs text-gray-600">{p.name}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div 
                      className="h-full rounded-full"
                      style={{ 
                        width: `${p.percentage}%`,
                        backgroundColor: ['#f59e0b', '#3b82f6', '#6366f1'][i]
                      }}
                    />
                  </div>
                  <div className="w-12 text-xs text-right text-gray-500">{p.value}</div>
                </div>
              </Tooltip>
            ))}
          </div>
          {time_patterns.busiest_hour && (
            <p className="text-xs text-gray-500 mt-2">
              Busiest hour: <span className="font-medium">{time_patterns.busiest_hour}</span> ({time_patterns.busiest_hour_count} calls)
            </p>
          )}
        </div>
      </div>

      {/* Fun Facts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fun_facts.longest_call_mins && (
          <Tooltip text={`Longest on-scene time calculated as: time_last_cleared minus time_first_on_scene. Incident ${fun_facts.longest_call_incident} (${fun_facts.longest_call_type}).`}>
            <div className="bg-gray-50 rounded-lg p-3 cursor-help">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <Award className="w-3 h-3" /> Longest Call <Info className="w-3 h-3" />
              </div>
              <p className="font-medium text-gray-900">{fun_facts.longest_call_mins} min</p>
              <p className="text-xs text-gray-400">{fun_facts.longest_call_incident}</p>
            </div>
          </Tooltip>
        )}
        {fun_facts.busiest_day_date && (
          <Tooltip text={`Single calendar day with the most FIRE/EMS responses in this period. You responded to ${fun_facts.busiest_day_calls} calls on ${formatDateLong(fun_facts.busiest_day_date)}.`}>
            <div className="bg-gray-50 rounded-lg p-3 cursor-help">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                <Zap className="w-3 h-3" /> Busiest Day <Info className="w-3 h-3" />
              </div>
              <p className="font-medium text-gray-900">{fun_facts.busiest_day_calls} calls</p>
              <p className="text-xs text-gray-400">{formatDateLong(fun_facts.busiest_day_date)}</p>
            </div>
          </Tooltip>
        )}
        {fun_facts.first_call && (
          <Tooltip text={`Your earliest FIRE or EMS response within the selected date range. Based on incident_date and time_dispatched.`}>
            <div className="bg-gray-50 rounded-lg p-3 cursor-help">
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">First Call (period) <Info className="w-3 h-3" /></div>
              <p className="font-medium text-gray-900">{fun_facts.first_call.incident}</p>
              <p className="text-xs text-gray-400">{formatDateLong(fun_facts.first_call.date)}</p>
            </div>
          </Tooltip>
        )}
        {fun_facts.most_recent_call && (
          <Tooltip text={`Your most recent FIRE or EMS response within the selected date range. Based on incident_date and time_dispatched.`}>
            <div className="bg-gray-50 rounded-lg p-3 cursor-help">
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">Most Recent <Info className="w-3 h-3" /></div>
              <p className="font-medium text-gray-900">{fun_facts.most_recent_call.incident}</p>
              <p className="text-xs text-gray-400">{formatDateLong(fun_facts.most_recent_call.date)}</p>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Top Call Types */}
      {calls.by_type?.length > 0 && (
        <div>
          <Tooltip text="For Fire calls: uses cad_event_type (e.g., 'FIRE-STRUCT'). For EMS calls: uses cad_event_subtype if available, otherwise cad_event_type.">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1 cursor-help">
              Top Call Types <Info className="w-3 h-3 text-gray-400" />
            </h4>
          </Tooltip>
          <div className="flex flex-wrap gap-2">
            {calls.by_type.slice(0, 8).map((type) => (
              <Tooltip key={type.type} text={`${type.count} incidents of type "${type.type}"`}>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs cursor-help">
                  <span className="font-medium">{type.type}</span>
                  <span className="text-gray-400">({type.count})</span>
                </span>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Detail Participation */}
      {details.by_type?.length > 0 && (
        <div>
          <Tooltip text="Non-emergency events (call_category = 'DETAIL') grouped by detail_type. Hours = time_event_end minus time_event_start (or dispatch to clear if event times not set).">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1 cursor-help">
              Detail Participation <Info className="w-3 h-3 text-gray-400" />
            </h4>
          </Tooltip>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {details.by_type.map(type => (
              <Tooltip key={type.type} text={`${type.count} ${type.type} events totaling ${type.hours} hours.`}>
                <div className="bg-gray-50 rounded-lg p-2 text-center cursor-help">
                  <p className="text-xs text-gray-500">{type.type}</p>
                  <p className="font-medium text-gray-900">{type.count}</p>
                  <p className="text-xs text-gray-400">{type.hours} hrs</p>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonnelStatsSection;
