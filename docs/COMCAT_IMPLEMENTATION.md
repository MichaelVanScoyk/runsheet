# ComCat: CAD Comment Categorizer with ML Learning

## Overview

This document describes the implementation of an intelligent comment categorization system for CAD event comments. The system uses pattern matching as a seed for machine learning, with officer corrections as continuous training data.

## Problem Statement

CAD CLEAR reports contain event comments that document the incident timeline. These comments need to be categorized for display in PDF reports and UI. Categories include:

- **CALLER** - Dispatch/caller information ("HOUSE ON FIRE", "EVERYONE IS OUT")
- **TACTICAL** - Command decisions ("Command Established", "Fire Under Control", "PAR CHECK")
- **OPERATIONS** - Fireground operations ("HYDRANT", "WATER SUPPLY ESTABLISHED", "INTERIOR OPS")
- **UNIT** - Unit activity ("Enroute with a crew of 4")
- **OTHER** - Uncategorized

Current system bakes categorization at parse time, making pattern improvements require re-processing all incidents. We want dynamic categorization with ML that improves over time.

## Architecture Decision

**Single source of truth:** The `category` field in `cad_event_comments` JSONB is both:
1. The current display value (used by PDF renderer)
2. Training data (when set by PATTERN or OFFICER)

```json
{
  "comments": [
    {
      "time": "22:25:42",
      "operator": "ct08",
      "text": "HOUSE ON FIRE",
      "is_noise": false,
      "category": "CALLER",
      "category_source": "PATTERN",
      "category_confidence": null
    },
    {
      "time": "22:34:49",
      "operator": "fd12",
      "text": "PECO/CLIFFORD",
      "category": "OPERATIONS",
      "category_source": "ML",
      "category_confidence": 0.72
    }
  ],
  "detected_timestamps": [...],
  "unit_crew_counts": [...],
  "parsed_at": "...",
  "parser_version": "1.0"
}
```

### Category Source Values

| Source | Meaning | Used for Training |
|--------|---------|-------------------|
| `PATTERN` | Assigned by regex pattern matcher | ✓ Yes (seed data) |
| `OFFICER` | Manually set by officer in UI | ✓ Yes (highest quality) |
| `ML` | Predicted by ML model | ✗ No (would be circular) |

### Training Data Sources

1. **Pattern seeds** (~100 examples) - Existing patterns become initial training examples
2. **Officer corrections** - Every manual category change becomes training data
3. **Cross-incident learning** - Model learns from ALL incidents, not just current one

## Database Schema

### Current Structure (Already Exists)

```sql
-- incidents.cad_event_comments JSONB field exists from migration 011
-- Structure documented above
```

### No Additional Schema Needed

The `category_source` and `category_confidence` fields are added to the JSONB structure, not as separate columns.

## File Locations

### Existing Files to Modify

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `cad/comment_processor.py` | Parses and categorizes comments | Add `category_source`, extract seed patterns |
| `backend/report_engine/renderers.py` | PDF generation | Already reads `category` field - no changes |
| `frontend/src/components/RunSheetForm.jsx` | Main form | Add "Categorize Comments" button |

### New Files to Create

| File | Purpose |
|------|---------|
| `cad/comcat_model.py` | ML model training and prediction |
| `cad/comcat_seeds.py` | Pattern-based seed examples for initial training |
| `backend/routers/comcat.py` | API endpoints for categorization |
| `frontend/src/components/ComCatModal.jsx` | UI modal for reviewing/editing categories |

## ML Implementation

### Algorithm: Random Forest with TF-IDF

**Why Random Forest:**
- Works well with small datasets (100+ examples)
- Handles text classification effectively with TF-IDF
- Fast training and prediction
- Interpretable (can see feature importance)
- No GPU required

### Feature Engineering

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier

# Features to extract from comment text:
# 1. TF-IDF of words (unigrams and bigrams)
# 2. Presence of key indicator words
# 3. Operator type (ct=calltaker, fd=dispatcher, $=unit)
# 4. Time of day (early in incident vs late)
# 5. Comment length
```

### Model Pipeline

```python
# cad/comcat_model.py

from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
import pickle
from pathlib import Path

MODEL_PATH = Path("/opt/runsheet/data/comcat_model.pkl")

class ComCatModel:
    def __init__(self):
        self.pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(
                ngram_range=(1, 2),
                max_features=500,
                stop_words='english'
            )),
            ('clf', RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42
            ))
        ])
        self.is_trained = False
    
    def train(self, texts: list[str], categories: list[str]):
        """Train on all PATTERN and OFFICER categorized comments."""
        self.pipeline.fit(texts, categories)
        self.is_trained = True
        self.save()
    
    def predict(self, text: str) -> tuple[str, float]:
        """Predict category and confidence."""
        if not self.is_trained:
            return None, 0.0
        
        proba = self.pipeline.predict_proba([text])[0]
        category = self.pipeline.classes_[proba.argmax()]
        confidence = proba.max()
        return category, confidence
    
    def save(self):
        MODEL_PATH.parent.mkdir(exist_ok=True)
        with open(MODEL_PATH, 'wb') as f:
            pickle.dump(self.pipeline, f)
    
    def load(self):
        if MODEL_PATH.exists():
            with open(MODEL_PATH, 'rb') as f:
                self.pipeline = pickle.load(f)
            self.is_trained = True
```

### Seed Data Structure

```python
# cad/comcat_seeds.py

SEED_EXAMPLES = [
    # CALLER - Dispatch/caller information
    ("HOUSE ON FIRE", "CALLER"),
    ("FLAMES SHOWING", "CALLER"),
    ("SMOKE COMING FROM", "CALLER"),
    ("EVERYONE IS OUT", "CALLER"),
    ("OCCUPANTS EVACUATED", "CALLER"),
    ("CALLER STATES", "CALLER"),
    ("SMELL OF SMOKE", "CALLER"),
    ("FIRE ALARM SOUNDING", "CALLER"),
    ("UNKNOWN TYPE FIRE", "CALLER"),
    ("ELECTRICAL FIRE", "CALLER"),
    ("CHIMNEY FIRE", "CALLER"),
    ("PERSON TRAPPED", "CALLER"),
    ("DIFFICULTY BREATHING", "CALLER"),
    ("CHEST PAIN", "CALLER"),
    ("FALL VICTIM", "CALLER"),
    ("UNCONSCIOUS", "CALLER"),
    ("NOT BREATHING", "CALLER"),
    
    # TACTICAL - Command decisions
    ("Command Established", "TACTICAL"),
    ("COMMAND ESTABLISHED", "TACTICAL"),
    ("Fire Under Control", "TACTICAL"),
    ("FIRE UNDER CONTROL", "TACTICAL"),
    ("FUC", "TACTICAL"),
    ("PAR CHECK", "TACTICAL"),
    ("PAR COMPLETE", "TACTICAL"),
    ("PARS CHECK COMPLETE", "TACTICAL"),
    ("ALL CLEAR", "TACTICAL"),
    ("PRIMARY ALL CLEAR", "TACTICAL"),
    ("SECONDARY ALL CLEAR", "TACTICAL"),
    ("EVACUATE", "TACTICAL"),
    ("EVACUATION", "TACTICAL"),
    ("EVAC ORDERED", "TACTICAL"),
    ("Evac Ordered for set Fire Incident Command Times", "TACTICAL"),
    ("Accountability/Start PAR", "TACTICAL"),
    ("MAYDAY", "TACTICAL"),
    ("RIT ACTIVATED", "TACTICAL"),
    ("HOLDING AIR PAR CHECK", "TACTICAL"),
    ("LOSS STOP", "TACTICAL"),
    ("FIRE INVESTIGATION", "TACTICAL"),
    ("MARSHAL REQUESTED", "TACTICAL"),
    
    # OPERATIONS - Fireground operations
    ("HYDRANT", "OPERATIONS"),
    ("WATER SUPPLY", "OPERATIONS"),
    ("WATER SUPPLY ESTABLISHED", "OPERATIONS"),
    ("INTERIOR OPERATIONS", "OPERATIONS"),
    ("INTERIOR OPS", "OPERATIONS"),
    ("EXTERIOR OPERATIONS", "OPERATIONS"),
    ("OVERHAUL", "OPERATIONS"),
    ("EXTENSIVE OVERHAUL", "OPERATIONS"),
    ("VENTILATION", "OPERATIONS"),
    ("LINES IN SERVICE", "OPERATIONS"),
    ("LINES I S", "OPERATIONS"),
    ("2 LINES", "OPERATIONS"),
    ("LADDER TO ROOF", "OPERATIONS"),
    ("SEARCH IN PROGRESS", "OPERATIONS"),
    ("PRIMARY SEARCH", "OPERATIONS"),
    ("SECONDARY SEARCH", "OPERATIONS"),
    ("SALVAGE", "OPERATIONS"),
    ("UTILITIES SECURED", "OPERATIONS"),
    ("GAS SHUT OFF", "OPERATIONS"),
    ("ELECTRIC SECURED", "OPERATIONS"),
    ("WINDOWS", "OPERATIONS"),
    ("HOLES IN ROOF", "OPERATIONS"),
    ("BRING EXTRA", "OPERATIONS"),
    ("FOAM", "OPERATIONS"),
    ("REHAB", "OPERATIONS"),
    ("CONTINUING INTERIOR", "OPERATIONS"),
    ("OPS 2", "OPERATIONS"),
    ("C OPS", "OPERATIONS"),
    ("PECO", "OPERATIONS"),
    
    # UNIT - Unit activity
    ("Enroute with a crew of", "UNIT"),
    ("CREW OF", "UNIT"),
    ("ON SCENE", "UNIT"),
    ("RESPONDING", "UNIT"),
    ("DELAYED", "UNIT"),
    ("OUT OF SERVICE", "UNIT"),
    ("AVAILABLE", "UNIT"),
    ("AT QUARTERS", "UNIT"),
    ("STAGING", "UNIT"),
    
    # OTHER - Miscellaneous
    ("CONTINUED", "OTHER"),
    ("DISREGARD", "OTHER"),
    ("CANCEL", "OTHER"),
    ("OK ON", "OTHER"),
    ("BELFOR", "OTHER"),
    ("SERVPRO", "OTHER"),
    ("RED CROSS", "OTHER"),
    ("CORONER", "OTHER"),
]
```

## API Endpoints

### New Router: `backend/routers/comcat.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db

router = APIRouter(prefix="/api/comcat", tags=["comcat"])

@router.get("/comments/{incident_id}")
def get_incident_comments(incident_id: int, db: Session = Depends(get_db)):
    """Get all comments for an incident with their categories."""
    pass

@router.put("/comments/{incident_id}")
def update_comment_categories(
    incident_id: int,
    updates: list[dict],  # [{index: 0, category: "TACTICAL"}, ...]
    edited_by: int = None,
    db: Session = Depends(get_db)
):
    """
    Update categories for comments.
    Sets category_source to OFFICER for manual changes.
    """
    pass

@router.post("/retrain")
def retrain_model(db: Session = Depends(get_db)):
    """
    Retrain ML model on all PATTERN and OFFICER categorized comments.
    Called manually or via scheduled job.
    """
    pass

@router.get("/stats")
def get_training_stats(db: Session = Depends(get_db)):
    """Get training data statistics."""
    pass
```

## Frontend UI

### Button Location

Add to RunSheetForm action bar (where Print, Save, Close buttons are):

```jsx
// In RunSheetForm.jsx
<button onClick={() => setShowComCatModal(true)}>
  Categorize Comments
</button>
```

### Modal Design

```
┌─────────────────────────────────────────────────────────────────┐
│  CAD Event Comments                                   [X Close] │
├─────────────────────────────────────────────────────────────────┤
│  Training stats: 847 examples (142 officer-verified)            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 22:25:42  HOUSE ON FIRE                                   │  │
│  │           [CALLER     ▼]  Pattern match                   │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ 22:43:20  Command Established for set Fire Incident...    │  │
│  │           [TACTICAL   ▼]  Pattern match                   │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ 22:34:49  PECO/CLIFFORD                                   │  │
│  │           [OPERATIONS ▼]  ML: 72% ⚠                       │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ 22:47:27  CHF49 -- 2 MORE ENGINES                         │  │
│  │           [OTHER      ▼]  ML: 45% ⚠                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Legend:  Pattern match = seed data                             │
│           ML: XX% = predicted (low confidence highlighted)      │
│           Officer = manually verified                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Save Changes]                    [Retrain Model]              │
└─────────────────────────────────────────────────────────────────┘
```

### Category Dropdown Options

```jsx
const CATEGORIES = [
  { value: 'CALLER', label: 'Caller Information' },
  { value: 'TACTICAL', label: 'Command & Tactical' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'UNIT', label: 'Unit Activity' },
  { value: 'OTHER', label: 'Other' },
];
```

### Visual Indicators

- **Green checkmark** - Officer verified (highest quality training data)
- **Blue dot** - Pattern match (seed data)
- **Yellow warning** - ML prediction with low confidence (<70%)
- **Gray** - ML prediction with high confidence (>70%)

## Processing Flow

### 1. Initial Parse (CAD CLEAR arrives)

```python
# In cad_listener.py when CLEAR arrives

def process_incident_clear(raw_html, incident_id):
    # 1. Parse comments from HTML
    parsed = parse_cad_html(raw_html)
    comments = parsed.event_comments
    
    # 2. Load ML model
    model = ComCatModel()
    model.load()
    
    # 3. Categorize each comment
    for comment in comments:
        # Try pattern match first
        category, matched = pattern_match(comment['text'])
        
        if matched:
            comment['category'] = category
            comment['category_source'] = 'PATTERN'
            comment['category_confidence'] = None
        else:
            # Fall back to ML
            category, confidence = model.predict(comment['text'])
            comment['category'] = category or 'OTHER'
            comment['category_source'] = 'ML'
            comment['category_confidence'] = confidence
    
    # 4. Store in database
    update_incident_comments(incident_id, comments)
```

### 2. Officer Review (UI modal)

```
Officer opens modal → Sees current categories → 
Changes dropdown for "PECO/CLIFFORD" from OTHER to OPERATIONS →
Clicks Save → API updates:
  - category: "OPERATIONS"
  - category_source: "OFFICER"
  - category_confidence: null
```

### 3. Model Retraining

```python
# Can be triggered manually or via cron job

def retrain_model(db):
    # 1. Gather training data
    training_data = []
    
    # Get seed examples
    training_data.extend(SEED_EXAMPLES)
    
    # Get all PATTERN and OFFICER categorized comments from database
    incidents = db.query(Incident).filter(
        Incident.cad_event_comments.isnot(None)
    ).all()
    
    for incident in incidents:
        comments = incident.cad_event_comments.get('comments', [])
        for comment in comments:
            if comment.get('category_source') in ('PATTERN', 'OFFICER'):
                training_data.append((
                    comment['text'],
                    comment['category']
                ))
    
    # 2. Train model
    texts, categories = zip(*training_data)
    model = ComCatModel()
    model.train(list(texts), list(categories))
    
    # 3. Optionally re-predict ML-sourced comments
    # (comments that were originally ML-predicted can be re-predicted
    #  with the improved model)
```

## Implementation Order

### Phase 1: Foundation (This PR)
1. Update `comment_processor.py` to add `category_source` and `category_confidence` fields
2. Create `cad/comcat_seeds.py` with seed examples
3. Create `cad/comcat_model.py` with ML pipeline
4. Update backfill script to use pattern matching with proper source tracking

### Phase 2: API
1. Create `backend/routers/comcat.py`
2. Add endpoints for get/update comments
3. Add retrain endpoint
4. Add stats endpoint

### Phase 3: Frontend
1. Create `ComCatModal.jsx` component
2. Add button to RunSheetForm
3. Wire up API calls
4. Add visual indicators for source/confidence

### Phase 4: Automation
1. Add cron job or scheduled task for periodic retraining
2. Consider real-time retraining trigger after N officer corrections

## Dependencies

### Python (add to requirements)
```
scikit-learn>=1.3.0
```

### Already Available
- psycopg2 (database)
- BeautifulSoup (HTML parsing)
- React (frontend)

## Testing Plan

1. **Unit tests** for pattern matcher
2. **Unit tests** for ML model train/predict
3. **Integration test** for full flow (parse → categorize → store → retrieve)
4. **Manual testing** with real incident data
5. **A/B comparison** of pattern-only vs ML predictions

## Success Metrics

- Reduction in "OTHER" category (goal: <10% of comments)
- Officer correction rate decreasing over time
- ML confidence scores increasing as training data grows
- Time saved on manual categorization

## Notes for Implementation

- Start ML predicting immediately with seed data (no waiting period)
- Every officer correction instantly improves training data
- Retrain model periodically (daily/weekly) or after threshold of new corrections
- PDF renderer needs no changes - just reads `category` field
- Existing incidents can be re-processed with backfill script after implementing

## File Reference

Existing related files:
- `cad/comment_processor.py` - Current categorization logic
- `cad/cad_parser.py` - HTML parsing
- `cad/cad_listener.py` - Receives CAD data
- `cad/backfill_event_comments.py` - Reprocess existing incidents
- `backend/report_engine/renderers.py` - PDF generation (uses categories)
- `frontend/src/components/RunSheetForm.jsx` - Form where button will live
- `frontend/src/components/CLAUDE_TODO_DetectedTimestampsUI.md` - Related UI guidance
