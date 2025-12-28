import { useRunSheet } from '../RunSheetContext';

/**
 * Damage Assessment Section
 * Fields for traditional monthly chiefs report:
 * - Property value at risk
 * - Fire damages estimate
 * - Firefighter injuries
 * - Civilian injuries
 */
export default function DamageAssessment() {
  const { formData, handleChange } = useRunSheet();
  
  // Helper to format cents as dollars for display
  const centsToDisplay = (cents) => {
    if (!cents && cents !== 0) return '';
    return Math.round(cents / 100).toLocaleString();
  };
  
  // Helper to parse dollars input to cents for storage
  const dollarsToCents = (dollars) => {
    const cleaned = dollars.replace(/[^0-9]/g, '');
    const num = parseInt(cleaned, 10);
    if (isNaN(num)) return 0;
    return num * 100;
  };
  
  // Handle dollar input change
  const handleDollarChange = (field, value) => {
    const cents = dollarsToCents(value);
    handleChange(field, cents);
  };
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex items-center gap-2">
        <span>📊</span>
        Damage Assessment
        <span className="text-xs text-gray-500 font-normal ml-auto">For Chiefs Report</span>
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Property Value at Risk */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Property at Risk</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
            <input 
              type="text"
              inputMode="numeric"
              value={centsToDisplay(formData.property_value_at_risk)}
              onChange={(e) => handleDollarChange('property_value_at_risk', e.target.value)}
              placeholder="0"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 pl-7 text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none text-right"
            />
          </div>
        </div>
        
        {/* Fire Damages */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Fire Damages</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
            <input 
              type="text"
              inputMode="numeric"
              value={centsToDisplay(formData.fire_damages_estimate)}
              onChange={(e) => handleDollarChange('fire_damages_estimate', e.target.value)}
              placeholder="0"
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 pl-7 text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none text-right"
            />
          </div>
        </div>
        
        {/* FF Injuries */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">FF Injuries</label>
          <input 
            type="number"
            min="0"
            value={formData.ff_injuries_count || 0}
            onChange={(e) => handleChange('ff_injuries_count', parseInt(e.target.value) || 0)}
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none text-center"
          />
        </div>
        
        {/* Civilian Injuries */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">Civilian Injuries</label>
          <input 
            type="number"
            min="0"
            value={formData.civilian_injuries_count || 0}
            onChange={(e) => handleChange('civilian_injuries_count', parseInt(e.target.value) || 0)}
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:border-blue-500 focus:outline-none text-center"
          />
        </div>
      </div>
    </div>
  );
}
