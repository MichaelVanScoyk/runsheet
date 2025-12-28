import { RunSheetProvider, useRunSheet } from './RunSheetContext';
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
import { CADDataModal, RestorePreviewModal } from './modals';

function RunSheetContent() {
  const { loading, formData } = useRunSheet();
  
  const isFireCall = formData.call_category === 'FIRE';
  
  if (loading) {
    return (
      <div className="bg-dark-bg rounded-lg p-6 max-w-5xl mx-auto">
        <div className="text-center text-gray-400 py-12">Loading...</div>
      </div>
    );
  }
  
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
      
      {/* Fire-only sections */}
      {isFireCall && <DamageAssessment />}
      {isFireCall && <MutualAidSection />}
      
      <CADUnitsTable />
      <PersonnelGrid />
      <VirtualUnits />
      <OfficerSection />
      <NERISSection />
      
      {/* Modals */}
      <CADDataModal />
      <RestorePreviewModal />
    </div>
  );
}

export default function RunSheetForm({ incident, onSave, onClose }) {
  return (
    <RunSheetProvider incident={incident} onSave={onSave} onClose={onClose}>
      <RunSheetContent />
    </RunSheetProvider>
  );
}
