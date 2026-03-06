# NERIS Entity Field Reference

**Source:** `core_mod_entity_fd.csv` — `ulfsri/neris-framework` GitHub repository  
**Retrieved:** 2026-03-05  
**Spec version:** API v1.4.35 (`api.neris.fsri.org/v1/openapi.json`)  
**Do not edit definitions** — update from source CSV when NERIS publishes schema updates.

---

## Section 1 — Identification

| Field (API name) | Label | Required | Definition | Example |
|------------------|-------|----------|------------|---------|
| `fd_neris_id` | NERIS Department ID | Yes | Unique identifier assigned by NERIS. Format: two-letter entity type + state/county FIPS + random trailing characters. | `FD42029593` |
| `fd_id_legacy` → `internal_id` | Internal / Legacy ID | No | Legacy FDID for linkage to historical datasets (NFIRS, state systems). | `51001` |
| `fd_name` → `name` | Department Name | Yes | Name of the agency. | `Fairfax County Fire Rescue` |
| `time_zone` | Time Zone | Yes (API) | IANA timezone identifier for the agency's location. | `America/New_York` |
| `fips_code` | FIPS Code | No | Federal FIPS geographic code for the agency's headquarters location. Used in NERIS ID construction. | `42029` |

---

## Section 2 — Physical Address

| Field (API name) | Label | Required | Definition | Example |
|------------------|-------|----------|------------|---------|
| `address_line_1` | Street Address | Yes | Physical address of agency headquarters. | `1234 Market St` |
| `address_line_2` | Suite / Apt | No | Additional address information. | `Suite 100` |
| `city` | City | Yes | City in which agency is located. | `Baltimore` |
| `state` | State | Yes | State in which agency is located. Two-letter abbreviation. | `MD` |
| `zip_code` | ZIP | Yes | ZIP code in which agency is located. | `21230` |
| `location` | Lat / Lng | No | WGS84 coordinates of the agency headquarters. If not submitted, NERIS may geocode from address. | `38.927036, -77.032742` |

### Mailing Address (optional — separate from physical)

| Field (API name) | Label | Definition |
|------------------|-------|------------|
| `mail_address_line_1` | Mailing Street | Agency mailing address if different from physical. |
| `mail_address_line_2` | Mailing Suite | Additional mailing address information. |
| `mail_city` | Mailing City | City of agency mailing address. |
| `mail_state` | Mailing State | State of agency mailing address. |
| `mail_zip_code` | Mailing ZIP | ZIP code of agency mailing address. |

---

## Section 3 — Contact

| Field (API name) | Label | Required | Definition |
|------------------|-------|----------|------------|
| `email` | Email | No | Contact email of the agency. |
| `website` | Website | No | Website URL of the agency. |

*Note: `fd_telephone` exists in the framework CSV but is not in the API payload spec. Not submitted to NERIS.*

---

## Section 4 — Classification

| Field (API name) | Label | Required | Definition | Choices |
|------------------|-------|----------|------------|---------|
| `department_type` | Department Type | No | Staffing type of the agency. | `CAREER`, `COMBINATION`, `VOLUNTEER` |
| `entity_type` | Entity Type | No | Legal/organizational category of the agency. | `CONTRACT`, `FEDERAL`, `LOCAL`, `OTHER`, `PRIVATE`, `STATE`, `TRANSPORTATION`, `TRIBAL` |
| `rms_software` | RMS Software | No | Manufacturer/name of the Records Management System used. Use "None" if no RMS. | `FirstOnScene` |
| `continue_edu` | Continuing Education | No | Whether the agency has a continuing education or training policy in place. | Boolean |

---

## Section 5 — Services Provided

### Fire Services (`fire_services` — `TypeServFdValue`)

| Value | Description |
|-------|-------------|
| `STRUCTURAL_FIREFIGHTING` | Structural firefighting operations |
| `WILDLAND_FIREFIGHTING` | Wildland firefighting operations |
| `ARFF_FIREFIGHTING` | Aircraft rescue and firefighting |
| `MARINE_FIREFIGHTING` | Marine/watercraft firefighting |
| `PETROCHEM_FIREFIGHTING` | Petrochemical firefighting |
| `HIGHRISE_FIREFIGHTING` | High-rise firefighting operations |
| `HAZMAT_OPS` | HazMat at the Operations level |
| `HAZMAT_TECHNICIAN` | HazMat at the Technician level |
| `VEHICLE_RESCUE` | Vehicle extrication and rescue |
| `ROPE_RESCUE` | Rope rescue operations |
| `TRENCH_RESCUE` | Trench rescue operations |
| `CONFINED_SPACE` | Confined space rescue |
| `COLLAPSE_RESCUE` | Structural collapse rescue |
| `MACHINERY_RESCUE` | Machinery/industrial rescue |
| `WATERCRAFT_RESCUE` | Watercraft rescue |
| `ANIMAL_TECHRESCUE` | Animal technical rescue |
| `ICE_RESCUE` | Ice rescue |
| `SURF_RESCUE` | Surf/open water rescue |
| `SWIFTWATER_SAR` | Swift water search and rescue |
| `WATER_SAR` | Water search and rescue |
| `FLOOD_SAR` | Flood search and rescue |
| `DIVE_SAR` | Dive search and rescue |
| `WILDERNESS_SAR` | Wilderness search and rescue |
| `CAVE_SAR` | Cave search and rescue |
| `MINE_SAR` | Mine search and rescue |
| `TOWER_SAR` | Tower/high angle search and rescue |
| `HELO_SAR` | Helicopter search and rescue |
| `REHABILITATION` | Incident rehabilitation services |
| `CAUSE_ORIGIN` | Fire cause and origin investigation |
| `RRD_EXISTING` | Risk reduction — existing structures inspection |
| `RRD_NEWCONST` | Risk reduction — new construction inspection |
| `RRD_PLANS` | Risk reduction — plans review |
| `RRD_PUBLICED` | Risk reduction — public education |
| `TRAINING_DRIVER` | Driver/operator training program |
| `TRAINING_ELF` | Entry-level firefighter training |
| `TRAINING_OD` | Officer development training |
| `TRAINING_VETFF` | Veteran firefighter training |

### EMS Services (`ems_services` — `TypeServEmsValue`)

| Value | Description |
|-------|-------------|
| `ALS_TRANSPORT` | Advanced Life Support with transport |
| `ALS_NO_TRANSPORT` | ALS without transport capability |
| `BLS_TRANSPORT` | Basic Life Support with transport |
| `BLS_NO_TRANSPORT` | BLS without transport capability |
| `AERO_TRANSPORT` | Aeromedical transport |
| `COMMUNITY_MED` | Community medicine / mobile integrated healthcare |
| `NO_MEDICAL` | No medical services provided |

### Investigation Services (`investigation_services` — `TypeServInvestValue`)

| Value | Description |
|-------|-------------|
| `COMPANY_LEVEL` | Company-level fire investigation capability |
| `DEDICATED` | Dedicated investigation unit |
| `K9_DETECT` | K9 accelerant detection |
| `LAW_ENFORCEMENT` | Law enforcement investigation authority |
| `YOUTH_FIRESETTER` | Youth firesetter intervention program |

---

## Section 6 — Dispatch / PSAP

| Field (API name) | Label | Required | Definition | Choices / Notes |
|------------------|-------|----------|------------|-----------------|
| `dispatch.center_id` | PSAP Center ID | No | 4-digit unique identifier for each PSAP dispatch center that dispatches this agency. | e.g. `4311` |
| `dispatch.cad_software` | CAD Software | No | Manufacturer/name of the CAD system used by the agency. Use "None" if no CAD. | e.g. `Motorola` |
| `dispatch.avl_usage` | AVL Usage | No | Whether the CAD system uses Automatic Vehicle Location technology. | Boolean |
| `dispatch.psap_type` | PSAP Type | No | Whether the dispatch center is a primary or secondary PSAP. **PRIMARY** = answers initial 9-1-1 calls. **SECONDARY** = receives calls transferred from a primary PSAP due to jurisdictional sequencing or discipline-specific dispatching. | `PRIMARY`, `SECONDARY` |
| `dispatch.psap_capability` | PSAP Capability | No | Whether the PSAP meets current NENA NG9-1-1 standards. **LEGACY** = cannot process IP-based calls, uses CAMA/ISDN trunk technology. **NG911** = can process calls per NENA i3 specification. | `LEGACY`, `NG911` |
| `dispatch.psap_discipline` | PSAP Discipline | No | Whether the dispatch center handles one or multiple public safety disciplines. **SINGLE** = operates one discipline (fire, EMS, or police). **MULTIPLE** = operates multiple disciplines (e.g. fire-EMS-police). | `SINGLE`, `MULTIPLE` |
| `dispatch.psap_jurisdiction` | PSAP Jurisdiction | No | Whether one or multiple political entities share this PSAP. **SINGLE** = only one political entity (city/county) uses the 9-1-1 and dispatching services. **MULTIPLE** = one or more jurisdictions operate as a single 9-1-1 entity. | `SINGLE`, `MULTIPLE` |
| `dispatch.protocol_fire` | Fire Dispatch Protocol | No | Procedure/protocol followed for triage of emergency fire calls. | `APCO`, `IAED`, `PROQA`, `OTHER` |
| `dispatch.protocol_med` | Medical Dispatch Protocol | No | Procedure/protocol followed for triage of emergency medical calls. | `APCO`, `IAED`, `PROQA`, `OTHER` |

---

## Section 7 — Staffing

All counts reflect **active** personnel only. `staff_total` is computed automatically by NERIS as the sum of the nine fields below — do not submit it.

| Field (API name) | Label | Definition |
|------------------|-------|------------|
| `staffing.active_firefighters_career_ft` | FF Career FT | Total active full-time career firefighters |
| `staffing.active_firefighters_career_pt` | FF Career PT | Total active part-time career firefighters |
| `staffing.active_firefighters_volunteer` | FF Volunteer | Total active volunteer firefighters |
| `staffing.active_ems_only_career_ft` | EMS Only Career FT | Total active full-time career EMS-only staff (not cross-trained as FF) |
| `staffing.active_ems_only_career_pt` | EMS Only Career PT | Total active part-time career EMS-only staff |
| `staffing.active_ems_only_volunteer` | EMS Only Volunteer | Total active volunteer EMS-only staff |
| `staffing.active_civilians_career_ft` | Civilians Career FT | Total active full-time career civilian staff |
| `staffing.active_civilians_career_pt` | Civilians Career PT | Total active part-time career civilian staff |
| `staffing.active_civilians_volunteer` | Civilians Volunteer | Total active volunteer civilian staff |

---

## Section 8 — Assessment

| Field (API name) | Label | Required | Definition |
|------------------|-------|----------|------------|
| `assessment.iso_rating` | ISO Rating | No | Current ISO Public Protection Classification (PPC) rating, 1–10, if applicable. 1 = best, 10 = unprotected. |
| `assessment.cpse_accredited` | CPSE Accredited | No | Whether the agency holds accreditation through the Commission on Fire Accreditation International (CPSE/CFAI). |
| `assessment.caas_accredited` | CAAS Accredited | No | Whether the agency holds accreditation through the Commission on Accreditation of Ambulance Services (CAAS). |

---

## Section 9 — Stations

| Field (API name) | Label | Required | Definition | Notes |
|------------------|-------|----------|------------|-------|
| `station_id` | Station ID | Yes | Identifier for the station within NERIS. Format in the system: agency NERIS ID + `S` + 3-digit number (e.g. `FD42029593S001`). Enter just the 3-digit number or your local station ID. | Required by NERIS |
| `internal_id` | Internal ID | No | Agency's own internal identifier for this station. | Local reference only |
| `station_name` | Station Name | No | Human-readable name of the station. Not submitted to NERIS — local display only. | CADReport only |
| `address_line_1` | Address | Yes | Physical street address of the station building. | |
| `city` | City | Yes | City in which the station is located. | |
| `state` | State | Yes | State in which the station is located. | |
| `zip_code` | ZIP | Yes | ZIP code in which the station is located. | |
| `location` | Lat / Lng | No | WGS84 coordinates of the station. If not submitted, NERIS will attempt to geocode from the address. | |
| `staffing` | Min. Staffing | No | Minimum staffing assigned to the station. Note: this is separate from unit staffing because a station can cross-staff multiple units. | |

---

## Section 9 — Units (within each Station)

| Field (API name) | Label | Required | Definition | Notes |
|------------------|-------|----------|------------|-------|
| `cad_designation_1` | CAD ID | Yes (if dept has CAD) | The unit's primary designation exactly as it appears in the CAD system. This is how NERIS links dispatch data to entity units. | Must match CAD exactly |
| `cad_designation_2` | Alt CAD ID | No | The unit's secondary CAD designation. Used when a unit carries both a municipal and a county ID in CAD. | Optional |
| `type` | Unit Type | No | Type of unit. See TypeUnitValue table below. | |
| `staffing` | Min. Staffing | Yes | Minimum staffing required for this unit to be dispatched to an incident. | |
| `dedicated_staffing` | Dedicated | No | Whether this unit has dedicated staffing. Can only be true if staffing > 0. | |
| `neris_id` | NERIS ID | — | Assigned by NERIS after entity submission. Read-only — not entered by user. | Pattern: `FD########S###U###` |

### Unit Types (`type` — `TypeUnitValue`)

| Value | Label |
|-------|-------|
| `ENGINE_STRUCT` | Engine (Structural) |
| `ENGINE_WUI` | Engine (WUI / Wildland-Urban Interface) |
| `LADDER_QUINT` | Ladder / Quint |
| `LADDER_TALL` | Ladder (Tall) |
| `LADDER_SMALL` | Ladder (Small) |
| `LADDER_TILLER` | Ladder (Tiller) |
| `PLATFORM` | Platform |
| `PLATFORM_QUINT` | Platform Quint |
| `QUINT_TALL` | Quint (Tall) |
| `RESCUE_HEAVY` | Rescue (Heavy) |
| `RESCUE_MEDIUM` | Rescue (Medium) |
| `RESCUE_LIGHT` | Rescue (Light) |
| `RESCUE_USAR` | Rescue (USAR) |
| `RESCUE_WATER` | Rescue (Water) |
| `ALS_AMB` | ALS Ambulance |
| `BLS_AMB` | BLS Ambulance |
| `EMS_NOTRANS` | EMS (No Transport) |
| `EMS_SUPV` | EMS Supervisor |
| `TENDER` | Tender |
| `FOAM` | Foam Unit |
| `HAZMAT` | HazMat |
| `DECON` | Decon |
| `INVEST` | Investigation |
| `CHIEF_STAFF_COMMAND` | Chief / Staff / Command |
| `MOBILE_COMMS` | Mobile Communications |
| `MOBILE_ICP` | Mobile ICP |
| `REHAB` | Rehab |
| `SCBA` | SCBA |
| `MAB` | MAB |
| `BOAT` | Boat |
| `BOAT_LARGE` | Boat (Large) |
| `HELO_FIRE` | Helicopter (Fire) |
| `HELO_GENERAL` | Helicopter (General) |
| `HELO_RESCUE` | Helicopter (Rescue) |
| `AIR_EMS` | Air EMS |
| `AIR_TANKER` | Air Tanker |
| `AIR_LIGHT` | Air Light |
| `AIR_RECON` | Air Recon |
| `ARFF` | ARFF |
| `CREW` | Crew |
| `CREW_TRANS` | Crew Transport |
| `DOZER` | Dozer |
| `ATV_FIRE` | ATV (Fire) |
| `ATV_EMS` | ATV (EMS) |
| `UAS_FIRE` | UAS (Fire) |
| `UAS_RECON` | UAS (Recon) |
| `POV` | POV |
| `OTHER_GROUND` | Other Ground |
| `UTIL` | Utility |

---

## Shift (optional — career/combination departments)

| Field (API name) | Label | Required | Definition | Notes |
|------------------|-------|----------|------------|-------|
| `shift.count` | Shift Count | If career/combo | Number of shifts the agency utilizes. | e.g. `3` |
| `shift.duration` | Shift Duration (hrs) | If career/combo | Duration of each shift in hours. | e.g. `24` |
| `shift.signup` | Current Shift | If career/combo | Current shift schedule number upon NERIS activation. Used to sync schedule for shift-based data filtering. | e.g. `3` |

---

## Not in API Payload (framework only)

These fields appear in the framework CSV but are not in `DepartmentPayload` in the API spec. Do not submit.

- `fd_telephone` — contact phone number
- `staff_total` — computed by NERIS from the 9 staffing fields
- `fd_parent_name`, `fd_child_name`, `fd_aid_name`, `fd_aid_type` — relationship fields managed by NERIS
- `fd_jurisdiction_set`, `fd_primary_division_set`, `fd_coverage_set` — GIS polygon fields
- `fd_population_protected`, `fd_population_protected_source` — population fields (not yet in API)
