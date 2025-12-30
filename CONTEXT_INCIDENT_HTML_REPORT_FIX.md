# Context: Incident HTML/PDF Report Fix

## Problem
The backend HTML report (`get_incident_html_report` in `backend/routers/reports.py`) was not showing:
1. Personnel table (completely missing)
2. Branding colors (green #016a2b, yellow #eeee01)
3. Proper layout (text overlapping)

## Root Cause
The code tried to read `personnel_assignments` as a column on the incidents table:
```python
personnel_assignments = inc.get('personnel_assignments', {}) or {}  # WRONG
```

But `personnel_assignments` is NOT a database column. It's built dynamically by querying:
- `incident_units` table
- `incident_personnel` table

## Fix Applied
Replaced the broken code with queries that match `get_incident()` in `incidents.py` (lines ~585-630):

```python
unit_rows = db.execute(text("""
    SELECT iu.id, iu.apparatus_id, a.unit_designator, a.is_virtual
    FROM incident_units iu
    JOIN apparatus a ON iu.apparatus_id = a.id
    WHERE iu.incident_id = :incident_id
"""), {"incident_id": incident_id}).fetchall()

for unit_row in unit_rows:
    pers_rows = db.execute(text("""
        SELECT personnel_id, slot_index
        FROM incident_personnel
        WHERE incident_unit_id = :unit_id
        ORDER BY slot_index
    """), {"unit_id": unit_id}).fetchall()
    # ... build slots array
```

## Files
- **Backend function**: `backend/routers/reports.py` → `get_incident_html_report()` (around line 1365)
- **PDF endpoint**: Same file → `get_incident_pdf()` - calls HTML function then converts via WeasyPrint
- **Frontend reference**: `frontend/src/components/PrintView/index.jsx` - shows correct structure
- **Working example**: `backend/routers/incidents.py` → `get_incident()` (lines ~585-630) - how personnel_assignments is built

## Endpoints
- HTML: `GET /api/reports/html/incident/{id}`
- PDF: `GET /api/reports/pdf/incident/{id}`

## Branding Colors (from database)
```sql
SELECT key, value FROM settings WHERE category = 'branding';
-- primary_color: #016a2b (green)
-- secondary_color: #eeee01 (yellow)
```

## Deploy
```bash
cd /opt/runsheet && git pull && ./restart.sh
```

## Status
Fix was applied to local `reports.py`. Needs commit, push, and deploy to test.
