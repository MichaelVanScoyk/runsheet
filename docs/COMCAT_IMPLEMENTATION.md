# ComCat: CAD Comment Categorizer v2.0

## Overview

ComCat is an ML-based system for categorizing CAD event comments. It learns from officer corrections to improve over time.

**Key Principle (v2.0):** Pure ML classification - no hardcoded pattern rules. The model learns from text content AND who entered the comment (operator_type: calltaker, dispatcher, unit).

## Architecture

### Data Flow
```
CAD CLEAR arrives
    ↓
comment_processor.py extracts comments
    ↓
ML model predicts category using (text, operator_type)
    ↓
Stored in incidents.cad_event_comments JSONB
    ↓
Officer opens ComCatModal, reviews comments
    ↓
Clicks "Mark Reviewed" (with or without corrections)
    ↓
officer_reviewed_at timestamp set
    ↓
Corrections become training data (source = "OFFICER")
    ↓
Admin runs Retrain → model improves
```

### Status Flow
```
No comments     → (no dot)
Has comments    → gray dot (pending)
Mark Reviewed   → green dot (validated)  
After Retrain   → purple dot (trained)
```

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `cad/comcat_seeds.py` | ~275 seed examples as (text, operator_type, category) |
| `cad/comcat_model.py` | Random Forest + TF-IDF + operator one-hot encoding |
| `cad/comment_processor.py` | Extracts comments, calls ML for categorization |
| `backend/routers/comcat.py` | API endpoints for viewing/editing/retraining |
| `backend/routers/incidents.py` | `get_comments_validation_status()` function |

### Frontend
| File | Purpose |
|------|---------|
| `modals/ComCatModal.jsx` | Review modal with category dropdowns |
| `sections/ActionBar.jsx` | "Comments" button with status dot |
| `pages/IncidentsPage.jsx` | Status dot in incident list |
| `pages/AdminPage.jsx` | ComCat ML tab for retraining |

## Categories

| Category | Description | Color |
|----------|-------------|-------|
| CALLER | Caller information, complaint details | Blue |
| TACTICAL | Command decisions, fire ground ops | Red |
| OPERATIONS | Resource coordination, assignments | Amber |
| UNIT | Unit status updates (enroute, arrived) | Green |
| OTHER | Uncategorized/misc | Gray |

## Operator Types

The model uses operator_type as a feature to learn context:

| Pattern | Type | Typical Content |
|---------|------|-----------------|
| `ct##` | CALLTAKER | Caller information |
| `fd##` | DISPATCHER | Resource/assignment info |
| `$UNIT` | UNIT | Unit status updates |
| System | SYSTEM | Automated messages |

## API Endpoints

### GET /api/comcat/comments/{incident_id}
Returns comments with categories, sources, confidence, and review status.

Response includes:
- `officer_reviewed_at` - timestamp of last review
- `officer_reviewed_by_name` - who reviewed

### PUT /api/comcat/comments/{incident_id}
Save corrections. Even with no changes, sets `officer_reviewed_at`.

```json
{
  "updates": [{"index": 0, "category": "TACTICAL"}],
  "edited_by": 123
}
```

### POST /api/comcat/retrain
Retrains model with seeds + all OFFICER corrections.

### GET /api/comcat/stats
Returns model stats (accuracy, training counts).

## Status Logic

**Important:** Status is based on `officer_reviewed_at` timestamp, NOT on whether every individual comment was changed.

```python
# backend/routers/incidents.py
def get_comments_validation_status(cad_event_comments, model_trained_at):
    if not officer_reviewed_at:
        return "pending"      # Gray - needs review
    if model_trained_at > officer_reviewed_at:
        return "trained"      # Purple - in model
    return "validated"        # Green - reviewed
```

## ML Model Details

### Features (v2)
- TF-IDF on comment text (n-grams 1-2)
- One-hot encoded operator_type (5 values)
- Combined via sparse matrix hstack

### Training
- Seeds: ~275 examples with operator context
- Officer corrections: Added incrementally
- Cross-validation accuracy: ~63%

### Model File
- Location: `/opt/runsheet/data/comcat_model_v2.pkl`
- Auto-creates on first prediction if missing

## Audit Trail

All reviews logged to `audit_log` table:
- `COMCAT_CORRECTION` - officer changed categories
- `COMCAT_REVIEWED` - officer marked reviewed (no changes)

The audit log is the authoritative record for who/when.

## Deployment

```bash
# After code changes
cd /opt/runsheet && git pull && ./restart.sh

# Retrain model (from Admin UI or API)
curl -X POST https://yoursite/api/comcat/retrain

# Or via Python
./runsheet_env/bin/python -c "from cad.comcat_model import retrain_model; retrain_model([])"
```

## Troubleshooting

### Model not loading
```bash
./runsheet_env/bin/pip install scikit-learn numpy
./runsheet_env/bin/python -c "from cad.comcat_model import get_model; print(get_model().is_trained)"
```

### Status dots not matching
- Backend and frontend both use `officer_reviewed_at`
- Check `cad_event_comments` JSONB has the field
- Restart backend after code changes

### Low accuracy
- Need more officer corrections
- Seeds provide baseline, corrections improve it
- Retrain after batch corrections

## NERIS Alignment

| Category | NERIS Use |
|----------|-----------|
| CALLER | Incident narrative, initial conditions |
| TACTICAL | `mod_tactic_timestamps` benchmarks |
| OPERATIONS | `neris_action_codes` selection |
| UNIT | `mod_unit_response` crew counts |

---

*Last updated: December 31, 2025 - v2.0 pure ML with operator_type features*
