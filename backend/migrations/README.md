# Unit Category Migration

This migration adds the unified unit management system with categories:
- **APPARATUS** - Fire trucks, engines, ladders (counts for response times by default)
- **COMMAND** - Chief cars, command vehicles (tracked but doesn't count for response times)
- **DIRECT** - Virtual unit for personnel going directly to scene in POV
- **STANDBY** - Virtual unit for station coverage personnel

## Files

| File | Purpose |
|------|---------|
| `001_unit_category_backup.sql` | Creates backup tables before migration |
| `002_unit_category_migrate.sql` | Adds columns, migrates data, imports from station_units |
| `003_unit_category_rollback.sql` | Restores to pre-migration state if needed |

## How to Run

### 1. Create Backup (REQUIRED FIRST)
```bash
psql -d runsheet_db -f 001_unit_category_backup.sql
```

### 2. Run Migration
```bash
psql -d runsheet_db -f 002_unit_category_migrate.sql
```

### 3. If Rollback Needed
```bash
psql -d runsheet_db -f 003_unit_category_rollback.sql
```

## What Changes

### Database: `apparatus` table
New columns added:
- `unit_category` (VARCHAR 20) - APPARATUS, COMMAND, DIRECT, STANDBY
- `counts_for_response_times` (BOOLEAN) - Whether to include in "first enroute/on scene"
- `cad_unit_id` (VARCHAR 20) - CAD identifier for matching incoming data

### Frontend
- Admin > Units tab now shows units grouped by category
- Personnel Grid uses category to determine slot behavior
- Virtual Units section uses category to identify DIRECT/STANDBY

### CAD Listener
- `settings_helper.get_unit_info()` now queries apparatus table
- Falls back to station_units setting for backward compatibility
- Respects `counts_for_response_times` flag for metrics

## Verification

After migration, verify:
```sql
SELECT 
    unit_designator, name, unit_category, 
    counts_for_response_times, cad_unit_id 
FROM apparatus 
ORDER BY unit_category, display_order;
```

Expected categories:
- Real trucks (ENG481, TWR48, etc.) → APPARATUS
- Chief cars (CHF48, ASST48, etc.) → COMMAND  
- Virtual units (Direct, Station) → DIRECT or STANDBY
