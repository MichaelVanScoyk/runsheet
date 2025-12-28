import { useRunSheet } from '../RunSheetContext';

/**
 * Mutual Aid Section
 * Simple toggle to indicate if incident was mutual aid,
 * then exposes NERIS fields for direction, type, and station.
 */
export default function MutualAidSection() {
  const { formData, handleChange } = useRunSheet();
  
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
  };
  
  // Handle station input - store as array for NERIS compatibility
  const handleStationInput = (value) => {
    if (!value.trim()) {
      handleChange('neris_aid_departments', []);
      return;
    }
    handleChange('neris_aid_departments', [value.trim()]);
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
                ? 'We assisted another station' 
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
          
          {/* Station */}
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-xs">
              {formData.neris_aid_direction === 'GIVEN' ? 'Station Assisted' : 'Aid From Station'}
            </label>
            <input
              type="text"
              placeholder="e.g., 49"
              value={formData.neris_aid_departments?.[0] || ''}
              onChange={(e) => handleStationInput(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
