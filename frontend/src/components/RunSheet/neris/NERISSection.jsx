import { useRunSheet, getNerisDisplayName, hasFireType, hasMedicalType, hasHazsitType, hasStructureFireType, hasOutsideFireType, hasIncidentSubtype, NERIS_DESCRIPTIONS } from '../RunSheetContext';
import { InfoTooltip } from '../shared';
import NerisModal from './NerisModal';

export default function NERISSection() {
  const ctx = useRunSheet();
  const { 
    formData, 
    handleChange,
    showNeris,
    setShowNeris,
    incidentTypes,
    locationUses,
    actionsTaken,
    showIncidentTypeModal,
    setShowIncidentTypeModal,
    showLocationUseModal,
    setShowLocationUseModal,
    showActionsModal,
    setShowActionsModal,
    handleNerisTypeToggle,
    handleActionToggle,
    handleLocationUseToggle,
    getLocationUseValue,
    // Dropdown options
    noActionCodes,
    aidTypes,
    aidDirections,
    rrPresenceCodes,
    smokeAlarmTypeCodes,
    fireAlarmTypeCodes,
    otherAlarmTypeCodes,
    alarmOperationCodes,
    alarmFailureCodes,
    sprinklerTypeCodes,
    sprinklerOperationCodes,
    cookingSuppressionCodes,
    fullPartialCodes,
    exposureLocCodes,
    exposureItemCodes,
    emergHazElecCodes,
    emergHazPvIgnCodes,
    fireInvestNeedCodes,
    fireConditionArrivalCodes,
    fireBldgDamageCodes,
    fireCauseInCodes,
    fireCauseOutCodes,
    roomCodes,
    medicalPatientCareCodes,
    hazardDispositionCodes,
    hazardDotCodes,
  } = ctx;

  // Per context doc: NERIS only shows for FIRE category
  if (formData.call_category !== 'FIRE') return null;
  
  return (
    <div className="pt-3 border-t border-dark-border">
      <button 
        className="btn btn-secondary w-full sm:w-auto"
        onClick={() => setShowNeris(!showNeris)}
      >
        {showNeris ? '▲ Hide NERIS' : '▼ NERIS Fields'}
      </button>

      {showNeris && (
        <div className="mt-3 bg-dark-hover rounded p-3">
          <h4 className="text-accent-red text-sm font-semibold mb-3">NERIS Classification</h4>
          
          {/* Incident Type */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs block mb-1">Incident Type (max 3)</label>
            <button 
              type="button" 
              className="w-full bg-dark-card border border-dark-border rounded px-3 py-2 text-white text-left flex justify-between items-center text-sm hover:border-accent-red"
              onClick={() => setShowIncidentTypeModal(true)}
            >
              <span>{formData.neris_incident_type_codes?.length > 0 ? `${formData.neris_incident_type_codes.length} selected` : 'Select incident type...'}</span>
              <span className="text-accent-red text-xs">▼</span>
            </button>
            {formData.neris_incident_type_codes?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formData.neris_incident_type_codes.map(val => (
                  <span key={val} className="inline-flex items-center gap-1.5 bg-accent-red text-white px-2.5 py-1 rounded-full text-xs font-medium">
                    {getNerisDisplayName(val)}
                    <button 
                      className="bg-white/25 hover:bg-white/40 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                      type="button" 
                      onClick={() => handleNerisTypeToggle(val)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Location Use */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs block mb-1">Location Use</label>
            <button 
              type="button" 
              className="w-full bg-dark-card border border-dark-border rounded px-3 py-2 text-white text-left flex justify-between items-center text-sm hover:border-accent-red"
              onClick={() => setShowLocationUseModal(true)}
            >
              <span>{getLocationUseValue() ? getNerisDisplayName(getLocationUseValue()) : 'Select location use...'}</span>
              <span className="text-accent-red text-xs">▼</span>
            </button>
            {getLocationUseValue() && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1.5 bg-accent-red text-white px-2.5 py-1 rounded-full text-xs font-medium">
                  {getNerisDisplayName(getLocationUseValue())}
                  <button 
                    className="bg-white/25 hover:bg-white/40 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                    type="button" 
                    onClick={() => handleChange('neris_location_use', null)}
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
          </div>

          {/* Actions Taken */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs block mb-1">Actions Taken</label>
            <button 
              type="button" 
              className="w-full bg-dark-card border border-dark-border rounded px-3 py-2 text-white text-left flex justify-between items-center text-sm hover:border-accent-red"
              onClick={() => setShowActionsModal(true)}
            >
              <span>{formData.neris_action_codes?.length > 0 ? `${formData.neris_action_codes.length} selected` : 'Select actions taken...'}</span>
              <span className="text-accent-red text-xs">▼</span>
            </button>
            {formData.neris_action_codes?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formData.neris_action_codes.map(val => (
                  <span key={val} className="inline-flex items-center gap-1.5 bg-accent-red text-white px-2.5 py-1 rounded-full text-xs font-medium">
                    {getNerisDisplayName(val)}
                    <button 
                      className="bg-white/25 hover:bg-white/40 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                      type="button" 
                      onClick={() => handleActionToggle(val)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* No Action Reason */}
          {(!formData.neris_action_codes || formData.neris_action_codes.length === 0) && (
            <div className="mb-3">
              <label className="text-gray-400 text-xs block mb-1">No Action Reason</label>
              <select 
                value={formData.neris_noaction_code || ''} 
                onChange={(e) => handleChange('neris_noaction_code', e.target.value || null)}
              >
                <option value="">Select if no actions taken...</option>
                {noActionCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* People Present */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
              People Present?
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.people_present} />
            </label>
            <div className="flex gap-4">
              {[
                { value: true, label: 'Yes' },
                { value: false, label: 'No' },
                { value: null, label: 'Unknown' },
              ].map(opt => (
                <label key={String(opt.value)} className="flex items-center gap-1.5 text-gray-300 text-sm cursor-pointer">
                  <input 
                    type="radio" 
                    name="people_present" 
                    checked={formData.neris_people_present === opt.value}
                    onChange={() => handleChange('neris_people_present', opt.value)}
                    className="accent-accent-red"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* People Displaced */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
              People Displaced
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.displaced} />
            </label>
            <input 
              type="number" 
              min="0" 
              value={formData.neris_displaced_number ?? 0}
              onChange={(e) => handleChange('neris_displaced_number', parseInt(e.target.value) || 0)}
              className="w-24"
            />
          </div>

          {/* Mutual Aid */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
              Mutual Aid
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.mutual_aid} />
            </label>
            <div className="flex flex-wrap gap-2">
              <select 
                value={formData.neris_aid_direction || ''} 
                onChange={(e) => handleChange('neris_aid_direction', e.target.value || null)}
                className="min-w-[150px]"
              >
                <option value="">No mutual aid</option>
                {aidDirections.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.value}
                  </option>
                ))}
              </select>
              {formData.neris_aid_direction && (
                <select 
                  value={formData.neris_aid_type || ''} 
                  onChange={(e) => handleChange('neris_aid_type', e.target.value || null)}
                  className="min-w-[150px]"
                >
                  <option value="">Select type...</option>
                  {aidTypes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.value}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Risk Reduction */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-2">
              Risk Reduction
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.risk_reduction} />
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'smoke_alarm_presence', label: 'Smoke Alarm' },
                { key: 'fire_alarm_presence', label: 'Fire Alarm' },
                { key: 'fire_suppression_presence', label: 'Sprinklers' },
              ].map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <span className="text-gray-500 text-xs">{label}</span>
                  <select 
                    value={formData.neris_risk_reduction?.[key] || ''} 
                    onChange={(e) => handleChange('neris_risk_reduction', {
                      ...formData.neris_risk_reduction,
                      [key]: e.target.value || null
                    })}
                    className="text-sm"
                  >
                    <option value="">--</option>
                    {rrPresenceCodes.map(code => (
                      <option key={code.value} value={code.value}>
                        {code.description || code.display_text || code.value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="flex flex-col gap-0.5">
                <span className="text-gray-500 text-xs">Other Alarm</span>
                <select 
                  value={formData.neris_rr_other_alarm || ''} 
                  onChange={(e) => handleChange('neris_rr_other_alarm', e.target.value || null)}
                  className="text-sm"
                >
                  <option value="">--</option>
                  {rrPresenceCodes.map(code => (
                    <option key={code.value} value={code.value}>
                      {code.description || code.display_text || code.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Smoke Alarm Details */}
            {formData.neris_risk_reduction?.smoke_alarm_presence === 'PRESENT' && (
              <RiskReductionDetails 
                title="Smoke Alarm Details"
                typeField="neris_rr_smoke_alarm_type"
                typeCodes={smokeAlarmTypeCodes}
                workingField="neris_rr_smoke_alarm_working"
                operationField="neris_rr_smoke_alarm_operation"
                operationCodes={alarmOperationCodes}
                failureField="neris_rr_smoke_alarm_failure"
                failureCodes={alarmFailureCodes}
                formData={formData}
                handleChange={handleChange}
              />
            )}
            
            {/* Fire Alarm Details */}
            {formData.neris_risk_reduction?.fire_alarm_presence === 'PRESENT' && (
              <RiskReductionDetails 
                title="Fire Alarm Details"
                typeField="neris_rr_fire_alarm_type"
                typeCodes={fireAlarmTypeCodes}
                operationField="neris_rr_fire_alarm_operation"
                operationCodes={alarmOperationCodes}
                formData={formData}
                handleChange={handleChange}
              />
            )}
            
            {/* Other Alarm Details */}
            {formData.neris_rr_other_alarm === 'PRESENT' && (
              <RiskReductionDetails 
                title="Other Alarm Details"
                typeField="neris_rr_other_alarm_type"
                typeCodes={otherAlarmTypeCodes}
                formData={formData}
                handleChange={handleChange}
              />
            )}
            
            {/* Sprinkler Details */}
            {formData.neris_risk_reduction?.fire_suppression_presence === 'PRESENT' && (
              <SprinklerDetails 
                formData={formData}
                handleChange={handleChange}
                sprinklerTypeCodes={sprinklerTypeCodes}
                fullPartialCodes={fullPartialCodes}
                sprinklerOperationCodes={sprinklerOperationCodes}
                alarmFailureCodes={alarmFailureCodes}
              />
            )}
          </div>

          {/* Cooking Suppression */}
          {hasIncidentSubtype(formData.neris_incident_type_codes, 'CONFINED_COOKING') && (
            <div className="mb-3">
              <label className="text-gray-400 text-xs mb-2 block">Cooking Fire Suppression</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-gray-500 text-xs">Presence</span>
                  <select 
                    value={formData.neris_rr_cooking_suppression || ''}
                    onChange={(e) => handleChange('neris_rr_cooking_suppression', e.target.value || null)}
                  >
                    <option value="">--</option>
                    {rrPresenceCodes.map(code => (
                      <option key={code.value} value={code.value}>
                        {code.description || code.display_text || code.value}
                      </option>
                    ))}
                  </select>
                </div>
                {formData.neris_rr_cooking_suppression === 'PRESENT' && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-gray-500 text-xs">Type(s)</span>
                    <select 
                      multiple
                      value={formData.neris_rr_cooking_suppression_type || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                        handleChange('neris_rr_cooking_suppression_type', selected);
                      }}
                      className="min-h-[60px]"
                    >
                      {cookingSuppressionCodes.map(code => (
                        <option key={code.value} value={code.value}>
                          {code.description || code.display_text || code.value}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Emerging Hazards */}
          <EmergingHazards 
            formData={formData}
            handleChange={handleChange}
            emergHazElecCodes={emergHazElecCodes}
            emergHazPvIgnCodes={emergHazPvIgnCodes}
          />

          {/* Exposures */}
          {hasStructureFireType(formData.neris_incident_type_codes) && (
            <Exposures 
              formData={formData}
              handleChange={handleChange}
              exposureLocCodes={exposureLocCodes}
              exposureItemCodes={exposureItemCodes}
            />
          )}

          {/* Narratives */}
          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
              Impedance
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.impedance} />
            </label>
            <textarea 
              value={formData.neris_narrative_impedance || ''}
              onChange={(e) => handleChange('neris_narrative_impedance', e.target.value)}
              rows={2}
              placeholder="Traffic, access issues, weather, etc."
            />
          </div>

          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
              Outcome
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.outcome} />
            </label>
            <textarea 
              value={formData.neris_narrative_outcome || ''}
              onChange={(e) => handleChange('neris_narrative_outcome', e.target.value)}
              rows={2}
              placeholder="Brief description of resolution"
            />
          </div>

          {/* Fire Module */}
          {hasFireType(formData.neris_incident_type_codes) && (
            <FireModule 
              formData={formData}
              handleChange={handleChange}
              fireInvestNeedCodes={fireInvestNeedCodes}
              fireConditionArrivalCodes={fireConditionArrivalCodes}
              fireBldgDamageCodes={fireBldgDamageCodes}
              roomCodes={roomCodes}
              fireCauseInCodes={fireCauseInCodes}
              fireCauseOutCodes={fireCauseOutCodes}
            />
          )}

          {/* Medical Module */}
          {hasMedicalType(formData.neris_incident_type_codes) && (
            <MedicalModule 
              formData={formData}
              handleChange={handleChange}
              medicalPatientCareCodes={medicalPatientCareCodes}
            />
          )}

          {/* Hazmat Module */}
          {hasHazsitType(formData.neris_incident_type_codes) && (
            <HazmatModule 
              formData={formData}
              handleChange={handleChange}
              hazardDispositionCodes={hazardDispositionCodes}
              hazardDotCodes={hazardDotCodes}
            />
          )}
        </div>
      )}

      {/* Modals */}
      <NerisModal
        isOpen={showIncidentTypeModal}
        onClose={() => setShowIncidentTypeModal(false)}
        title="Select Incident Type"
        data={incidentTypes}
        selected={formData.neris_incident_type_codes || []}
        onToggle={handleNerisTypeToggle}
        maxSelections={3}
        dataType="children"
      />
      <NerisModal
        isOpen={showLocationUseModal}
        onClose={() => setShowLocationUseModal(false)}
        title="Select Location Use"
        data={locationUses}
        selected={getLocationUseValue()}
        onToggle={handleLocationUseToggle}
        dataType="subtypes"
      />
      <NerisModal
        isOpen={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        title="Select Actions Taken"
        data={actionsTaken}
        selected={formData.neris_action_codes || []}
        onToggle={handleActionToggle}
        dataType="children"
      />
    </div>
  );
}

// Sub-components for cleaner organization

function RiskReductionDetails({ title, typeField, typeCodes, workingField, operationField, operationCodes, failureField, failureCodes, formData, handleChange }) {
  return (
    <div className="mt-2 p-2 bg-dark-border/30 rounded border border-dark-border">
      <div className="text-accent-red text-xs font-semibold uppercase tracking-wide mb-2">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-500 text-xs">Type(s)</span>
          <select 
            multiple
            value={formData[typeField] || []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, opt => opt.value);
              handleChange(typeField, selected);
            }}
            className="min-h-[60px] text-sm"
          >
            {typeCodes.map(code => (
              <option key={code.value} value={code.value}>
                {code.description || code.display_text || code.value}
              </option>
            ))}
          </select>
        </div>
        {workingField && (
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-500 text-xs">Working?</span>
            <select 
              value={formData[workingField] === null ? '' : formData[workingField].toString()}
              onChange={(e) => handleChange(workingField, e.target.value === '' ? null : e.target.value === 'true')}
            >
              <option value="">--</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        )}
        {operationField && operationCodes && (
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-500 text-xs">Operation</span>
            <select 
              value={formData[operationField] || ''}
              onChange={(e) => handleChange(operationField, e.target.value || null)}
            >
              <option value="">--</option>
              {operationCodes.map(code => (
                <option key={code.value} value={code.value}>
                  {code.description || code.display_text || code.value}
                </option>
              ))}
            </select>
          </div>
        )}
        {failureField && failureCodes && (
          <div className="flex flex-col gap-0.5">
            <span className="text-gray-500 text-xs">Failure Reason</span>
            <select 
              value={formData[failureField] || ''}
              onChange={(e) => handleChange(failureField, e.target.value || null)}
            >
              <option value="">--</option>
              {failureCodes.map(code => (
                <option key={code.value} value={code.value}>
                  {code.description || code.display_text || code.value}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function SprinklerDetails({ formData, handleChange, sprinklerTypeCodes, fullPartialCodes, sprinklerOperationCodes, alarmFailureCodes }) {
  return (
    <div className="mt-2 p-2 bg-dark-border/30 rounded border border-dark-border">
      <div className="text-accent-red text-xs font-semibold uppercase tracking-wide mb-2">Sprinkler Details</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-500 text-xs">Type(s)</span>
          <select 
            multiple
            value={formData.neris_rr_sprinkler_type || []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, opt => opt.value);
              handleChange('neris_rr_sprinkler_type', selected);
            }}
            className="min-h-[60px] text-sm"
          >
            {sprinklerTypeCodes.map(code => (
              <option key={code.value} value={code.value}>
                {code.description || code.display_text || code.value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-500 text-xs">Coverage</span>
          <select 
            value={formData.neris_rr_sprinkler_coverage || ''}
            onChange={(e) => handleChange('neris_rr_sprinkler_coverage', e.target.value || null)}
          >
            <option value="">--</option>
            {fullPartialCodes.map(code => (
              <option key={code.value} value={code.value}>
                {code.description || code.display_text || code.value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-500 text-xs">Operation</span>
          <select 
            value={formData.neris_rr_sprinkler_operation || ''}
            onChange={(e) => handleChange('neris_rr_sprinkler_operation', e.target.value || null)}
          >
            <option value="">--</option>
            {sprinklerOperationCodes.map(code => (
              <option key={code.value} value={code.value}>
                {code.description || code.display_text || code.value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-500 text-xs">Heads</span>
          <input 
            type="number"
            min="0"
            value={formData.neris_rr_sprinkler_heads_activated ?? ''}
            onChange={(e) => handleChange('neris_rr_sprinkler_heads_activated', e.target.value ? parseInt(e.target.value) : null)}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-500 text-xs">Failure</span>
          <select 
            value={formData.neris_rr_sprinkler_failure || ''}
            onChange={(e) => handleChange('neris_rr_sprinkler_failure', e.target.value || null)}
          >
            <option value="">--</option>
            {alarmFailureCodes.map(code => (
              <option key={code.value} value={code.value}>
                {code.description || code.display_text || code.value}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function EmergingHazards({ formData, handleChange, emergHazElecCodes, emergHazPvIgnCodes }) {
  return (
    <div className="mb-3">
      <label className="text-gray-400 text-xs flex items-center gap-1 mb-2">
        Emerging Hazards
        <InfoTooltip text={NERIS_DESCRIPTIONS.fields.emerging_hazards} />
      </label>
      <div className="flex flex-col gap-2">
        {/* EV/Battery */}
        <div className="p-2 bg-dark-border/20 rounded border border-dark-border">
          <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
            <input 
              type="checkbox"
              checked={formData.neris_emerging_hazard?.ev_battery?.present || false}
              onChange={(e) => handleChange('neris_emerging_hazard', {
                ...formData.neris_emerging_hazard,
                ev_battery: { ...formData.neris_emerging_hazard?.ev_battery, present: e.target.checked }
              })}
              className="accent-accent-red"
            />
            EV / Battery Storage
          </label>
          {formData.neris_emerging_hazard?.ev_battery?.present && (
            <div className="mt-2 pt-2 border-t border-dark-border flex flex-wrap gap-2 items-center">
              <select 
                value={formData.neris_emerging_hazard?.ev_battery?.type || ''}
                onChange={(e) => handleChange('neris_emerging_hazard', {
                  ...formData.neris_emerging_hazard,
                  ev_battery: { ...formData.neris_emerging_hazard?.ev_battery, type: e.target.value || null }
                })}
                className="min-w-[150px]"
              >
                <option value="">Select type...</option>
                {emergHazElecCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-gray-400 text-sm cursor-pointer">
                <input 
                  type="checkbox"
                  checked={formData.neris_emerging_hazard?.ev_battery?.crash || false}
                  onChange={(e) => handleChange('neris_emerging_hazard', {
                    ...formData.neris_emerging_hazard,
                    ev_battery: { ...formData.neris_emerging_hazard?.ev_battery, crash: e.target.checked }
                  })}
                  className="accent-accent-red"
                />
                Vehicle Crash
              </label>
            </div>
          )}
        </div>

        {/* Solar PV */}
        <div className="p-2 bg-dark-border/20 rounded border border-dark-border">
          <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
            <input 
              type="checkbox"
              checked={formData.neris_emerging_hazard?.solar_pv?.present || false}
              onChange={(e) => handleChange('neris_emerging_hazard', {
                ...formData.neris_emerging_hazard,
                solar_pv: { ...formData.neris_emerging_hazard?.solar_pv, present: e.target.checked }
              })}
              className="accent-accent-red"
            />
            Solar PV System
          </label>
          {formData.neris_emerging_hazard?.solar_pv?.present && (
            <div className="mt-2 pt-2 border-t border-dark-border flex flex-wrap gap-2 items-center">
              <label className="flex items-center gap-1.5 text-gray-400 text-sm cursor-pointer">
                <input 
                  type="checkbox"
                  checked={formData.neris_emerging_hazard?.solar_pv?.energized || false}
                  onChange={(e) => handleChange('neris_emerging_hazard', {
                    ...formData.neris_emerging_hazard,
                    solar_pv: { ...formData.neris_emerging_hazard?.solar_pv, energized: e.target.checked }
                  })}
                  className="accent-accent-red"
                />
                Remained Energized
              </label>
              <select 
                value={formData.neris_emerging_hazard?.solar_pv?.ignition || ''}
                onChange={(e) => handleChange('neris_emerging_hazard', {
                  ...formData.neris_emerging_hazard,
                  solar_pv: { ...formData.neris_emerging_hazard?.solar_pv, ignition: e.target.value || null }
                })}
                className="min-w-[150px]"
              >
                <option value="">Ignition source?</option>
                {emergHazPvIgnCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* CSST */}
        <div className="p-2 bg-dark-border/20 rounded border border-dark-border">
          <label className="flex items-center gap-2 text-gray-300 text-sm cursor-pointer">
            <input 
              type="checkbox"
              checked={formData.neris_emerging_hazard?.csst?.present || false}
              onChange={(e) => handleChange('neris_emerging_hazard', {
                ...formData.neris_emerging_hazard,
                csst: { ...formData.neris_emerging_hazard?.csst, present: e.target.checked }
              })}
              className="accent-accent-red"
            />
            CSST Gas Lines
          </label>
          {formData.neris_emerging_hazard?.csst?.present && (
            <div className="mt-2 pt-2 border-t border-dark-border">
              <label className="flex items-center gap-1.5 text-gray-400 text-sm cursor-pointer">
                <input 
                  type="checkbox"
                  checked={formData.neris_emerging_hazard?.csst?.damage || false}
                  onChange={(e) => handleChange('neris_emerging_hazard', {
                    ...formData.neris_emerging_hazard,
                    csst: { ...formData.neris_emerging_hazard?.csst, damage: e.target.checked }
                  })}
                  className="accent-accent-red"
                />
                Damage / Gas Leak
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Exposures({ formData, handleChange, exposureLocCodes, exposureItemCodes }) {
  return (
    <div className="mb-3">
      <label className="text-gray-400 text-xs flex items-center gap-1 mb-2">
        Exposures
        <InfoTooltip text={NERIS_DESCRIPTIONS.fields.exposures} />
      </label>
      <div className="flex flex-col gap-2">
        {(formData.neris_exposures || []).map((exp, idx) => (
          <div key={idx} className="p-2 bg-dark-border/20 rounded border border-dark-border">
            <div className="flex flex-wrap gap-2 items-center">
              <select 
                value={exp.exposure_type || ''}
                onChange={(e) => {
                  const updated = [...(formData.neris_exposures || [])];
                  updated[idx] = { ...exp, exposure_type: e.target.value || null };
                  handleChange('neris_exposures', updated);
                }}
                className="min-w-[120px] flex-1"
              >
                <option value="">Location...</option>
                {exposureLocCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
              <select 
                value={exp.exposure_item || ''}
                onChange={(e) => {
                  const updated = [...(formData.neris_exposures || [])];
                  updated[idx] = { ...exp, exposure_item: e.target.value || null };
                  handleChange('neris_exposures', updated);
                }}
                className="min-w-[120px] flex-1"
              >
                <option value="">Item...</option>
                {exposureItemCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
              <input 
                type="text"
                placeholder="Address"
                value={exp.address || ''}
                onChange={(e) => {
                  const updated = [...(formData.neris_exposures || [])];
                  updated[idx] = { ...exp, address: e.target.value };
                  handleChange('neris_exposures', updated);
                }}
                className="flex-1 min-w-[120px]"
              />
              <button 
                type="button"
                className="btn btn-sm border border-accent-red text-accent-red hover:bg-accent-red hover:text-white"
                onClick={() => {
                  const updated = formData.neris_exposures.filter((_, i) => i !== idx);
                  handleChange('neris_exposures', updated);
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button 
          type="button"
          className="btn btn-sm border border-dashed border-dark-border text-gray-500 hover:border-accent-red hover:text-accent-red"
          onClick={() => handleChange('neris_exposures', [...(formData.neris_exposures || []), {}])}
        >
          + Add Exposure
        </button>
      </div>
    </div>
  );
}

function FireModule({ formData, handleChange, fireInvestNeedCodes, fireConditionArrivalCodes, fireBldgDamageCodes, roomCodes, fireCauseInCodes, fireCauseOutCodes }) {
  return (
    <div className="mt-3 p-3 rounded border border-accent-red/30 bg-accent-red/5">
      <h5 className="text-accent-red text-sm font-semibold mb-3 pb-2 border-b border-accent-red/20">Fire Module</h5>
      
      <div className="mb-3">
        <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
          Fire Investigation Needed? <span className="text-accent-red">*</span>
          <InfoTooltip text={NERIS_DESCRIPTIONS.fields.fire_investigation} />
        </label>
        <select 
          value={formData.neris_fire_investigation_need || ''} 
          onChange={(e) => handleChange('neris_fire_investigation_need', e.target.value || null)}
        >
          <option value="">Select...</option>
          {fireInvestNeedCodes.map(code => (
            <option key={code.value} value={code.value}>
              {code.description || code.display_text || code.value}
            </option>
          ))}
        </select>
      </div>

      {hasStructureFireType(formData.neris_incident_type_codes) && (
        <>
          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
              Arrival Conditions <span className="text-accent-red">*</span>
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.arrival_conditions} />
            </label>
            <select 
              value={formData.neris_fire_arrival_conditions || ''} 
              onChange={(e) => handleChange('neris_fire_arrival_conditions', e.target.value || null)}
            >
              <option value="">Select...</option>
              {fireConditionArrivalCodes.map(code => (
                <option key={code.value} value={code.value}>
                  {code.description || code.display_text || code.value}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
              Structure Damage <span className="text-accent-red">*</span>
              <InfoTooltip text={NERIS_DESCRIPTIONS.fields.structure_damage} />
            </label>
            <select 
              value={formData.neris_fire_structure_damage || ''} 
              onChange={(e) => handleChange('neris_fire_structure_damage', e.target.value || null)}
            >
              <option value="">Select...</option>
              {fireBldgDamageCodes.map(code => (
                <option key={code.value} value={code.value}>
                  {code.description || code.display_text || code.value}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="flex flex-col gap-0.5">
              <label className="text-gray-400 text-xs">Floor of Origin</label>
              <input 
                type="number" 
                min="0" 
                value={formData.neris_fire_structure_floor ?? ''}
                onChange={(e) => handleChange('neris_fire_structure_floor', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Floor #"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-gray-400 text-xs">Room of Origin</label>
              <select 
                value={formData.neris_fire_structure_room || ''} 
                onChange={(e) => handleChange('neris_fire_structure_room', e.target.value || null)}
              >
                <option value="">Select...</option>
                {roomCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="text-gray-400 text-xs mb-1 block">Fire Cause (Structure)</label>
            <select 
              value={formData.neris_fire_structure_cause || ''} 
              onChange={(e) => handleChange('neris_fire_structure_cause', e.target.value || null)}
            >
              <option value="">Select...</option>
              {fireCauseInCodes.map(code => (
                <option key={code.value} value={code.value}>
                  {code.description || code.display_text || code.value}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {hasOutsideFireType(formData.neris_incident_type_codes) && (
        <div className="mb-3">
          <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
            Fire Cause (Outside) <span className="text-accent-red">*</span>
          </label>
          <select 
            value={formData.neris_fire_outside_cause || ''} 
            onChange={(e) => handleChange('neris_fire_outside_cause', e.target.value || null)}
          >
            <option value="">Select...</option>
            {fireCauseOutCodes.map(code => (
              <option key={code.value} value={code.value}>
                {code.description || code.display_text || code.value}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function MedicalModule({ formData, handleChange, medicalPatientCareCodes }) {
  return (
    <div className="mt-3 p-3 rounded border border-status-completed/30 bg-status-completed/5">
      <h5 className="text-status-completed text-sm font-semibold mb-3 pb-2 border-b border-status-completed/20">Medical Module</h5>
      
      <div className="mb-3">
        <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
          Patient Evaluation/Care <span className="text-accent-red">*</span>
          <InfoTooltip text={NERIS_DESCRIPTIONS.fields.patient_care} />
        </label>
        <select 
          value={formData.neris_medical_patient_care || ''} 
          onChange={(e) => handleChange('neris_medical_patient_care', e.target.value || null)}
        >
          <option value="">Select...</option>
          {medicalPatientCareCodes.map(code => (
            <option key={code.value} value={code.value}>
              {code.description || code.display_text || code.value}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function HazmatModule({ formData, handleChange, hazardDispositionCodes, hazardDotCodes }) {
  return (
    <div className="mt-3 p-3 rounded border border-status-warning/30 bg-status-warning/5">
      <h5 className="text-status-warning text-sm font-semibold mb-3 pb-2 border-b border-status-warning/20">Hazmat Module</h5>
      
      <div className="mb-3">
        <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
          Hazmat Disposition <span className="text-accent-red">*</span>
          <InfoTooltip text={NERIS_DESCRIPTIONS.fields.hazmat_disposition} />
        </label>
        <select 
          value={formData.neris_hazmat_disposition || ''} 
          onChange={(e) => handleChange('neris_hazmat_disposition', e.target.value || null)}
        >
          <option value="">Select...</option>
          {hazardDispositionCodes.map(code => (
            <option key={code.value} value={code.value}>
              {code.description || code.display_text || code.value}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="text-gray-400 text-xs flex items-center gap-1 mb-1">
          People Evacuated <span className="text-accent-red">*</span>
          <InfoTooltip text={NERIS_DESCRIPTIONS.fields.hazmat_evacuated} />
        </label>
        <input 
          type="number" 
          min="0" 
          value={formData.neris_hazmat_evacuated ?? 0}
          onChange={(e) => handleChange('neris_hazmat_evacuated', parseInt(e.target.value) || 0)}
          className="w-24"
        />
      </div>

      <div className="mb-3">
        <label className="text-gray-400 text-xs mb-2 block">Chemicals Involved <span className="text-accent-red">*</span></label>
        <div className="flex flex-col gap-2">
          {(formData.neris_hazmat_chemicals || []).map((chem, idx) => (
            <div key={idx} className="flex flex-wrap gap-2 items-center p-2 bg-black/20 rounded">
              <select 
                value={chem.dot_class || ''} 
                onChange={(e) => {
                  const updated = [...formData.neris_hazmat_chemicals];
                  updated[idx] = { ...updated[idx], dot_class: e.target.value || null };
                  handleChange('neris_hazmat_chemicals', updated);
                }}
                className="min-w-[150px]"
              >
                <option value="">DOT Class...</option>
                {hazardDotCodes.map(code => (
                  <option key={code.value} value={code.value}>
                    {code.description || code.display_text || code.value}
                  </option>
                ))}
              </select>
              <input 
                type="text"
                value={chem.name || ''}
                onChange={(e) => {
                  const updated = [...formData.neris_hazmat_chemicals];
                  updated[idx] = { ...updated[idx], name: e.target.value };
                  handleChange('neris_hazmat_chemicals', updated);
                }}
                placeholder="Chemical name..."
                className="flex-1 min-w-[150px]"
              />
              <label className="flex items-center gap-1.5 text-gray-400 text-sm whitespace-nowrap cursor-pointer">
                <input 
                  type="checkbox"
                  checked={chem.release_occurred || false}
                  onChange={(e) => {
                    const updated = [...formData.neris_hazmat_chemicals];
                    updated[idx] = { ...updated[idx], release_occurred: e.target.checked };
                    handleChange('neris_hazmat_chemicals', updated);
                  }}
                  className="accent-accent-red"
                />
                Released
              </label>
              <button 
                type="button" 
                className="bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded text-sm flex items-center justify-center"
                onClick={() => {
                  const updated = formData.neris_hazmat_chemicals.filter((_, i) => i !== idx);
                  handleChange('neris_hazmat_chemicals', updated);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button 
            type="button" 
            className="btn btn-sm border border-dashed border-dark-border text-gray-500 hover:border-accent-red hover:text-accent-red"
            onClick={() => {
              const updated = [...(formData.neris_hazmat_chemicals || []), { dot_class: null, name: '', release_occurred: false }];
              handleChange('neris_hazmat_chemicals', updated);
            }}
          >
            + Add Chemical
          </button>
        </div>
      </div>
    </div>
  );
}
