/**
 * nerisFieldDefs.js
 *
 * Single source of truth for all NERIS entity form field definitions:
 * labels, hints, required flags, and enum choice lists.
 *
 * Source: core_mod_entity_fd.csv — ulfsri/neris-framework (retrieved 2026-03-05)
 * API spec: https://api.neris.fsri.org/v1/openapi.json (v1.4.35)
 *
 * When NERIS publishes schema updates, update this file and
 * docs/NERIS_ENTITY_FIELD_REFERENCE.md together.
 */

// ─── Enum choice arrays ───────────────────────────────────────────────────────
// Each entry: { value: 'API_VALUE', label: 'Human readable' }
// Values must match NERIS API exactly.

/** TypeDeptValue — staffing type of the agency */
export const DEPT_TYPES = [
  { value: 'CAREER',      label: 'Career' },
  { value: 'COMBINATION', label: 'Combination (Career + Volunteer)' },
  { value: 'VOLUNTEER',   label: 'Volunteer' },
];

/** TypeEntityValue — legal/organizational category of the agency */
export const ENTITY_TYPES = [
  { value: 'CONTRACT',       label: 'Contract' },
  { value: 'FEDERAL',        label: 'Federal' },
  { value: 'LOCAL',          label: 'Local' },
  { value: 'OTHER',          label: 'Other' },
  { value: 'PRIVATE',        label: 'Private' },
  { value: 'STATE',          label: 'State' },
  { value: 'TRANSPORTATION', label: 'Transportation' },
  { value: 'TRIBAL',         label: 'Tribal' },
];

/** TypeUnitValue — all 49 unit types */
export const UNIT_TYPES = [
  { value: 'ENGINE_STRUCT',       label: 'Engine (Structural)' },
  { value: 'ENGINE_WUI',          label: 'Engine (WUI / Wildland-Urban Interface)' },
  { value: 'LADDER_QUINT',        label: 'Ladder / Quint' },
  { value: 'LADDER_TALL',         label: 'Ladder (Tall)' },
  { value: 'LADDER_SMALL',        label: 'Ladder (Small)' },
  { value: 'LADDER_TILLER',       label: 'Ladder (Tiller)' },
  { value: 'PLATFORM',            label: 'Platform' },
  { value: 'PLATFORM_QUINT',      label: 'Platform Quint' },
  { value: 'QUINT_TALL',          label: 'Quint (Tall)' },
  { value: 'RESCUE_HEAVY',        label: 'Rescue (Heavy)' },
  { value: 'RESCUE_MEDIUM',       label: 'Rescue (Medium)' },
  { value: 'RESCUE_LIGHT',        label: 'Rescue (Light)' },
  { value: 'RESCUE_USAR',         label: 'Rescue (USAR)' },
  { value: 'RESCUE_WATER',        label: 'Rescue (Water)' },
  { value: 'ALS_AMB',             label: 'ALS Ambulance' },
  { value: 'BLS_AMB',             label: 'BLS Ambulance' },
  { value: 'EMS_NOTRANS',         label: 'EMS (No Transport)' },
  { value: 'EMS_SUPV',            label: 'EMS Supervisor' },
  { value: 'TENDER',              label: 'Tender' },
  { value: 'FOAM',                label: 'Foam Unit' },
  { value: 'HAZMAT',              label: 'HazMat' },
  { value: 'DECON',               label: 'Decon' },
  { value: 'INVEST',              label: 'Investigation' },
  { value: 'CHIEF_STAFF_COMMAND', label: 'Chief / Staff / Command' },
  { value: 'MOBILE_COMMS',        label: 'Mobile Communications' },
  { value: 'MOBILE_ICP',          label: 'Mobile ICP' },
  { value: 'REHAB',               label: 'Rehab' },
  { value: 'SCBA',                label: 'SCBA' },
  { value: 'MAB',                 label: 'MAB' },
  { value: 'BOAT',                label: 'Boat' },
  { value: 'BOAT_LARGE',          label: 'Boat (Large)' },
  { value: 'HELO_FIRE',           label: 'Helicopter (Fire)' },
  { value: 'HELO_GENERAL',        label: 'Helicopter (General)' },
  { value: 'HELO_RESCUE',         label: 'Helicopter (Rescue)' },
  { value: 'AIR_EMS',             label: 'Air EMS' },
  { value: 'AIR_TANKER',          label: 'Air Tanker' },
  { value: 'AIR_LIGHT',           label: 'Air Light' },
  { value: 'AIR_RECON',           label: 'Air Recon' },
  { value: 'ARFF',                label: 'ARFF' },
  { value: 'CREW',                label: 'Crew' },
  { value: 'CREW_TRANS',          label: 'Crew Transport' },
  { value: 'DOZER',               label: 'Dozer' },
  { value: 'ATV_FIRE',            label: 'ATV (Fire)' },
  { value: 'ATV_EMS',             label: 'ATV (EMS)' },
  { value: 'UAS_FIRE',            label: 'UAS (Fire)' },
  { value: 'UAS_RECON',           label: 'UAS (Recon)' },
  { value: 'POV',                 label: 'POV' },
  { value: 'OTHER_GROUND',        label: 'Other Ground' },
  { value: 'UTIL',                label: 'Utility' },
];

/** TypeServFdValue — fire services */
export const FIRE_SERVICES = [
  { value: 'STRUCTURAL_FIREFIGHTING', label: 'Structural Firefighting' },
  { value: 'WILDLAND_FIREFIGHTING',   label: 'Wildland Firefighting' },
  { value: 'ARFF_FIREFIGHTING',       label: 'ARFF Firefighting' },
  { value: 'MARINE_FIREFIGHTING',     label: 'Marine Firefighting' },
  { value: 'PETROCHEM_FIREFIGHTING',  label: 'Petrochemical Firefighting' },
  { value: 'HIGHRISE_FIREFIGHTING',   label: 'High-Rise Firefighting' },
  { value: 'HAZMAT_OPS',              label: 'HazMat — Operations Level' },
  { value: 'HAZMAT_TECHNICIAN',       label: 'HazMat — Technician Level' },
  { value: 'VEHICLE_RESCUE',          label: 'Vehicle Rescue / Extrication' },
  { value: 'ROPE_RESCUE',             label: 'Rope Rescue' },
  { value: 'TRENCH_RESCUE',           label: 'Trench Rescue' },
  { value: 'CONFINED_SPACE',          label: 'Confined Space Rescue' },
  { value: 'COLLAPSE_RESCUE',         label: 'Structural Collapse Rescue' },
  { value: 'MACHINERY_RESCUE',        label: 'Machinery / Industrial Rescue' },
  { value: 'WATERCRAFT_RESCUE',       label: 'Watercraft Rescue' },
  { value: 'ANIMAL_TECHRESCUE',       label: 'Animal Technical Rescue' },
  { value: 'ICE_RESCUE',              label: 'Ice Rescue' },
  { value: 'SURF_RESCUE',             label: 'Surf Rescue' },
  { value: 'SWIFTWATER_SAR',          label: 'Swift Water Search & Rescue' },
  { value: 'WATER_SAR',               label: 'Water Search & Rescue' },
  { value: 'FLOOD_SAR',               label: 'Flood Search & Rescue' },
  { value: 'DIVE_SAR',                label: 'Dive Search & Rescue' },
  { value: 'WILDERNESS_SAR',          label: 'Wilderness Search & Rescue' },
  { value: 'CAVE_SAR',                label: 'Cave Search & Rescue' },
  { value: 'MINE_SAR',                label: 'Mine Search & Rescue' },
  { value: 'TOWER_SAR',               label: 'Tower / High Angle Search & Rescue' },
  { value: 'HELO_SAR',                label: 'Helicopter Search & Rescue' },
  { value: 'REHABILITATION',          label: 'Incident Rehabilitation' },
  { value: 'CAUSE_ORIGIN',            label: 'Fire Cause & Origin Investigation' },
  { value: 'RRD_EXISTING',            label: 'Risk Reduction — Existing Structures Inspection' },
  { value: 'RRD_NEWCONST',            label: 'Risk Reduction — New Construction Inspection' },
  { value: 'RRD_PLANS',               label: 'Risk Reduction — Plans Review' },
  { value: 'RRD_PUBLICED',            label: 'Risk Reduction — Public Education' },
  { value: 'TRAINING_DRIVER',         label: 'Training — Driver / Operator' },
  { value: 'TRAINING_ELF',            label: 'Training — Entry-Level Firefighter' },
  { value: 'TRAINING_OD',             label: 'Training — Officer Development' },
  { value: 'TRAINING_VETFF',          label: 'Training — Veteran Firefighter' },
];

/** TypeServEmsValue — EMS services */
export const EMS_SERVICES = [
  { value: 'ALS_TRANSPORT',    label: 'ALS with Transport' },
  { value: 'ALS_NO_TRANSPORT', label: 'ALS without Transport' },
  { value: 'BLS_TRANSPORT',    label: 'BLS with Transport' },
  { value: 'BLS_NO_TRANSPORT', label: 'BLS without Transport' },
  { value: 'AERO_TRANSPORT',   label: 'Aeromedical Transport' },
  { value: 'COMMUNITY_MED',    label: 'Community Medicine / Mobile Integrated Healthcare' },
  { value: 'NO_MEDICAL',       label: 'No Medical Services' },
];

/** TypeServInvestValue — investigation services */
export const INVESTIGATION_SERVICES = [
  { value: 'COMPANY_LEVEL',    label: 'Company-Level Investigation' },
  { value: 'DEDICATED',        label: 'Dedicated Investigation Unit' },
  { value: 'K9_DETECT',        label: 'K9 Accelerant Detection' },
  { value: 'LAW_ENFORCEMENT',  label: 'Law Enforcement Investigation Authority' },
  { value: 'YOUTH_FIRESETTER', label: 'Youth Firesetter Intervention Program' },
];

/** TypePsapType */
export const PSAP_TYPES = [
  { value: 'PRIMARY',   label: 'Primary — answers initial 9-1-1 calls' },
  { value: 'SECONDARY', label: 'Secondary — receives transferred calls from primary PSAP' },
];

/** TypePsapCapability */
export const PSAP_CAPABILITIES = [
  { value: 'LEGACY', label: 'Legacy — uses CAMA/ISDN, cannot process IP-based calls' },
  { value: 'NG911',  label: 'NG9-1-1 — meets NENA i3 specification for IP-based calls' },
];

/** TypePsapDiscipline */
export const PSAP_DISCIPLINES = [
  { value: 'SINGLE',   label: 'Single — one discipline (fire, EMS, or police)' },
  { value: 'MULTIPLE', label: 'Multiple — two or more disciplines (e.g. fire-EMS-police)' },
];

/** TypePsapJurisdiction */
export const PSAP_JURISDICTIONS = [
  { value: 'SINGLE',   label: 'Single — one political entity uses this PSAP' },
  { value: 'MULTIPLE', label: 'Multiple — two or more jurisdictions share this PSAP' },
];

/** TypeProtocolValue — dispatch protocol */
export const DISPATCH_PROTOCOLS = [
  { value: 'APCO',  label: 'APCO' },
  { value: 'IAED',  label: 'IAED (International Academies of Emergency Dispatch)' },
  { value: 'PROQA', label: 'ProQA' },
  { value: 'OTHER', label: 'Other' },
];

/** US states and territories — StatesTerrs enum */
export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC','PR','GU','VI','AS','MP',
];

// ─── Field definitions ────────────────────────────────────────────────────────
// Structure per field:
//   label    — display label shown in the form
//   hint     — help text shown below the field; sourced from NERIS framework CSV definitions
//   required — true if required by NERIS API (DepartmentPayload required[] array)
//   type     — 'text' | 'select' | 'number' | 'checkbox' | 'multi' | 'readonly'
//   choices  — array of { value, label } for select/multi fields
//   min/max  — for number fields
//   placeholder — optional input placeholder text

export const ENTITY_FIELD_DEFS = {

  // Section 1 — Identification
  fd_neris_id: {
    label: 'NERIS Department ID',
    hint: 'Unique identifier assigned by NERIS. Format: two-letter entity type + state/county FIPS + random trailing characters. e.g. FD42029593',
    required: false,
    type: 'text',
  },
  internal_id: {
    label: 'Internal / Legacy ID',
    hint: 'Legacy FDID for linkage to historical datasets (NFIRS, state systems).',
    required: false,
    type: 'text',
  },
  name: {
    label: 'Department Name',
    hint: 'Full name of the agency.',
    required: true,
    type: 'text',
  },
  time_zone: {
    label: 'Time Zone',
    hint: 'IANA timezone identifier for the agency\'s location. Required by NERIS API. e.g. America/New_York, America/Chicago, America/Denver, America/Los_Angeles',
    required: true,
    type: 'text',
    placeholder: 'America/New_York',
  },
  fips_code: {
    label: 'FIPS Code',
    hint: 'Federal FIPS geographic code for the agency\'s headquarters county. Used by NERIS in entity ID construction. e.g. 42029 for Chester County, PA',
    required: false,
    type: 'text',
  },

  // Section 2 — Physical Address
  address_line_1: {
    label: 'Street Address',
    hint: 'Physical address of agency headquarters.',
    required: true,
    type: 'text',
  },
  address_line_2: {
    label: 'Suite / Apt',
    hint: 'Additional address information (suite, floor, building). Optional.',
    required: false,
    type: 'text',
  },
  city: {
    label: 'City',
    hint: 'City in which the agency is located.',
    required: true,
    type: 'text',
  },
  state: {
    label: 'State',
    hint: 'State in which the agency is located.',
    required: true,
    type: 'select',
    choices: US_STATES.map(s => ({ value: s, label: s })),
  },
  zip_code: {
    label: 'ZIP Code',
    hint: 'ZIP code in which the agency is located.',
    required: true,
    type: 'text',
    maxLength: 10,
  },
  location_lat: {
    label: 'Latitude',
    hint: 'WGS84 decimal degrees. If not submitted, NERIS will attempt to geocode from the street address.',
    required: false,
    type: 'text',
    placeholder: '39.9526',
  },
  location_lng: {
    label: 'Longitude',
    hint: 'WGS84 decimal degrees.',
    required: false,
    type: 'text',
    placeholder: '-75.1652',
  },

  // Mailing address
  mail_address_line_1: {
    label: 'Mailing Street Address',
    hint: 'Agency mailing address if different from physical address.',
    required: false,
    type: 'text',
  },
  mail_address_line_2: {
    label: 'Mailing Suite / Apt',
    hint: 'Additional mailing address information.',
    required: false,
    type: 'text',
  },
  mail_city:     { label: 'Mailing City',     hint: 'City of agency mailing address.',     required: false, type: 'text' },
  mail_state:    { label: 'Mailing State',    hint: 'State of agency mailing address.',    required: false, type: 'select', choices: US_STATES.map(s => ({ value: s, label: s })) },
  mail_zip_code: { label: 'Mailing ZIP Code', hint: 'ZIP code of agency mailing address.', required: false, type: 'text', maxLength: 10 },

  // Section 3 — Contact
  email: {
    label: 'Email',
    hint: 'Contact email address of the agency.',
    required: false,
    type: 'text',
  },
  website: {
    label: 'Website',
    hint: 'Website URL of the agency.',
    required: false,
    type: 'text',
    placeholder: 'https://',
  },

  // Section 4 — Classification
  department_type: {
    label: 'Department Type',
    hint: 'Staffing model of the agency.',
    required: false,
    type: 'select',
    choices: DEPT_TYPES,
  },
  entity_type: {
    label: 'Entity Type',
    hint: 'Legal or organizational category of the agency.',
    required: false,
    type: 'select',
    choices: ENTITY_TYPES,
  },
  rms_software: {
    label: 'RMS Software',
    hint: 'Manufacturer or name of the Records Management System used by the agency. Use "None" if no RMS.',
    required: false,
    type: 'text',
  },
  continue_edu: {
    label: 'Continuing Education Policy',
    hint: 'Whether the agency has a continuing education or training policy in place.',
    required: false,
    type: 'checkbox',
  },

  // Section 5 — Services
  fire_services: {
    label: 'Fire Services',
    hint: 'All fire and rescue services this agency provides.',
    required: false,
    type: 'multi',
    choices: FIRE_SERVICES,
  },
  ems_services: {
    label: 'EMS Services',
    hint: 'All EMS services this agency provides.',
    required: false,
    type: 'multi',
    choices: EMS_SERVICES,
  },
  investigation_services: {
    label: 'Investigation Services',
    hint: 'All fire investigation services this agency provides.',
    required: false,
    type: 'multi',
    choices: INVESTIGATION_SERVICES,
  },

  // Section 6 — Dispatch (JSONB sub-fields — keys used as dispatch.X)
  dispatch_center_id: {
    label: 'PSAP Center ID',
    hint: '4-digit unique identifier for the PSAP dispatch center that dispatches this agency.',
    required: false,
    type: 'text',
    placeholder: '4311',
  },
  dispatch_cad_software: {
    label: 'CAD Software',
    hint: 'Manufacturer or name of the CAD system used. Use "None" if no CAD.',
    required: false,
    type: 'text',
  },
  dispatch_avl_usage: {
    label: 'AVL Usage',
    hint: 'Whether the CAD system uses Automatic Vehicle Location (AVL) technology.',
    required: false,
    type: 'checkbox',
  },
  dispatch_psap_type: {
    label: 'PSAP Type',
    hint: 'PRIMARY = answers initial 9-1-1 calls. SECONDARY = receives calls transferred from a primary PSAP due to jurisdictional or discipline-specific dispatching.',
    required: false,
    type: 'select',
    choices: PSAP_TYPES,
  },
  dispatch_psap_capability: {
    label: 'PSAP Capability',
    hint: 'LEGACY = uses CAMA/ISDN trunk technology, cannot process IP-based calls. NG911 = meets NENA i3 specification for Next Generation 9-1-1.',
    required: false,
    type: 'select',
    choices: PSAP_CAPABILITIES,
  },
  dispatch_psap_discipline: {
    label: 'PSAP Discipline',
    hint: 'SINGLE = dispatch center handles one discipline (fire, EMS, or police). MULTIPLE = handles two or more disciplines.',
    required: false,
    type: 'select',
    choices: PSAP_DISCIPLINES,
  },
  dispatch_psap_jurisdiction: {
    label: 'PSAP Jurisdiction',
    hint: 'SINGLE = only one city/county uses this PSAP. MULTIPLE = two or more political jurisdictions share the 9-1-1 and dispatch services.',
    required: false,
    type: 'select',
    choices: PSAP_JURISDICTIONS,
  },
  dispatch_protocol_fire: {
    label: 'Fire Dispatch Protocol',
    hint: 'Procedure or protocol followed for triage of emergency fire calls.',
    required: false,
    type: 'select',
    choices: DISPATCH_PROTOCOLS,
  },
  dispatch_protocol_med: {
    label: 'Medical Dispatch Protocol',
    hint: 'Procedure or protocol followed for triage of emergency medical calls.',
    required: false,
    type: 'select',
    choices: DISPATCH_PROTOCOLS,
  },

  // Section 7 — Staffing (active personnel only; staff_total computed by NERIS)
  staff_ff_career_ft:  { label: 'FF — Career Full-Time',        hint: 'Total active full-time career firefighters.', type: 'number', min: 0 },
  staff_ff_career_pt:  { label: 'FF — Career Part-Time',        hint: 'Total active part-time career firefighters.', type: 'number', min: 0 },
  staff_ff_volunteer:  { label: 'FF — Volunteer',               hint: 'Total active volunteer firefighters.', type: 'number', min: 0 },
  staff_ems_career_ft: { label: 'EMS Only — Career Full-Time',  hint: 'Total active full-time career EMS-only staff (not cross-trained as firefighters).', type: 'number', min: 0 },
  staff_ems_career_pt: { label: 'EMS Only — Career Part-Time',  hint: 'Total active part-time career EMS-only staff.', type: 'number', min: 0 },
  staff_ems_volunteer: { label: 'EMS Only — Volunteer',         hint: 'Total active volunteer EMS-only staff.', type: 'number', min: 0 },
  staff_civ_career_ft: { label: 'Civilians — Career Full-Time', hint: 'Total active full-time career civilian staff.', type: 'number', min: 0 },
  staff_civ_career_pt: { label: 'Civilians — Career Part-Time', hint: 'Total active part-time career civilian staff.', type: 'number', min: 0 },
  staff_civ_volunteer: { label: 'Civilians — Volunteer',        hint: 'Total active volunteer civilian staff.', type: 'number', min: 0 },

  // Section 8 — Assessment
  assessment_iso_rating: {
    label: 'ISO Rating',
    hint: 'Current ISO Public Protection Classification (PPC) rating, 1–10. 1 = best protection, 10 = unprotected. Leave blank if not rated.',
    required: false,
    type: 'number',
    min: 1,
    max: 10,
  },
  assessment_cpse: {
    label: 'CPSE Accredited',
    hint: 'Whether the agency holds accreditation through the Commission on Fire Accreditation International (CPSE / CFAI).',
    required: false,
    type: 'checkbox',
  },
  assessment_caas: {
    label: 'CAAS Accredited',
    hint: 'Whether the agency holds accreditation through the Commission on Accreditation of Ambulance Services (CAAS).',
    required: false,
    type: 'checkbox',
  },

  // Shift (career/combination departments)
  shift_count: {
    label: 'Number of Shifts',
    hint: 'Number of shifts the agency operates. Required for career and combination departments. e.g. 3 for a three-platoon system.',
    required: false,
    type: 'number',
    min: 1,
  },
  shift_duration: {
    label: 'Shift Duration (hours)',
    hint: 'Duration of each shift in hours. Required for career and combination departments. e.g. 24 for a 24-hour shift.',
    required: false,
    type: 'number',
    min: 1,
  },
  shift_signup: {
    label: 'Current Shift Number',
    hint: 'The shift number currently on duty at NERIS activation. Used by NERIS to sync schedule-based data filtering.',
    required: false,
    type: 'number',
    min: 1,
  },
};

// ─── Station field definitions ────────────────────────────────────────────────

export const STATION_FIELD_DEFS = {
  station_id: {
    label: 'Station ID',
    hint: 'Identifier for this station. NERIS formats the full ID as [DEPT_NERIS_ID]S[###] (e.g. FD42029593S001). Enter the numeric portion or your local station identifier.',
    required: true,
    type: 'text',
  },
  internal_id: {
    label: 'Internal ID',
    hint: 'Optional agency-internal identifier for this station (e.g. a local station number used in other systems).',
    required: false,
    type: 'text',
  },
  station_name: {
    label: 'Station Name',
    hint: 'Human-readable name for display in CADReport. Not submitted to NERIS.',
    required: false,
    type: 'text',
  },
  address_line_1: {
    label: 'Street Address',
    hint: 'Physical street address of the station building.',
    required: true,
    type: 'text',
  },
  city:    { label: 'City',     hint: 'City in which the station is located.',    required: true,  type: 'text' },
  state:   { label: 'State',    hint: 'State in which the station is located.',   required: true,  type: 'select', choices: US_STATES.map(s => ({ value: s, label: s })) },
  zip_code:{ label: 'ZIP Code', hint: 'ZIP code in which the station is located.',required: true,  type: 'text', maxLength: 10 },
  location_lat: {
    label: 'Latitude',
    hint: 'WGS84 decimal degrees. If not submitted, NERIS will attempt to geocode from the street address.',
    required: false,
    type: 'text',
  },
  location_lng: {
    label: 'Longitude',
    hint: 'WGS84 decimal degrees.',
    required: false,
    type: 'text',
  },
  staffing: {
    label: 'Min. Station Staffing',
    hint: 'Minimum staffing assigned to the station overall. Separate from unit staffing — a station can cross-staff multiple units from its total personnel.',
    required: false,
    type: 'number',
    min: 0,
  },
};

// ─── Unit field definitions ───────────────────────────────────────────────────

export const UNIT_FIELD_DEFS = {
  apparatus_id: {
    label: 'Apparatus',
    hint: 'Links this NERIS unit to an apparatus record in CADReport for local display. Not submitted to NERIS.',
    required: false,
    type: 'select',
  },
  cad_designation_1: {
    label: 'CAD ID',
    hint: 'The unit\'s primary designation exactly as it appears in the CAD system. This is how NERIS links CAD dispatch data to entity units. Required if the department has a CAD system.',
    required: true,
    type: 'text',
    placeholder: 'E48',
  },
  cad_designation_2: {
    label: 'Alt CAD ID',
    hint: 'Optional second CAD designation. Used when a unit carries both a municipal ID and a county ID in CAD.',
    required: false,
    type: 'text',
  },
  type: {
    label: 'Unit Type',
    hint: 'Type of unit (TypeUnitValue). Select the category that best describes this unit\'s primary operational function.',
    required: false,
    type: 'select',
    choices: UNIT_TYPES,
  },
  staffing: {
    label: 'Min. Staffing',
    hint: 'Minimum number of personnel required for this unit to be dispatched to an incident.',
    required: true,
    type: 'number',
    min: 0,
  },
  dedicated_staffing: {
    label: 'Dedicated Staffing',
    hint: 'Whether this unit has staffing assigned exclusively to it (not shared with other units). Can only be true if Min. Staffing > 0.',
    required: false,
    type: 'checkbox',
  },
  neris_id: {
    label: 'NERIS ID',
    hint: 'Assigned by NERIS after the entity is submitted. Read-only. Format: FD########S###U###',
    required: false,
    type: 'readonly',
  },
};
