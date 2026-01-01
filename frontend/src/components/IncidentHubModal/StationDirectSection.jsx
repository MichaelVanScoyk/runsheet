import { memo } from 'react';
import DynamicPersonnelList from '../RunSheet/shared/DynamicPersonnelList';

/**
 * Station and Direct responders - matches report template style
 * Section headers use branding color (like CALL SUMMARY in report)
 */
function StationDirectSection({
  assignments,
  onAssignmentChange,
  allPersonnel,
  getAssignedIds,
  stationUnit,
  directUnit,
  primaryColor = '#1a5f2a',
}) {
  if (!stationUnit && !directUnit) {
    return (
      <div style={{ padding: '12px', color: '#999', fontSize: '13px', textAlign: 'center' }}>
        No Station or Direct units configured.
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {/* Station */}
        {stationUnit && (
          <div style={styles.section}>
            {/* Section header - GREEN like report */}
            <div style={{ ...styles.sectionHeader, color: primaryColor }}>
              Station Responders
            </div>
            <div style={styles.hint}>Responded to station but did not ride on a truck</div>
            <DynamicPersonnelList
              label={stationUnit.unit_designator}
              assignedIds={assignments[stationUnit.unit_designator] || []}
              onUpdate={(newList) => onAssignmentChange(stationUnit.unit_designator, newList)}
              allPersonnel={allPersonnel}
              getAssignedIds={getAssignedIds}
              lightMode={true}
            />
          </div>
        )}

        {/* Direct */}
        {directUnit && (
          <div style={styles.section}>
            <div style={{ ...styles.sectionHeader, color: primaryColor }}>
              Direct Responders
            </div>
            <div style={styles.hint}>Went directly to the scene (POV)</div>
            <DynamicPersonnelList
              label={directUnit.unit_designator}
              assignedIds={assignments[directUnit.unit_designator] || []}
              onUpdate={(newList) => onAssignmentChange(directUnit.unit_designator, newList)}
              allPersonnel={allPersonnel}
              getAssignedIds={getAssignedIds}
              lightMode={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '16px',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '4px',
    padding: '16px',
    border: '1px solid #e0e0e0',
  },
  sectionHeader: {
    fontSize: '14px',
    fontWeight: '700',
    marginBottom: '4px',
  },
  hint: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '12px',
  },
};

export default memo(StationDirectSection);
