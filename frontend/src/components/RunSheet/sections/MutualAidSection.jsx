import { useRunSheet } from '../RunSheetContext';

/**
 * Mutual Aid Section
 * 
 * Three explicit options:
 * - NONE: Not a mutual aid call (our first due)
 * - GIVEN: We gave aid to another station (their first due)
 * - RECEIVED: We received aid from another station (our first due)
 * 
 * Damage Assessment only shows after this is answered, and only if NOT 'GIVEN'
 */
export default function MutualAidSection() {
  const { formData, handleChange } = useRunSheet();
  
  const direction = formData.neris_aid_direction;
  const hasAnswered = direction === 'NONE' || direction === 'GIVEN' || direction === 'RECEIVED';
  const isMutualAid = direction === 'GIVEN' || direction === 'RECEIVED';
  
  // Handle direction selection
  const handleDirectionSelect = (newDirection) => {
    handleChange('neris_aid_direction', newDirection);
    
    // Clear aid type and departments if not mutual aid
    if (newDirection === 'NONE') {
      handleChange('neris_aid_type', null);
      handleChange('neris_aid_departments', []);
    } else if (!formData.neris_aid_type) {
      // Default aid type when selecting Given/Received
      handleChange('neris_aid_type', 'MUTUAL');
    }
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
      
      {/* Main Question */}
      <div className="mb-4">
        <p className="text-gray-300 text-sm mb-3">Was mutual aid given or received on this call?</p>
        
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDirectionSelect('NONE')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              direction === 'NONE'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            No - Our First Due
          </button>
          <button
            type="button"
            onClick={() => handleDirectionSelect('GIVEN')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              direction === 'GIVEN'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Yes - We Gave Aid
          </button>
          <button
            type="button"
            onClick={() => handleDirectionSelect('RECEIVED')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              direction === 'RECEIVED'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Yes - We Received Aid
          </button>
        </div>
        
        {!hasAnswered && (
          <p className="text-xs text-yellow-500 mt-2">
            ⚠️ Please answer to continue with damage assessment
          </p>
        )}
      </div>
      
      {/* Expanded Fields when Mutual Aid (Given or Received) */}
      {isMutualAid && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-700">
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
              {direction === 'GIVEN' ? 'Station We Assisted' : 'Station That Assisted Us'}
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
      
      {/* Contextual help text */}
      {hasAnswered && (
        <p className="text-xs text-gray-500 mt-3">
          {direction === 'NONE' && '✓ This is our incident - damage assessment applies'}
          {direction === 'GIVEN' && '✓ We assisted another station - they track damage for their report'}
          {direction === 'RECEIVED' && '✓ This is our incident with assistance - damage assessment applies'}
        </p>
      )}
    </div>
  );
}
