import { memo } from 'react';
import DynamicPersonnelList from '../RunSheet/shared/DynamicPersonnelList';

/**
 * Quick Entry section - matches report template style
 * Section headers use branding color (like CALL SUMMARY in report)
 */
function QuickEntrySection({
  incident,
  assignments,
  onAssignmentChange,
  formData,
  onFormChange,
  allPersonnel,
  getAssignedIds,
  dispatchedApparatus,
  primaryColor = '#1a5f2a',
}) {
  const apparatusUnits = dispatchedApparatus.filter(
    a => a.unit_category === 'APPARATUS' || !a.unit_category
  );

  return (
    <div style={styles.container}>
      {/* Unit Assignments */}
      {apparatusUnits.length > 0 && (
        <div style={styles.card}>
          {/* Section header - GREEN like report */}
          <div style={{ ...styles.sectionHeader, color: primaryColor }}>
            Unit Assignments
          </div>
          <div style={styles.unitsGrid}>
            {apparatusUnits.map((apparatus) => (
              <div key={apparatus.id} style={styles.unitCard}>
                <div style={styles.unitName}>
                  {apparatus.name || apparatus.unit_designator}
                </div>
                <DynamicPersonnelList
                  label={apparatus.unit_designator}
                  assignedIds={assignments[apparatus.unit_designator] || []}
                  onUpdate={(newList) => onAssignmentChange(apparatus.unit_designator, newList)}
                  allPersonnel={allPersonnel}
                  getAssignedIds={getAssignedIds}
                  lightMode={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrative Fields */}
      <div style={styles.card}>
        {/* Section header - GREEN like report */}
        <div style={{ ...styles.sectionHeader, color: primaryColor }}>
          Incident Narrative
        </div>
        
        <div style={styles.fieldsGrid}>
          <div>
            <label style={styles.fieldLabel}>Situation Found</label>
            <textarea
              style={styles.textarea}
              rows={3}
              placeholder="What was found on arrival..."
              value={formData.situation_found || ''}
              onChange={(e) => onFormChange('situation_found', e.target.value)}
            />
          </div>

          <div>
            <label style={styles.fieldLabel}>Services Provided</label>
            <textarea
              style={styles.textarea}
              rows={3}
              placeholder="Actions taken..."
              value={formData.services_provided || ''}
              onChange={(e) => onFormChange('services_provided', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={styles.fieldLabel}>Narrative</label>
          <textarea
            style={styles.textarea}
            rows={4}
            placeholder="Detailed narrative of the incident..."
            value={formData.narrative || ''}
            onChange={(e) => onFormChange('narrative', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '4px',
    padding: '16px',
    border: '1px solid #e0e0e0',
  },
  sectionHeader: {
    fontSize: '14px',
    fontWeight: '700',
    marginBottom: '12px',
  },
  unitsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '12px',
  },
  unitCard: {
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '4px',
    border: '1px solid #eee',
  },
  unitName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e0e0e0',
  },
  fieldsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '12px',
    marginBottom: '12px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '6px',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    resize: 'vertical',
    fontFamily: 'inherit',
    backgroundColor: '#fff',
    color: '#333',
    boxSizing: 'border-box',
  },
};

export default memo(QuickEntrySection);
