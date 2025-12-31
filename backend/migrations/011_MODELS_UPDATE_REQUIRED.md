# Models.py Update Required - Complete Tactic Timestamps

## Overview

Migration 011 adds many new timestamp columns to the `incidents` table.
You must also add these columns to `models.py` for SQLAlchemy.

## Columns to Add

Add these after the existing `time_extrication_complete` column (around line 305):

```python
    # =========================================================================
    # ADDITIONAL NERIS TACTIC TIMESTAMPS
    # Added in migration 011 for complete NERIS mod_tactic_timestamps coverage
    # =========================================================================
    
    # Search Operations
    time_secondary_search_begin = Column(TIMESTAMP(timezone=True))
    time_secondary_search_complete = Column(TIMESTAMP(timezone=True))
    
    # Ventilation
    time_ventilation_start = Column(TIMESTAMP(timezone=True))
    time_ventilation_complete = Column(TIMESTAMP(timezone=True))
    
    # Overhaul
    time_overhaul_start = Column(TIMESTAMP(timezone=True))
    time_overhaul_complete = Column(TIMESTAMP(timezone=True))
    
    # Safety/RIT
    time_rit_activated = Column(TIMESTAMP(timezone=True))
    time_mayday_declared = Column(TIMESTAMP(timezone=True))
    time_mayday_cleared = Column(TIMESTAMP(timezone=True))
    
    # Rescue/Extrication
    time_extrication_start = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # NERIS EMS TACTIC TIMESTAMPS
    # For medical incident reporting
    # =========================================================================
    time_patient_contact = Column(TIMESTAMP(timezone=True))
    time_patient_assessment_complete = Column(TIMESTAMP(timezone=True))
    time_cpr_started = Column(TIMESTAMP(timezone=True))
    time_aed_applied = Column(TIMESTAMP(timezone=True))
    time_aed_shock_delivered = Column(TIMESTAMP(timezone=True))
    time_rosc_achieved = Column(TIMESTAMP(timezone=True))
    time_airway_secured = Column(TIMESTAMP(timezone=True))
    time_iv_access = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # OPERATIONAL TIMESTAMPS (Chester County / Local)
    # Not direct NERIS fields, but useful for local operations
    # =========================================================================
    time_par_started = Column(TIMESTAMP(timezone=True))
    time_par_complete = Column(TIMESTAMP(timezone=True))
    time_evac_ordered = Column(TIMESTAMP(timezone=True))
    time_water_supply_established = Column(TIMESTAMP(timezone=True))
    time_all_clear = Column(TIMESTAMP(timezone=True))
    time_loss_stop = Column(TIMESTAMP(timezone=True))
    time_utilities_secured = Column(TIMESTAMP(timezone=True))
    time_rehab_established = Column(TIMESTAMP(timezone=True))
    time_investigation_requested = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # HAZMAT TIMESTAMPS (NERIS)
    # =========================================================================
    time_hazmat_identified = Column(TIMESTAMP(timezone=True))
    time_hazmat_contained = Column(TIMESTAMP(timezone=True))
    time_decon_started = Column(TIMESTAMP(timezone=True))
    time_decon_complete = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # TECHNICAL RESCUE TIMESTAMPS (NERIS)
    # =========================================================================
    time_victim_located = Column(TIMESTAMP(timezone=True))
    time_victim_accessed = Column(TIMESTAMP(timezone=True))
    time_victim_freed = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # WILDLAND FIRE TIMESTAMPS (NERIS)
    # =========================================================================
    time_wildland_contained = Column(TIMESTAMP(timezone=True))
    time_wildland_controlled = Column(TIMESTAMP(timezone=True))
    time_wildland_mopup_complete = Column(TIMESTAMP(timezone=True))
    
    # =========================================================================
    # PARSED CAD EVENT COMMENTS
    # =========================================================================
    cad_event_comments = Column(JSONB, default={})
    # Structure: see migration 011 for full schema
```

## Total New Columns

| Category | Count | Fields |
|----------|-------|--------|
| NERIS Fire Ops | 8 | secondary search (2), ventilation (2), overhaul (2), extrication start, RIT |
| NERIS Safety | 2 | mayday declared/cleared |
| NERIS EMS | 8 | patient contact, CPR, AED (3), ROSC, airway, IV |
| Chester County Ops | 9 | PAR (2), evac, water supply, all clear, loss stop, utilities, rehab, investigation |
| NERIS HazMat | 4 | identified, contained, decon (2) |
| NERIS Rescue | 3 | victim located/accessed/freed |
| NERIS Wildland | 3 | contained, controlled, mopup |
| JSONB Storage | 1 | cad_event_comments |

**Total: 38 new columns**

## Why So Many Buckets?

The goal is to have ALL possible NERIS timestamp fields available so that:

1. CAD parser can detect and SUGGEST mappings
2. Officers can confirm/override in RunSheet form
3. Data is ready for NERIS API export without transformation
4. Chester County-specific fields track local operational practices
5. Future incidents with different tactics have buckets ready

Most of these will be NULL for most incidents - they're buckets for when needed.
