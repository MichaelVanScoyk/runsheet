# ComCat: CAD Comment Categorizer with ML Learning

## Overview

This document describes the implementation of an intelligent comment categorization system for CAD event comments. The system uses pattern matching as a seed for machine learning, with officer corrections as continuous training data.

## Implementation Status

### ✅ Phase 1: Foundation (COMPLETE)
- [x] `cad/comcat_seeds.py` - 200+ seed examples across 5 categories
- [x] `cad/comcat_model.py` - Random Forest with TF-IDF pipeline
- [x] `cad/comment_processor.py` - Updated with ML integration (v2.0)
- [x] `cad/__init__.py` - Package initialization
- [x] `cad/cad_requirements.txt` - Updated with scikit-learn
- [x] `cad/backfill_event_comments.py` - Added --force and --no-ml flags

### ✅ Phase 2: API Endpoints (COMPLETE)
- [x] `backend/routers/comcat.py` - Full API router
- [x] GET `/api/comcat/categories` - Get available categories with metadata
- [x] GET `/api/comcat/comments/{incident_id}` - Get comments with categories
- [x] PUT `/api/comcat/comments/{incident_id}` - Update categories (officer corrections)
- [x] GET `/api/comcat/review/{incident_id}` - Get low-confidence comments
- [x] POST `/api/comcat/retrain` - Trigger model retraining
- [x] GET `/api/comcat/stats` - Training statistics
- [x] GET `/api/comcat/grouped/{incident_id}` - Comments grouped by category
- [x] POST `/api/comcat/predict` - Test single prediction
- [x] Registered in `backend/main.py`

### ✅ Phase 3: Frontend UI (COMPLETE)
- [x] `frontend/src/components/RunSheet/modals/ComCatModal.jsx` - Review/edit modal
- [x] "Comments" button in ActionBar (shows when event comments exist)
- [x] Category dropdowns with color-coded styling
- [x] Confidence indicators (ML %, Pattern, Officer ✓)
- [x] Filter toggle for "needs review" comments
- [x] Training stats display
- [x] Retrain button
- [x] Updated context, modals index, and RunSheet index

### 🔲 Phase 4: Automation (TODO)
- [ ] Scheduled retraining cron job
- [ ] Confidence threshold configuration in settings

---

## API Endpoints

### GET /api/comcat/categories
Returns available categories with labels, colors, and descriptions.

### GET /api/comcat/comments/{incident_id}
Returns all comments for an incident with:
- Current category and source (PATTERN/ML/OFFICER)
- Confidence score for ML predictions
- `needs_review` flag for low-confidence items

### PUT /api/comcat/comments/{incident_id}
Updates comment categories. Request body:
```json
{
  "updates": [
    {"index": 0, "category": "TACTICAL"},
    {"index": 5, "category": "OPERATIONS"}
  ],
  "edited_by": 123  // Personnel ID (optional)
}
```

### POST /api/comcat/retrain
Retrains ML model with all PATTERN and OFFICER data.

### GET /api/comcat/stats
Returns ML model training statistics.

---

## Frontend UI

### ComCatModal Features
- **Comments List**: Shows all non-noise comments with time, text, operator
- **Category Selector**: Color-coded dropdown per comment
- **Source Indicator**: Shows PATTERN (blue), ML % (amber if low), OFFICER ✓ (green)
- **Filter Toggle**: Show only comments needing review
- **Stats Bar**: ML availability, training examples, accuracy
- **Retrain Button**: Manual model retraining trigger
- **Save/Cancel**: Batch save all changes

### Button Location
The "Comments" button appears in the RunSheetForm ActionBar when:
- Incident has been saved (has ID)
- `cad_event_comments.comments` array has items

---

## Data Flow

```
CAD CLEAR arrives
    ↓
comment_processor.py categorizes
    ↓
Pattern match? → PATTERN source (no confidence)
    ↓ (no match)
ML model predicts → ML source + confidence
    ↓
Stored in incidents.cad_event_comments JSONB
    ↓
Officer opens ComCatModal
    ↓
Reviews ML predictions (esp. low confidence)
    ↓
Changes category dropdown
    ↓
Save → PUT /api/comcat/comments
    ↓
category_source = "OFFICER" (training data!)
    ↓
Periodic retrain includes OFFICER examples
    ↓
Model improves over time
```

---

## Deployment

### Server Installation
```bash
ssh dashboard@192.168.1.189
cd /opt/runsheet

# Install ML dependencies
./runsheet_env/bin/pip install scikit-learn numpy

# Test model (trains from seeds on first run)
./runsheet_env/bin/python -m cad.comcat_model

# Restart backend to load new router
./restart.sh

# Reprocess existing incidents with ML
./runsheet_env/bin/python -m cad.backfill_event_comments --force --verbose --dry-run
# If looks good:
./runsheet_env/bin/python -m cad.backfill_event_comments --force --verbose
```

### Frontend Rebuild
```bash
cd /opt/runsheet/frontend
npm run build
# nginx serves from dist/ directory
```

---

## File Summary

### Backend
| File | Purpose |
|------|---------|
| `cad/comcat_seeds.py` | 200+ seed training examples |
| `cad/comcat_model.py` | Random Forest + TF-IDF ML pipeline |
| `cad/comment_processor.py` | v2.0 with ML integration |
| `cad/__init__.py` | Package exports |
| `cad/backfill_event_comments.py` | Batch reprocessing script |
| `backend/routers/comcat.py` | API endpoints |
| `backend/main.py` | Router registration |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/.../modals/ComCatModal.jsx` | Main modal component |
| `frontend/.../modals/index.js` | Modal exports |
| `frontend/.../sections/ActionBar.jsx` | "Comments" button |
| `frontend/.../RunSheetContext.jsx` | Modal state |
| `frontend/.../index.jsx` | Modal inclusion |

---

## NERIS Alignment

Comment categories support NERIS reporting workflows:

| Category | NERIS Use |
|----------|-----------|
| **CALLER** | `incident_narrative_outcome`, initial conditions |
| **TACTICAL** | `mod_tactic_timestamps` - critical benchmarks |
| **OPERATIONS** | Informs `neris_action_codes` selection |
| **UNIT** | `mod_unit_response` crew counts |
| **OTHER** | Review for potential reclassification |

---

## Testing Checklist

- [ ] Deploy backend changes and restart
- [ ] Install scikit-learn on server
- [ ] Run `python -m cad.comcat_model` to verify ML works
- [ ] Rebuild frontend
- [ ] Open incident with CAD data
- [ ] Verify "Comments" button appears
- [ ] Open ComCatModal
- [ ] Check comments display with categories
- [ ] Change a category dropdown
- [ ] Verify "unsaved changes" indicator
- [ ] Save changes
- [ ] Verify category_source changed to OFFICER
- [ ] Test retrain button
- [ ] Run backfill with --force on test incident
