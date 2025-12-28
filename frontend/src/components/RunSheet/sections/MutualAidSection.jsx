import { useRunSheet } from '../RunSheetContext';

/**
 * Mutual Aid Section
 * Simple toggle to indicate if incident was mutual aid,
 * then exposes NERIS fields for direction, type, and station.
 */
export default function MutualAidSection() {
  const { formData, handleChange, aidTypes, aidDirections } = useRunSheet();
  
  // Common mutual aid stations for quick selection
  const commonStations = [
    { code: '33', name: 'Station 33 - Elverson' },
    { code: '47', name: 'Station 47 - Lionville' },
    { code: '49', name: 'Station 49 - Honey Brook' },
    { code: '69', name: 'Station 69 - Ludwig\'s Corner' },
    { code: '73', name: 'Station 73 - Exton' },
    { code: '39', name: 'Station 39 - West Brandywine' },
    { code: '45', name: 'Station 45 - Westwood' },
  ];
  
  // Check if mutual aid is active (direction is GIVEN or RECEIVED)
  const isMutualAid = formData.neris_aid_direction === 'GIVEN' || formData.neris_aid_direction === 'RECEIVED';
  
  // Toggle mutual aid on/off
  const handleToggle = () => {
    if (isMutualAid) {
      // Turn off - clear all fields
      handleChange('neris_aid_direction', null);
      handleChange('neris_aid_type', null);
      handleChange('neris_aid_departments', []);
    } else {
      // Turn on - default to GIVEN since that's most common for reporting
      handleChange('neris_aid_direction', 'GIVEN');
      handleChange('neris_aid_type', 'MUTUAL');
    }
  };
  
  // Handle direction change
  const handleDirectionChange = (direction) => {
    handleChange('neris_aid_direction', direction);
    // Clear departments when switching direction
    handleChange('neris_aid_departments', []);
  };
  
  // Handle station selection for GIVEN
  const handleStationSelect = (stationCode) => {
    if (!stationCode) {
      handleChange('neris_aid_departments', []);
      return;
    }
    const station = commonStations.find(s => s.code === stationCode);
    const stationName = station ? station.name : `Station ${stationCode}`;
    handleChange('neris_aid_departments', [stationName]);
  };
  
  // Handle custom department input for RECEIVED
  const handleDepartmentInput = (value) => {
    if (!value.trim()) {
      handleChange('neris_aid_departments', []);
      return;
    }
    // Split by comma for multiple departments
    const depts = value.split(',').map(d => d.trim()).filter(Boolean);
    handleChange('neris_aid_departments', depts);
  };
  
  // Get current station code from departments array
  const getCurrentStationCode = () => {
    if (!formData.neris_aid_departments || formData.neris_aid_departments.length === 0) return '';
    const dept = formData.neris_aid_departments[0];
    // Try to extract station code
    const match = dept.match(/Station (\d+)/i);
    if (match) return match[1];
    // Check if it matches a known station
    const known = commonStations.find(s => s.name === dept || s.code === dept);
    return known ? known.code : 'other';
  };
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex items-center gap-2">
        <span>🤝</span>
        Mutual Aid
        <span className="text-xs text-gray-500 font-normal ml-auto">For Chiefs Report & NERIS</span>
      </h3>
      
      {/* Main Toggle */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-gray-400 text-sm">Was this a mutual aid incident?</span>
        <button
          type="button"
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isMutualAid ? 'bg-blue-600' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isMutualAid ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className={`text-sm font-medium ${isMutualAid ? 'text-blue-400' : 'text-gray-500'}`}>
          {isMutualAid ? 'Yes' : 'No'}
        </span>
      </div>
      
      {/* Expanded Fields when Mutual Aid is ON */}
      {isMutualAid && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-700">
          {/* Direction */}
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-xs">Direction</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDirectionChange('GIVEN')}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  formData.neris_aid_direction === 'GIVEN'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                Given
              </button>
              <button
                type="button"
                onClick={() => handleDirectionChange('RECEIVED')}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  formData.neris_aid_direction === 'RECEIVED'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                Received
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formData.neris_aid_direction === 'GIVEN' 
                ? 'We responded to assist another station' 
                : 'Another station assisted us'}
            </p>
          </div>
          
          {/* Type */}
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-xs">Aid Type</label>
            <select
              value={formData.neris_aid_type || ''}
              onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select type...</option>
              <option value="AUTOMATIC">Automatic Aid</option>
              <option value="MUTUAL">Mutual Aid</option>
              <option value="OTHER">Other</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Automatic = pre-arranged, Mutual = requested
            </p>
          </div>
          
          {/* Station/Department */}
          <div className="flex flex-col gap-1">
            {formData.neris_aid_direction === 'GIVEN' ? (
              <>
                <label className="text-gray-400 text-xs">Station Assisted</label>
                <select
                  value={getCurrentStationCode()}
                  onChange={(e) => handleStationSelect(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select station...</option>
                  {commonStations.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                  <option value="other">Other...</option>
                </select>
                {getCurrentStationCode() === 'other' && (
                  <input
                    type="text"
                    placeholder="Enter station/department name"
                    value={formData.neris_aid_departments?.[0] || ''}
                    onChange={(e) => handleChange('neris_aid_departments', e.target.value ? [e.target.value] : [])}
                    className="mt-2 w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                )}
              </>
            ) : (
              <>
                <label className="text-gray-400 text-xs">Aid Received From</label>
                <input
                  type="text"
                  placeholder="e.g., Station 49, Station 69"
                  value={formData.neris_aid_departments?.join(', ') || ''}
                  onChange={(e) => handleDepartmentInput(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate multiple with commas
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
