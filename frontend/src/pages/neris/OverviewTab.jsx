import { useNeris } from './NerisContext';
import IncidentClassification from './sections/IncidentClassification';
import BaseInformation from './sections/BaseInformation';
import LocationUse from './sections/LocationUse';
import LocationDisplay from './sections/LocationDisplay';
import DispatchSection from './sections/DispatchSection';
import TacticTimestamps from './sections/TacticTimestamps';
import MutualAidDisplay from './sections/MutualAidDisplay';
import FireDetail from './sections/FireDetail';
import AlarmsAndSuppression from './sections/AlarmsAndSuppression';
import MedicalDetail from './sections/MedicalDetail';
import HazmatDetail from './sections/HazmatDetail';
import Exposures from './sections/Exposures';
import EmergingHazards from './sections/EmergingHazards';
import CasualtyRescues from './sections/CasualtyRescues';
import DispatchComments from './sections/DispatchComments';

/*
 * NERIS Section Visibility Decision Tree (from NERIS_V1_BUILD_SPEC.md):
 *
 * ALWAYS SHOWN:
 *   - IncidentClassification (base.incident_types + actions_tactics) — REQUIRED
 *   - BaseInformation (base.*) — REQUIRED
 *   - LocationUse (location_use) — Highly desired
 *   - LocationDisplay (base.location + point) — REQUIRED
 *   - DispatchSection (dispatch.*) — REQUIRED
 *   - MutualAidDisplay (aids) — Highly desired
 *   - EmergingHazards (electric_hazards, powergen_hazards, csst_hazard) — any incident can have these
 *   - CasualtyRescues (casualty_rescues) — "when rescues/casualties occurred", any incident
 *
 * CONDITIONAL ON INCIDENT TYPE:
 *   - FireDetail — only if any type starts with FIRE||
 *   - AlarmsAndSuppression — only if FIRE||STRUCTURE_FIRE or CONFINED_COOKING present
 *   - MedicalDetail — only if any type starts with MEDICAL||
 *   - HazmatDetail — only if any type starts with HAZSIT||
 *   - Exposures — only if any type starts with FIRE|| ("when fire spread to other properties")
 *
 * CONDITIONAL ON FIELD VALUES (sub-panels within sections):
 *   - Smoke alarm details — only if smoke_alarm_presence = PRESENT
 *   - Fire alarm details — only if fire_alarm_presence = PRESENT
 *   - Other alarm details — only if other_alarm = PRESENT
 *   - Sprinkler details — only if fire_suppression_presence = PRESENT
 *   - Cooking suppression — only if CONFINED_COOKING type present
 *
 * READ-ONLY (from payload, not editable here):
 *   - TacticTimestamps — from dispatch module
 *   - DispatchComments — from CAD comments
 */

// Sections that start collapsed by default (optional/situational)
const DEFAULT_COLLAPSED = new Set([
  'emerging', 'casualties', 'exposures', 'aids',
  'tactics', 'comments',
]);

export default function OverviewTab({ expandedSections, toggleSection }) {
  const { incident, preview, incidentId, fetchPreview } = useNeris();
  const { payload, errors, warnings, valid } = preview;

  // Helper: sections not explicitly toggled use default expand state
  const isExpanded = (key) => {
    if (key in expandedSections) return expandedSections[key];
    return !DEFAULT_COLLAPSED.has(key);
  };

  return (
    <div>
      {/* Validation summary */}
      <div style={{
        padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
        background: valid ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${valid ? '#bbf7d0' : '#fecaca'}`,
      }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: valid ? '#166534' : '#991b1b', marginBottom: errors.length || warnings.length ? '0.5rem' : 0 }}>
          {valid ? '✓ NERIS payload is valid — ready to submit' : `✗ ${errors.length} validation error${errors.length !== 1 ? 's' : ''} — must fix before submitting`}
          {warnings.length > 0 && ` · ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`}
        </div>
        {errors.map((e, i) => (
          <div key={`e${i}`} style={{ fontSize: '0.8rem', color: '#991b1b', padding: '2px 0', paddingLeft: '1rem' }}>
            ✗ <code style={{ background: '#fee2e2', padding: '1px 4px', borderRadius: '3px', fontSize: '0.75rem' }}>{e.field}</code> — {e.message}
          </div>
        ))}
        {warnings.map((w, i) => (
          <div key={`w${i}`} style={{ fontSize: '0.8rem', color: '#92400e', padding: '2px 0', paddingLeft: '1rem' }}>
            ⚠ <code style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: '3px', fontSize: '0.75rem' }}>{w.field}</code> — {w.message}
          </div>
        ))}
      </div>

      {/* === ALWAYS SHOWN — REQUIRED/DESIRED === */}
      <IncidentClassification expanded={isExpanded('types')} onToggle={() => toggleSection('types')} />
      <BaseInformation expanded={isExpanded('base')} onToggle={() => toggleSection('base')} />
      <LocationUse expanded={isExpanded('location_use')} onToggle={() => toggleSection('location_use')} />
      <LocationDisplay incident={incident} payload={payload} expanded={isExpanded('location')} onToggle={() => toggleSection('location')} />
      <DispatchSection incidentId={incidentId} incident={incident} payload={payload} expanded={isExpanded('dispatch')} onToggle={() => toggleSection('dispatch')} onRefresh={fetchPreview} />
      <MutualAidDisplay expanded={isExpanded('aids')} onToggle={() => toggleSection('aids')} />

      {/* === CONDITIONAL ON INCIDENT TYPE === */}
      {/* FireDetail: only if FIRE|| type present */}
      <FireDetail expanded={isExpanded('fire')} onToggle={() => toggleSection('fire')} />
      {/* AlarmsAndSuppression: only if STRUCTURE_FIRE or CONFINED_COOKING */}
      <AlarmsAndSuppression expanded={isExpanded('alarms')} onToggle={() => toggleSection('alarms')} />
      {/* Exposures: only if any FIRE|| type */}
      <Exposures expanded={isExpanded('exposures')} onToggle={() => toggleSection('exposures')} />
      {/* MedicalDetail: only if MEDICAL|| type present */}
      <MedicalDetail expanded={isExpanded('medical')} onToggle={() => toggleSection('medical')} />
      {/* HazmatDetail: only if HAZSIT|| type present */}
      <HazmatDetail expanded={isExpanded('hazmat')} onToggle={() => toggleSection('hazmat')} />

      {/* === ALWAYS AVAILABLE — OPTIONAL (collapsed by default) === */}
      <EmergingHazards expanded={isExpanded('emerging')} onToggle={() => toggleSection('emerging')} />
      <CasualtyRescues expanded={isExpanded('casualties')} onToggle={() => toggleSection('casualties')} />

      {/* === READ-ONLY FROM PAYLOAD === */}
      <TacticTimestamps payload={payload} expanded={isExpanded('tactics')} onToggle={() => toggleSection('tactics')} />
      <DispatchComments payload={payload} expanded={isExpanded('comments')} onToggle={() => toggleSection('comments')} />
    </div>
  );
}
