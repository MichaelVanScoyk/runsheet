# RunSheetForm Refactoring Inventory

## Context Document Requirements (MUST FOLLOW)
- **Option 1: Tailwind + Component Split (Recommended)** - Line 96
- Mobile-first responsive from the start
- Keep dark theme colors (#16213e, #1a1a2e, #e94560)
- Compact layout - reduce margins/gaps by ~50%
- Time fields - labels inline LEFT of field, not above
- Textareas - start at 1 line, auto-expand
- NERIS - only show for FIRE category
- Auto button - small, LEFT side of Units Called field
- No "Editing as" text - just show warning if not logged in

---

## CURRENT STATE

### Tailwind Status
- **NOT INSTALLED** - package.json shows no tailwind
- Need to install: `npm install tailwindcss postcss autoprefixer`
- Need to create: `tailwind.config.js`, `postcss.config.js`

### File Sizes
- RunSheetForm.jsx: ~2,900 lines
- RunSheetForm.css: ~1,100 lines
- api.js: ~200 lines

---

## RUNSHEETFORM.JSX INVENTORY

### Helper Components (Lines 1-500)
| Component | Lines | Purpose | Props |
|-----------|-------|---------|-------|
| DynamicPersonnelList | 22-99 | Growing list for Direct/Station virtual units | label, assignedIds, onUpdate, allPersonnel, getAssignedIds |
| Chip | 102-110 | Removable selection chip | label, onRemove |
| PersonnelTypeahead | 113-207 | Searchable dropdown with keyboard nav | value, availablePersonnel, allPersonnel, onSelect, onClear |
| InfoTooltip | 210-220 | Hover tooltip for NERIS help | text |
| NERIS_DESCRIPTIONS | 223-270 | Object with field descriptions | N/A (constant) |
| getNerisDisplayName | 273-278 | Extract display name from "FIRE: TYPE: SUBTYPE" | value |
| hasIncidentCategory | 282-285 | Check if types array contains category | types, category |
| hasIncidentSubtype | 287-290 | Check if types array contains subtype | types, subtype |
| hasFireType | 293 | Check for FIRE type | types |
| hasMedicalType | 294 | Check for MEDICAL type | types |
| hasHazsitType | 295 | Check for HAZSIT type | types |
| hasStructureFireType | 296 | Check for STRUCTURE_FIRE subtype | types |
| hasOutsideFireType | 297 | Check for OUTSIDE_FIRE subtype | types |
| NerisModal | 300-410 | Hierarchical code picker modal | isOpen, onClose, title, data, selected, onToggle, maxSelections, dataType |
| saveAllAssignments | 413-420 | API call to save personnel assignments | incidentId, assignments |
| CADDataModal | 423-530 | View raw CAD HTML with print | isOpen, onClose, dispatch, updates, clear |

### Main Component State (Lines 533-700)

#### Loading/Saving State
| State | Type | Purpose |
|-------|------|---------|
| loading | boolean | Initial data load |
| saving | boolean | Save in progress |

#### Reference Data State
| State | Type | Purpose |
|-------|------|---------|
| apparatus | array | Active apparatus list |
| personnel | array | Active personnel list |
| municipalities | array | Municipality lookup |
| incidentTypes | object | Hierarchical incident types for modal |
| locationUses | object | Hierarchical location uses for modal |
| actionsTaken | object | Hierarchical actions for modal |

#### UI State
| State | Type | Purpose |
|-------|------|---------|
| showNeris | boolean | NERIS section expanded |
| showCadModal | boolean | CAD data modal open |
| showRestoreModal | boolean | Restore preview modal open |
| restorePreview | object | Restore preview data |
| restoreLoading | boolean | Restore operation loading |
| showIncidentTypeModal | boolean | Incident type picker open |
| showLocationUseModal | boolean | Location use picker open |
| showActionsModal | boolean | Actions taken picker open |
| auditLog | array | Edit history entries |
| showFullAuditLog | boolean | Audit log expanded |
| auditLogRef | ref | Ref for click-outside handling |

#### NERIS Dropdown Options (from neris_codes table)
| State | Type | Category |
|-------|------|----------|
| aidTypes | array | type_aid |
| aidDirections | array | type_aid_direction |
| noActionCodes | array | type_noaction |
| rrPresenceCodes | array | type_rr_presence |
| fireInvestNeedCodes | array | type_fire_invest_need |
| fireConditionArrivalCodes | array | type_fire_condition_arrival |
| fireBldgDamageCodes | array | type_fire_bldg_damage |
| fireCauseInCodes | array | type_fire_cause_in |
| fireCauseOutCodes | array | type_fire_cause_out |
| roomCodes | array | type_room |
| medicalPatientCareCodes | array | type_medical_patient_care |
| hazardDispositionCodes | array | type_hazard_disposition |
| hazardDotCodes | array | type_hazard_dot |
| smokeAlarmTypeCodes | array | type_alarm_smoke |
| fireAlarmTypeCodes | array | type_alarm_fire |
| otherAlarmTypeCodes | array | type_alarm_other |
| alarmOperationCodes | array | type_alarm_operation |
| alarmFailureCodes | array | type_alarm_failure |
| sprinklerTypeCodes | array | type_suppress_fire |
| sprinklerOperationCodes | array | type_suppress_operation |
| cookingSuppressionCodes | array | type_suppress_cooking |
| fullPartialCodes | array | type_full_partial |
| exposureLocCodes | array | type_exposure_loc |
| exposureItemCodes | array | type_exposure_item |
| emergHazElecCodes | array | type_emerghaz_elec |
| emergHazPvCodes | array | type_emerghaz_pv |
| emergHazPvIgnCodes | array | type_emerghaz_pv_ign |

#### Form Data Fields
| Field | Type | NERIS Related |
|-------|------|---------------|
| internal_incident_number | string | No |
| call_category | string (FIRE/EMS) | No |
| cad_event_number | string | No |
| cad_event_type | string | No |
| cad_event_subtype | string | No |
| cad_raw_dispatch | string (HTML) | No |
| cad_raw_updates | array | No |
| cad_raw_clear | string (HTML) | No |
| status | string | No |
| incident_date | string | No |
| address | string | No |
| municipality_code | string | No |
| cross_streets | string | No |
| esz_box | string | No |
| time_dispatched | datetime-local | No |
| time_first_enroute | datetime-local | No |
| time_first_on_scene | datetime-local | No |
| time_fire_under_control | datetime-local | No |
| time_last_cleared | datetime-local | No |
| time_in_service | datetime-local | No |
| caller_name | string | No |
| caller_phone | string | No |
| weather_conditions | string | No |
| companies_called | string | No |
| situation_found | text | No |
| extent_of_damage | text | No |
| services_provided | text | No |
| narrative | text | No |
| equipment_used | array | No |
| problems_issues | text | No |
| officer_in_charge | int (personnel_id) | No |
| completed_by | int (personnel_id) | No |
| neris_incident_type_codes | array (max 3) | Yes |
| neris_location_use | object {use_type, use_subtype} | Yes |
| neris_action_codes | array | Yes |
| neris_noaction_code | string | Yes |
| neris_people_present | boolean/null | Yes |
| neris_aid_direction | string | Yes |
| neris_aid_type | string | Yes |
| neris_aid_departments | array | Yes |
| neris_displaced_number | int | Yes |
| neris_risk_reduction | object | Yes |
| neris_narrative_impedance | text | Yes |
| neris_narrative_outcome | text | Yes |
| neris_fire_investigation_need | string | Yes (Fire module) |
| neris_fire_investigation_type | array | Yes (Fire module) |
| neris_fire_arrival_conditions | string | Yes (Fire module) |
| neris_fire_structure_damage | string | Yes (Fire module) |
| neris_fire_structure_floor | int | Yes (Fire module) |
| neris_fire_structure_room | string | Yes (Fire module) |
| neris_fire_structure_cause | string | Yes (Fire module) |
| neris_fire_outside_cause | string | Yes (Fire module) |
| neris_medical_patient_care | string | Yes (Medical module) |
| neris_hazmat_disposition | string | Yes (Hazmat module) |
| neris_hazmat_evacuated | int | Yes (Hazmat module) |
| neris_hazmat_chemicals | array | Yes (Hazmat module) |
| neris_exposures | array | Yes |
| neris_emerging_hazard | object | Yes |
| neris_rr_smoke_alarm_type | array | Yes (RR detail) |
| neris_rr_smoke_alarm_working | boolean | Yes (RR detail) |
| neris_rr_smoke_alarm_operation | string | Yes (RR detail) |
| neris_rr_smoke_alarm_failure | string | Yes (RR detail) |
| neris_rr_smoke_alarm_action | string | Yes (RR detail) |
| neris_rr_fire_alarm_type | array | Yes (RR detail) |
| neris_rr_fire_alarm_operation | string | Yes (RR detail) |
| neris_rr_other_alarm | string | Yes (RR detail) |
| neris_rr_other_alarm_type | array | Yes (RR detail) |
| neris_rr_sprinkler_type | array | Yes (RR detail) |
| neris_rr_sprinkler_coverage | string | Yes (RR detail) |
| neris_rr_sprinkler_operation | string | Yes (RR detail) |
| neris_rr_sprinkler_heads_activated | int | Yes (RR detail) |
| neris_rr_sprinkler_failure | string | Yes (RR detail) |
| neris_rr_cooking_suppression | string | Yes (RR detail) |
| neris_rr_cooking_suppression_type | array | Yes (RR detail) |
| cad_units | array | No |
| created_at | timestamp | No |
| updated_at | timestamp | No |
| closed_at | timestamp | No |
| neris_submitted_at | timestamp | Yes |

#### Personnel Assignments State
| State | Type | Purpose |
|-------|------|---------|
| assignments | object | { "ENG481": [id, id, id, null, null, null], ... } |

### Handler Functions
| Function | Purpose |
|----------|---------|
| loadData | Load all reference data + incident data on mount |
| handleChange | Update formData field |
| handleAssignment | Update personnel slot |
| clearSlot | Clear personnel slot |
| getAssignedIds | Get Set of all assigned personnel IDs |
| getAvailablePersonnel | Filter personnel not already assigned |
| generateUnitsCalled | Build "Units Called" string from CAD units |
| populateUnitsCalled | Fill "Units Called" from CAD data |
| handleNerisTypeToggle | Add/remove incident type (max 3) |
| handleActionToggle | Add/remove action taken |
| handleLocationUseToggle | Set/clear location use |
| getLocationUseValue | Get location use as display string |
| handleRestorePreview | Fetch restore preview from API |
| handleRestoreConfirm | Execute restore from CAD |
| handleSave | Save incident + assignments |
| handleCloseIncident | Mark incident CLOSED |
| formatTimestamp | Format ISO to "YYYY-MM-DD HH:MM" |

### UI Sections Rendered
1. **Header** - Station name, status badge, timestamps (created, updated, closed, neris_submitted)
2. **Action Bar** - Login warning or "Editing as X", Cancel/Close/Save buttons
3. **Audit Log** - Last edit summary, expandable full log
4. **Incident Info** (left column)
   - Internal #, Category, CAD # (row)
   - Incident Date
   - CAD Type
   - CAD Subtype + CAD/Restore buttons
   - Address
   - Municipality, ESZ (row)
   - Cross Streets
5. **Time Fields** (right column)
   - Dispatched, Enroute, On Scene, Under Control, Cleared, In Service
6. **Caller Info** - Caller, Phone, Weather (3-col row)
7. **Narrative Section**
   - Units Called (with Auto button)
   - Situation Found, Damage, Services, Narrative, Problems (textareas)
8. **CAD Responding Units** - Table with unit, times, type
9. **Personnel Grid** - Trucks as columns, slots as rows (D, O, 3-6)
10. **Virtual Units** - Direct/Station dynamic lists
11. **Officer Section** - Officer in Charge, Completed By dropdowns
12. **NERIS Toggle Button** - Show/Hide NERIS Fields
13. **NERIS Section** (when expanded, FIRE only)
    - Incident Type picker (max 3)
    - Location Use picker (single)
    - Actions Taken picker (multi)
    - No Action Reason (when no actions)
    - People Present (radio: Yes/No/Unknown)
    - People Displaced (number)
    - Mutual Aid (direction + type)
    - Risk Reduction grid (Smoke/Fire/Sprinkler/Other presence)
    - Smoke Alarm Details (when PRESENT)
    - Fire Alarm Details (when PRESENT)
    - Other Alarm Details (when PRESENT)
    - Sprinkler Details (when PRESENT)
    - Cooking Suppression (for CONFINED_COOKING)
    - Emerging Hazards (EV/Solar/CSST checkboxes with sub-fields)
    - Exposures list (for structure fires)
    - Impedance textarea
    - Outcome textarea
    - Fire Module (when FIRE type)
    - Medical Module (when MEDICAL type)
    - Hazmat Module (when HAZSIT type)
14. **NERIS Modals** - IncidentType, LocationUse, ActionsTaken
15. **CAD Data Modal**
16. **Restore Preview Modal**
17. **Bottom Buttons** - Cancel, Close Incident, Save

---

## API.JS INVENTORY

### Used by RunSheetForm
| Function | Endpoint | Method |
|----------|----------|--------|
| getApparatus | /apparatus | GET |
| getPersonnel | /personnel | GET |
| getMunicipalities | /lookups/municipalities | GET |
| getIncidentTypesByCategory | /lookups/neris/incident-types/by-category | GET |
| getLocationUsesByCategory | /lookups/neris/location-uses/by-category | GET |
| getActionsTakenByCategory | /lookups/neris/actions-taken/by-category | GET |
| suggestIncidentNumber | /incidents/suggest-number | GET |
| getAidTypes | /lookups/neris/aid-types | GET |
| getAidDirections | /lookups/neris/aid-directions | GET |
| getNerisCategory | /neris-codes/categories/{category} | GET |
| createIncident | /incidents | POST |
| updateIncident | /incidents/{id} | PUT |
| closeIncident | /incidents/{id}/close | POST |
| getIncidentAuditLog | /incidents/{id}/audit-log | GET |
| getUserSession | N/A (sessionStorage) | - |

### Direct fetch() in RunSheetForm (not in api.js)
| URL | Method | Purpose |
|-----|--------|---------|
| /api/incidents/{id}/assignments | PUT | Save personnel assignments |
| /api/backup/preview-restore/{id} | GET | Get restore preview |
| /api/backup/restore-from-cad/{id} | POST | Execute restore |

---

## RUNSHEETFORM.CSS INVENTORY

### Layout Classes
| Class | Purpose |
|-------|---------|
| .runsheet-form | Main container (max-width 1200px) |
| .runsheet-header | Title area with border |
| .timestamps-bar | Timestamps row |
| .runsheet-top | 2-column grid for info/times |
| .runsheet-col | Flex column |
| .runsheet-section | Section with top border |
| .form-row | 2-column grid |
| .form-row.three-col | 3-column grid |
| .form-group | Label + input container |
| .runsheet-actions | Bottom buttons container |

### Input Styling
| Class | Purpose |
|-------|---------|
| input, select, textarea | Dark theme styling |
| :focus states | Red border highlight |
| .field-locked | Grayed out immutable fields |
| .locked-indicator | Lock icon next to label |

### Personnel Table
| Class | Purpose |
|-------|---------|
| .personnel-table | Table layout |
| .slot-col | # column styling |
| .slot-cell | Cell with select + clear button |
| .clear-btn | Red X button |
| .slot-disabled | Empty cells (no slot) |
| .truck-dispatched | Green highlight for dispatched trucks |
| .truck-not-dispatched | Dimmed for non-dispatched |
| .cell-dimmed | Individual dimmed cells |

### Personnel Typeahead
| Class | Purpose |
|-------|---------|
| .personnel-typeahead | Container |
| .typeahead-input | Input field |
| .typeahead-dropdown | Dropdown menu |
| .typeahead-option | Option item |
| .typeahead-option.highlighted | Keyboard-selected |
| .typeahead-empty | "No matches" text |

### Virtual Units (Dynamic Lists)
| Class | Purpose |
|-------|---------|
| .virtual-units-row | Grid container |
| .dynamic-list | Card container |
| .dynamic-list-header | Unit name |
| .dynamic-list-items | Items container |
| .dynamic-item | Single item row |
| .dynamic-item-name | Name display |
| .dynamic-item.new-entry | Add field |

### CAD Units Table
| Class | Purpose |
|-------|---------|
| .cad-units-table | Table |
| .our-unit-row | Green tint for Station 48 |
| .mutual-aid-row | Blue tint for MA |
| .unit-id-cell | Unit ID with badge |
| .mutual-aid-badge | "MA" badge |

### Units Called Field
| Class | Purpose |
|-------|---------|
| .units-called-group | Container |
| .units-called-row | Input + button row |
| .auto-fill-btn | Blue Auto button |

### Buttons
| Class | Purpose |
|-------|---------|
| .btn | Base button |
| .btn-primary | Red primary |
| .btn-secondary | Blue secondary |
| .btn-warning | Orange warning |
| .btn-sm | Small variant |

### Badges
| Class | Purpose |
|-------|---------|
| .badge | Base badge |
| .badge-open | Green |
| .badge-closed | Gray |
| .badge-completed | Blue |

### NERIS Section
| Class | Purpose |
|-------|---------|
| .neris-section | Container with dark bg |
| .neris-field | Field wrapper |
| .neris-field-label | Label styling |
| .neris-picker-btn | Dropdown trigger button |
| .neris-picker-arrow | Down arrow |
| .neris-selected-chips | Chip container |
| .neris-chip | Selected item chip |
| .chip-remove | X button on chip |
| .neris-no-selection | Empty state text |
| .neris-counter | "1/3" counter |
| .neris-radio-group | Radio button row |
| .neris-radio | Radio label + input |
| .neris-select | Dropdown select |
| .neris-number-input | Number input |
| .neris-row | Horizontal flex row |
| .neris-textarea | Textarea styling |

### NERIS Modal
| Class | Purpose |
|-------|---------|
| .neris-modal-overlay | Dark backdrop |
| .neris-modal | Modal container |
| .neris-modal-header | Title bar |
| .neris-modal-close | X button |
| .neris-modal-selected | Selected chips area |
| .neris-modal-content | Scrollable content |
| .neris-modal-category | Category wrapper |
| .neris-modal-cat-header | Category button |
| .neris-modal-cat-header.expanded | Expanded state |
| .neris-modal-cat-header.selected | Selected state |
| .neris-modal-cat-header.disabled | At limit state |
| .neris-modal-cat-content | Items container |
| .neris-subcat | Subcategory wrapper |
| .neris-subcat-label | Subcategory label |
| .neris-items | Items flex container |
| .neris-item | Selectable item button |
| .neris-item.selected | Selected state |
| .neris-item.disabled | At limit state |
| .neris-modal-footer | Footer with count + Done |
| .neris-modal-count | Selection count text |

### Risk Reduction
| Class | Purpose |
|-------|---------|
| .neris-risk-grid | 3-column grid |
| .neris-risk-item | Label + select |
| .neris-rr-details | Expanded detail panel |
| .neris-rr-details-header | Panel title |
| .neris-rr-details-grid | Auto-fit grid |
| .neris-rr-field | Label + input in grid |
| .neris-multi-select | Multi-select dropdown |

### Emerging Hazards
| Class | Purpose |
|-------|---------|
| .neris-emerging-hazards | Container |
| .neris-emerging-item | Hazard card |
| .neris-checkbox-label | Checkbox + label |
| .neris-emerging-details | Expanded sub-fields |

### Exposures
| Class | Purpose |
|-------|---------|
| .neris-exposures-list | List container |
| .neris-exposure-item | Exposure card |
| .neris-exposure-row | Fields row |
| .neris-remove-btn | Remove button |
| .neris-add-btn | Add button (dashed border) |

### Conditional Modules
| Class | Purpose |
|-------|---------|
| .neris-module | Module container |
| .neris-module-fire | Red tint |
| .neris-module-medical | Blue tint |
| .neris-module-hazmat | Yellow tint |
| .neris-module-title | Module header |
| .neris-required | Red asterisk |

### Hazmat Chemicals
| Class | Purpose |
|-------|---------|
| .neris-chemicals-list | List container |
| .neris-chemical-entry | Entry row |
| .neris-text-input | Text input styling |
| .neris-checkbox-inline | Inline checkbox |

### Info Tooltip
| Class | Purpose |
|-------|---------|
| .info-tooltip-wrapper | Container |
| .info-icon | ℹ icon |
| .info-tooltip-text | Popup text |

### CAD Data Modal
| Class | Purpose |
|-------|---------|
| .cad-data-modal | Wider modal variant |
| .cad-section | Section with border |
| .cad-html-content | Styled CAD HTML |

### Responsive
| Breakpoint | Changes |
|------------|---------|
| max-width: 900px | runsheet-top to 1 column |
| max-width: 600px | Various grids to 1 column |

---

## PROPOSED STRUCTURE (from context doc)

```
/components/RunSheet/
├── RunSheetForm.jsx (container, state management, ~300 lines)
├── IncidentHeader.jsx (title, status, timestamps)
├── ActionBar.jsx (save, cancel, CAD, restore buttons)
├── IncidentInfo.jsx (internal #, CAD #, category, date, address)
├── TimeFields.jsx (all 6 time inputs, inline labels)
├── CallerInfo.jsx (caller, phone, weather)
├── NarrativeSection.jsx (units called, textareas)
├── PersonnelSection.jsx (apparatus table, direct/station lists)
├── CADUnitsTable.jsx (responding units from CAD)
├── NERISSection.jsx (already extracted)
├── AuditTrail.jsx (expandable log)
└── modals/
    ├── CADDataModal.jsx
    ├── RestorePreviewModal.jsx
    └── NERISModals.jsx
```

---

## CHECKLIST FOR REFACTORING

### Phase 1: Tailwind Setup
- [ ] Install tailwindcss, postcss, autoprefixer
- [ ] Create tailwind.config.js with theme colors
- [ ] Create postcss.config.js
- [ ] Add Tailwind directives to index.css
- [ ] Verify build works

### Phase 2: Shared Components
- [ ] Extract Chip component
- [ ] Extract InfoTooltip component
- [ ] Extract PersonnelTypeahead component
- [ ] Extract DynamicPersonnelList component
- [ ] Convert each to Tailwind classes

### Phase 3: RunSheet Context
- [ ] Create RunSheetContext.jsx with all state
- [ ] Move all useState hooks
- [ ] Move loadData function
- [ ] Move all handlers
- [ ] Export useRunSheet hook

### Phase 4: Section Components
- [ ] IncidentHeader.jsx (station name, status, timestamps)
- [ ] ActionBar.jsx (login warning, buttons)
- [ ] AuditTrail.jsx (expandable log)
- [ ] IncidentInfo.jsx (incident fields)
- [ ] TimeFields.jsx (6 time inputs, inline labels per doc)
- [ ] CallerInfo.jsx (3-col row)
- [ ] NarrativeSection.jsx (Units Called with Auto, textareas)
- [ ] CADUnitsTable.jsx (responding units)
- [ ] PersonnelGrid.jsx (trucks table)
- [ ] VirtualUnits.jsx (Direct/Station)
- [ ] OfficerSection.jsx (2 dropdowns)

### Phase 5: NERIS Components
- [ ] NERISSection.jsx (main wrapper)
- [ ] NerisModal.jsx (hierarchical picker)
- [ ] NerisClassification.jsx (type, location, actions)
- [ ] NerisRiskReduction.jsx (alarms, sprinklers)
- [ ] NerisEmergingHazards.jsx (EV, Solar, CSST)
- [ ] NerisExposures.jsx (exposure list)
- [ ] NerisFireModule.jsx (fire-specific fields)
- [ ] NerisMedicalModule.jsx (medical-specific)
- [ ] NerisHazmatModule.jsx (hazmat-specific)

### Phase 6: Modal Components
- [ ] CADDataModal.jsx
- [ ] RestorePreviewModal.jsx

### Phase 7: Main Container
- [ ] Create RunSheet/index.jsx
- [ ] Compose all sections
- [ ] Wire up context provider
- [ ] Re-export from components/RunSheetForm.jsx for compatibility

### Phase 8: CSS Conversion
- [ ] Convert all CSS classes to Tailwind utilities
- [ ] Remove RunSheetForm.css (or keep minimal overrides)
- [ ] Test responsive breakpoints

### Phase 9: Verification
- [ ] Every field from inventory renders
- [ ] Every handler from inventory works
- [ ] All NERIS conditional logic works
- [ ] CAD modal displays correctly
- [ ] Personnel typeahead works
- [ ] Save/Close functions work
- [ ] Audit log displays
- [ ] Mobile responsive

---

## NOTES

1. The context doc says time field labels should be "inline LEFT of field" - currently they're above
2. The context doc says "No Editing as text" - currently shows it, should only show warning if not logged in
3. The context doc says "Auto button small, LEFT side" - currently it's on the right
4. The context doc says textareas should "start at 1 line, auto-expand" - need to implement
5. The context doc says NERIS should be "hidden for EMS" - currently there's a toggle button that shows for both (though content only shows for FIRE)
