import { RunSheetProvider, useRunSheet } from './RunSheetContext';
import { useMobile } from '../../hooks/useMobile';
import { formatTimeLocal } from '../../utils/timeUtils';
import AccordionSection from './shared/AccordionSection';
import { 
  IncidentHeader,
  ActionBar,
  AuditTrail,
  IncidentInfo,
  TimeFields,
  CallerInfo,
  NarrativeSection,
  DamageAssessment,
  MutualAidSection,
  CADUnitsTable,
  PersonnelGrid,
  VirtualUnits,
  OfficerSection,
} from './sections';
import { NERISSection } from './neris';
import { CADDataModal, RestorePreviewModal, ComCatModal } from './modals';

/**
 * Helper to generate summary text for accordion sections when collapsed.
 * Gives users a quick sense of what's filled in without expanding.
 */
function getSummaries(formData, assignments) {
  const filledTimes = ['time_dispatched', 'time_first_enroute', 'time_first_on_scene', 'time_fire_under_control', 'time_last_cleared']
    .filter(k => formData[k]);

  const assignedCount = Object.values(assignments || {})
    .flat()
    .filter(id => id != null).length;

  const unitCount = (formData.cad_units || []).length;

  return {
    incidentInfo: [formData.address, formData.cad_event_type].filter(Boolean).join(' — ') || 'Not filled',
    times: filledTimes.length > 0 ? `${filledTimes.length}/5 times recorded` : 'No times',
    caller: formData.caller_name || formData.caller_phone || 'None',
    narrative: formData.narrative ? `${formData.narrative.length} chars` : 'Empty',
    cadUnits: unitCount > 0 ? `${unitCount} unit${unitCount !== 1 ? 's' : ''}` : 'None',
    personnel: assignedCount > 0 ? `${assignedCount} assigned` : 'None assigned',
    officer: formData.officer_in_charge ? 'Set' : 'Not set',
    neris: (formData.neris_incident_type_codes || []).length > 0 ? `${formData.neris_incident_type_codes.length} type(s)` : 'Not started',
    mutualAid: formData.neris_aid_direction || 'Not answered',
  };
}

function RunSheetContent() {
  const { loading, formData, assignments } = useRunSheet();
  const isMobile = useMobile();
  
  const isFireCall = formData.call_category === 'FIRE';
  
  // Show Damage Assessment only if:
  // - It's a FIRE call AND
  // - Mutual aid question has been answered (NONE, GIVEN, or RECEIVED) AND
  // - Direction is NOT 'GIVEN' (i.e., it's our first due area)
  // 
  // NONE = not mutual aid (our call)
  // RECEIVED = we got help (still our call)
  // GIVEN = we helped them (their call - they track damage)
  const mutualAidAnswered = ['NONE', 'GIVEN', 'RECEIVED'].includes(formData.neris_aid_direction);
  const isOurIncident = formData.neris_aid_direction === 'NONE' || formData.neris_aid_direction === 'RECEIVED';
  const showDamageAssessment = isFireCall && mutualAidAnswered && isOurIncident;
  
  if (loading) {
    return (
      <div className="bg-dark-bg rounded-lg p-6 max-w-5xl mx-auto">
        <div className="text-center text-gray-400 py-12">Loading...</div>
      </div>
    );
  }

  // Desktop: render exactly as before
  if (!isMobile) {
    return (
      <div className="bg-dark-bg rounded-lg p-4 max-w-5xl mx-auto">
        <IncidentHeader />
        <ActionBar />
        <AuditTrail />
        
        {/* Main form content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <IncidentInfo />
          <TimeFields />
        </div>
        
        <div className="mb-4">
          <CallerInfo />
        </div>
        
        <NarrativeSection />
        
        {/* Fire-only sections - Mutual Aid question first, then Damage Assessment if applicable */}
        {isFireCall && <MutualAidSection />}
        {showDamageAssessment && <DamageAssessment />}
        
        <CADUnitsTable />
        <PersonnelGrid />
        <VirtualUnits />
        <OfficerSection />
        <NERISSection />
        
        {/* Modals */}
        <CADDataModal />
        <RestorePreviewModal />
        <ComCatModal />
      </div>
    );
  }

  // Mobile: accordion layout
  const summaries = getSummaries(formData, assignments);

  return (
    <div style={{ padding: '4px' }}>
      {/* Header and action bar always visible */}
      <IncidentHeader />
      <ActionBar />

      <AccordionSection title="Incident Info" summary={summaries.incidentInfo} defaultOpen={true}>
        <IncidentInfo />
      </AccordionSection>

      <AccordionSection title="Times" summary={summaries.times}>
        <TimeFields />
      </AccordionSection>

      <AccordionSection title="Caller" summary={summaries.caller}>
        <CallerInfo />
      </AccordionSection>

      <AccordionSection title="Narrative" summary={summaries.narrative}>
        <NarrativeSection />
      </AccordionSection>

      {isFireCall && (
        <AccordionSection title="Mutual Aid" summary={summaries.mutualAid}>
          <MutualAidSection />
        </AccordionSection>
      )}

      {showDamageAssessment && (
        <AccordionSection title="Damage Assessment">
          <DamageAssessment />
        </AccordionSection>
      )}

      <AccordionSection title="CAD Units" summary={summaries.cadUnits}>
        <CADUnitsTable />
      </AccordionSection>

      <AccordionSection title="Personnel" summary={summaries.personnel}>
        <PersonnelGrid />
      </AccordionSection>

      <AccordionSection title="Virtual Units">
        <VirtualUnits />
      </AccordionSection>

      <AccordionSection title="Officer" summary={summaries.officer}>
        <OfficerSection />
      </AccordionSection>

      <AccordionSection title="NERIS" summary={summaries.neris}>
        <NERISSection />
      </AccordionSection>

      <AccordionSection title="Audit Trail">
        <AuditTrail />
      </AccordionSection>

      {/* Modals */}
      <CADDataModal />
      <RestorePreviewModal />
      <ComCatModal />
    </div>
  );
}

export default function RunSheetForm({ incident, onSave, onClose, onNavigate }) {
  return (
    <RunSheetProvider incident={incident} onSave={onSave} onClose={onClose} onNavigate={onNavigate}>
      <RunSheetContent />
    </RunSheetProvider>
  );
}
