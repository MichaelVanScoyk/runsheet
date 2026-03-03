import { useNeris } from './NerisContext';
import IncidentClassification from './sections/IncidentClassification';
import BaseInformation from './sections/BaseInformation';
import LocationDisplay from './sections/LocationDisplay';
import LocationUse from './sections/LocationUse';
import DispatchSection from './sections/DispatchSection';
import TacticTimestamps from './sections/TacticTimestamps';
import ActionsTaken from './sections/ActionsTaken';
import MutualAidDisplay from './sections/MutualAidDisplay';
import FireDetail from './sections/FireDetail';
import AlarmsAndSuppression from './sections/AlarmsAndSuppression';
import MedicalDetail from './sections/MedicalDetail';
import HazmatDetail from './sections/HazmatDetail';
import CasualtyRescues from './sections/CasualtyRescues';
import EmergingHazards from './sections/EmergingHazards';
import DispatchComments from './sections/DispatchComments';

export default function OverviewTab({ expandedSections, toggleSection }) {
  const { incident, preview, incidentId, fetchPreview } = useNeris();
  const { payload, errors, warnings, valid } = preview;

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

      {/* Editable sections */}
      <IncidentClassification expanded={expandedSections['types'] !== false} onToggle={() => toggleSection('types')} />
      <BaseInformation expanded={expandedSections['base'] !== false} onToggle={() => toggleSection('base')} />
      <LocationUse expanded={expandedSections['location_use'] !== false} onToggle={() => toggleSection('location_use')} />

      {/* Read-only sections from payload */}
      <LocationDisplay incident={incident} payload={payload} expanded={expandedSections['location'] !== false} onToggle={() => toggleSection('location')} />
      <DispatchSection incidentId={incidentId} incident={incident} payload={payload} expanded={expandedSections['dispatch'] !== false} onToggle={() => toggleSection('dispatch')} onRefresh={fetchPreview} />
      <TacticTimestamps payload={payload} expanded={expandedSections['tactics'] !== false} onToggle={() => toggleSection('tactics')} />
      <ActionsTaken payload={payload} expanded={expandedSections['actions'] !== false} onToggle={() => toggleSection('actions')} />
      <MutualAidDisplay payload={payload} expanded={expandedSections['aids'] !== false} onToggle={() => toggleSection('aids')} />
      <FireDetail payload={payload} expanded={expandedSections['fire'] !== false} onToggle={() => toggleSection('fire')} />
      <AlarmsAndSuppression payload={payload} expanded={expandedSections['alarms'] !== false} onToggle={() => toggleSection('alarms')} />
      <MedicalDetail payload={payload} expanded={expandedSections['medical'] !== false} onToggle={() => toggleSection('medical')} />
      <HazmatDetail payload={payload} expanded={expandedSections['hazmat'] !== false} onToggle={() => toggleSection('hazmat')} />
      <CasualtyRescues payload={payload} expanded={expandedSections['casualties'] !== false} onToggle={() => toggleSection('casualties')} />
      <EmergingHazards payload={payload} expanded={expandedSections['emerging'] !== false} onToggle={() => toggleSection('emerging')} />
      <DispatchComments payload={payload} expanded={expandedSections['comments'] !== false} onToggle={() => toggleSection('comments')} />
    </div>
  );
}
