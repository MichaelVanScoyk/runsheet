import { memo } from 'react';
import DynamicPersonnelList from '../RunSheet/shared/DynamicPersonnelList';

/**
 * Quick Entry section - clean form layout for CLOSED incidents
 * All text is neutral/readable, colors only for borders/accents
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
  primaryColor = '#c41e3a',
  secondaryColor = '#1a365d',
}) {
  const apparatusUnits = dispatchedApparatus.filter(
    a => a.unit_category === 'APPARATUS' || !a.unit_category
  );

  return (
    <div style={styles.container}>
      {/* Unit Assignments */}
      {apparatusUnits.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionLabel}>
            Unit Assignments
          </div>
          <div style={styles.unitsGrid}>
            {apparatusUnits.map((apparatus) => (
              <div key={apparatus.id} style={{ ...styles.unitCard, borderColor: secondaryColor + '33' }}>
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
      <div style={styles.fieldsGrid}>
        <div>
          <label style={styles.fieldLabel}>
            Situation Found
          </label>
          <textarea
            style={styles.textarea}
            rows={3}
            placeholder="What was found on arrival..."
            value={formData.situation_found || ''}
            onChange={(e) => onFormChange('situation_found', e.target.value)}
          />
        </div>

        <div>
          <label style={styles.fieldLabel}>
            Services Provided
          </label>
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
        <label style={styles.fieldLabel}>
          Narrative
        </label>
        <textarea
          style={styles.textarea}
          rows={4}
          placeholder="Detailed narrative of the incident..."
          value={formData.narrative || ''}
          onChange={(e) => onFormChange('narrative', e.target.value)}
        />
      </div>
    </div>
  );
}

const styles = {
  container: {
    paddingTop: '16px',
    borderTop: '1px dashed #ddd',
  },
  section: {
    marginBottom: '16px',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '10px',
  },
  unitsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '12px',
  },
  unitCard: {
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: '1px solid',
  },
  unitName: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px',
    paddingBottom: '6px',
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
    marginBottom: '4px',
  },
  textarea: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
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
