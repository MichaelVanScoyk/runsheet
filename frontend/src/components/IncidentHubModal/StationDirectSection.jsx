import { memo } from 'react';
import DynamicPersonnelList from '../RunSheet/shared/DynamicPersonnelList';

/**
 * Station and Direct responders - clean form layout
 */
function StationDirectSection({
  assignments,
  onAssignmentChange,
  allPersonnel,
  getAssignedIds,
  stationUnit,
  directUnit,
  primaryColor = '#c41e3a',
  secondaryColor = '#1a365d',
}) {
  if (!stationUnit && !directUnit) {
    return (
      <div style={{ padding: '12px', color: '#999', fontSize: '12px', textAlign: 'center' }}>
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
            <div style={{ ...styles.label, color: secondaryColor }}>
              Station Responders
            </div>
            <div style={styles.hint}>Responded to station but did not ride on a truck</div>
            <div style={styles.listWrapper}>
              <DynamicPersonnelList
                label={stationUnit.unit_designator}
                assignedIds={assignments[stationUnit.unit_designator] || []}
                onUpdate={(newList) => onAssignmentChange(stationUnit.unit_designator, newList)}
                allPersonnel={allPersonnel}
                getAssignedIds={getAssignedIds}
                lightMode={true}
              />
            </div>
          </div>
        )}

        {/* Direct */}
        {directUnit && (
          <div style={styles.section}>
            <div style={{ ...styles.label, color: secondaryColor }}>
              Direct Responders
            </div>
            <div style={styles.hint}>Went directly to the scene (POV)</div>
            <div style={styles.listWrapper}>
              <DynamicPersonnelList
                label={directUnit.unit_designator}
                assignedIds={assignments[directUnit.unit_designator] || []}
                onUpdate={(newList) => onAssignmentChange(directUnit.unit_designator, newList)}
                allPersonnel={allPersonnel}
                getAssignedIds={getAssignedIds}
                lightMode={true}
              />
            </div>
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  section: {
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: '1px solid #e9ecef',
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '2px',
  },
  hint: {
    fontSize: '11px',
    color: '#888',
    marginBottom: '10px',
  },
  listWrapper: {
    // The DynamicPersonnelList will handle its own styling
  },
};

export default memo(StationDirectSection);
