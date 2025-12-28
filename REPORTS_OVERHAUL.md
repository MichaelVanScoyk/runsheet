# Reports Overhaul - Deployment Notes
Date: December 28, 2025

## Changes Made

### 1. Backend - Chiefs Report Fields (incidents.py)
- Added to IncidentUpdate schema:
  - `property_value_at_risk` (int, cents)
  - `fire_damages_estimate` (int, cents)
  - `ff_injuries_count` (int)
  - `civilian_injuries_count` (int)

### 2. Backend - Reports Router (reports.py)
- Fixed `/pdf/monthly` endpoint to accept `category` parameter
- PDF title now shows category (FIRE/EMS)

### 3. Frontend - RunSheetContext.jsx
- Added chiefs report fields to `initialFormData`
- Added fields to incident loading section

### 4. Frontend - DamageAssessment.jsx
- Updated with proper Tailwind CSS styling
- Currency inputs with $ prefix
- 4-column responsive grid layout

### 5. Frontend - ReportsPage.jsx (Complete Rewrite)
- AI-powered natural language query bar
- Quick query buttons for common reports
- Tabbed interface: Chiefs Report, Overview, Personnel, Units, Custom Query
- Fire/EMS category toggle
- Clean dark theme matching rest of app
- Fixed the category filter bug (was missing on initial load)

## Database Migration Required

Run this SQL on the server:

```sql
-- Migration: Chiefs Report Fields
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS property_value_at_risk BIGINT DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS fire_damages_estimate BIGINT DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ff_injuries_count INTEGER DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS civilian_injuries_count INTEGER DEFAULT 0;
```

## Deployment Steps

1. **Run database migration:**
   ```bash
   cd /opt/runsheet
   psql -U runsheet -d runsheet -f backend/migrations/010_chiefs_report_fields.sql
   ```

2. **Deploy backend:**
   ```bash
   cd /opt/runsheet && git pull && ./restart.sh
   ```

3. **Deploy frontend:**
   ```bash
   cd /opt/runsheet/frontend && npm run build
   ```

## What's New in Reports

### AI Query Bar
Type natural language queries like:
- "Show me fire calls for November 2025"
- "Who ran the most calls this year?"
- "Auto accidents last 90 days"

### Quick Buttons
Pre-built queries for common reports

### Fixed Issues
- Category filter now properly applied on page load
- PDF generation includes category in title
