"""
CAD Event Comment Processor for RunSheet
Created: 2025-12-31
Updated: 2025-12-31 - ComCat v2.0: Pure ML categorization

Parses Chester County CAD event comments to:
1. Extract all comments with metadata (operator, operator_type, text)
2. ML-based categorization using text + operator_type features
3. Detect potential tactical timestamps for NERIS
4. Extract unit crew counts for reference

ComCat v2.0 uses PURE ML categorization:
- No hardcoded pattern rules for categories
- ML model learns from text AND who entered it (calltaker, dispatcher, unit)
- Officer corrections train the model to improve over time
- Seed data bootstraps the model initially

The processor still uses patterns for:
- Operator type detection (ct## = calltaker, fd## = dispatcher, etc)
- Noise filtering (system messages to hide from reports)
- Tactical timestamp detection (for NERIS field suggestions)
"""

import re
import logging
from datetime import datetime, date
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class ParsedComment:
    """
    A single parsed event comment with categorization metadata.
    
    ComCat v2.0 adds category_source and category_confidence to track
    how the category was assigned and enable ML training.
    """
    time: str                                    # Raw time string from CAD (HH:MM:SS)
    time_iso: Optional[str] = None               # ISO format with date
    operator: str = ""                           # Operator code (ct08, fd17, $ENG38)
    operator_type: str = "UNKNOWN"               # CALLTAKER, DISPATCHER, UNIT, SYSTEM
    text: str = ""                               # Comment text
    is_noise: bool = False                       # System noise to filter from reports
    category: str = "OTHER"                      # CALLER, TACTICAL, OPERATIONS, UNIT, OTHER
    
    # ComCat v2.0 fields for ML training
    category_source: str = "PATTERN"             # PATTERN, ML, OFFICER
    category_confidence: Optional[float] = None  # 0.0-1.0 for ML, None for PATTERN/OFFICER


@dataclass
class DetectedTimestamp:
    """A detected tactical timestamp with NERIS suggestion"""
    time: str                           # Raw time string
    time_iso: Optional[str] = None      # ISO format with date
    raw_text: str = ""                  # Full comment text
    detected_type: str = ""             # Internal detection type
    suggested_neris_field: Optional[str] = None  # NERIS column name suggestion
    suggested_operational_field: Optional[str] = None  # Non-NERIS operational field
    confidence: str = "LOW"             # HIGH, MEDIUM, LOW
    pattern_matched: str = ""           # Which pattern matched
    mapped_to: Optional[str] = None     # Officer-confirmed mapping (filled by UI)
    mapped_at: Optional[str] = None     # When mapped
    mapped_by: Optional[int] = None     # Personnel ID who mapped


@dataclass
class UnitCrewCount:
    """Crew count extracted from CAD comments"""
    unit_id: str
    crew_count: int
    time: str
    time_iso: Optional[str] = None


@dataclass 
class ProcessedComments:
    """Complete processed comments structure for storage"""
    comments: List[ParsedComment] = field(default_factory=list)
    detected_timestamps: List[DetectedTimestamp] = field(default_factory=list)
    unit_crew_counts: List[UnitCrewCount] = field(default_factory=list)
    parsed_at: str = ""
    parser_version: str = "2.0"  # Updated for ComCat ML integration
    incident_date: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSONB storage"""
        return {
            "comments": [asdict(c) for c in self.comments],
            "detected_timestamps": [asdict(t) for t in self.detected_timestamps],
            "unit_crew_counts": [asdict(u) for u in self.unit_crew_counts],
            "parsed_at": self.parsed_at,
            "parser_version": self.parser_version,
            "incident_date": self.incident_date
        }


# =============================================================================
# PATTERN DEFINITIONS
# =============================================================================

# Operator type detection
OPERATOR_PATTERNS = {
    "CALLTAKER": re.compile(r'^ct\d+$', re.IGNORECASE),
    "DISPATCHER": re.compile(r'^fd\d+$', re.IGNORECASE),
    "UNIT": re.compile(r'^\$\w+$'),
    "SYSTEM": re.compile(r'^(System|CAD|Auto)$', re.IGNORECASE),
}

# Noise patterns - system messages to filter from PDF reports
NOISE_PATTERNS = [
    re.compile(r'Tracking device.*System (cleared|set)', re.IGNORECASE),
    re.compile(r'Device \d+.*(Mobile Radio|MDT).*System (added|removed)', re.IGNORECASE),
    re.compile(r'New equipment list for Unit', re.IGNORECASE),
    re.compile(r'Preempt Unit', re.IGNORECASE),
    re.compile(r'timer expired for set Fire Incident Command Times', re.IGNORECASE),
    re.compile(r'Recommend.*\d+.*units', re.IGNORECASE),
    re.compile(r'ProQA.*Case (Entry|Exit)', re.IGNORECASE),
]

# Category detection patterns - REMOVED IN V2
# The ML model now handles categorization using text + operator_type features
# This allows the model to learn patterns naturally from officer corrections
# rather than relying on hardcoded rules.
#
# Only NOISE patterns remain for filtering system messages from reports.

# Tactical timestamp detection patterns
# Format: (pattern, detected_type, neris_field, operational_field, confidence)
TIMESTAMP_PATTERNS = [
    # HIGH CONFIDENCE - Chester County formal timestamp system
    (
        re.compile(r'(\d{2}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})?\s*Command Established for set Fire Incident Command Times', re.IGNORECASE),
        "COMMAND_ESTABLISHED",
        "time_command_established",
        None,
        "HIGH"
    ),
    (
        re.compile(r'\*\*\s*Fire Under Control at\s*(\d{2}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})?', re.IGNORECASE),
        "FIRE_UNDER_CONTROL",
        "time_fire_under_control",
        None,
        "HIGH"
    ),
    (
        re.compile(r'(\d{2}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})?\s*Evac Ordered for set Fire Incident Command Times', re.IGNORECASE),
        "EVAC_ORDERED",
        None,
        "time_evac_ordered",
        "HIGH"
    ),
    (
        re.compile(r'(\d{2}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})?\s*Accountability/Start PAR.*timer started', re.IGNORECASE),
        "PAR_STARTED",
        None,
        "time_par_started",
        "HIGH"
    ),
    (
        re.compile(r'\bMAYDAY\b', re.IGNORECASE),
        "MAYDAY",
        "time_mayday_declared",
        None,
        "HIGH"
    ),
    
    # MEDIUM CONFIDENCE
    (
        re.compile(r'\bFUC\b', re.IGNORECASE),
        "FUC_ABBREVIATION",
        "time_fire_under_control",
        None,
        "MEDIUM"
    ),
    (
        re.compile(r'Fire Under Control', re.IGNORECASE),
        "FUC_TEXT",
        "time_fire_under_control",
        None,
        "MEDIUM"
    ),
    (
        re.compile(r'Water (On Fire|Supply Established)', re.IGNORECASE),
        "WATER_STATUS",
        "time_water_on_fire",
        "time_water_supply_established",
        "MEDIUM"
    ),
    (
        re.compile(r'(Primary|1st).*All Clear|\bPAC\b', re.IGNORECASE),
        "PRIMARY_SEARCH_COMPLETE",
        "time_primary_search_complete",
        None,
        "MEDIUM"
    ),
    (
        re.compile(r'(Secondary|2nd).*All Clear|\bSAC\b', re.IGNORECASE),
        "SECONDARY_SEARCH_COMPLETE",
        "time_secondary_search_complete",
        None,
        "MEDIUM"
    ),
    (
        re.compile(r'\bRIT\b.*(Activated|Deployed|Established)', re.IGNORECASE),
        "RIT_ACTIVATED",
        "time_rit_activated",
        None,
        "MEDIUM"
    ),
    (
        re.compile(r'PAR\s*(Complete|All Accounted|Good)', re.IGNORECASE),
        "PAR_COMPLETE",
        None,
        "time_par_complete",
        "MEDIUM"
    ),
    (
        re.compile(r'Utilities.*(Secured|Off|Cut|Disconnected)', re.IGNORECASE),
        "UTILITIES_SECURED",
        None,
        "time_utilities_secured",
        "MEDIUM"
    ),
    (
        re.compile(r'(Fire Marshal|Investigat)', re.IGNORECASE),
        "INVESTIGATION_REQUESTED",
        None,
        "time_investigation_requested",
        "MEDIUM"
    ),
    
    # LOW CONFIDENCE - generic mentions
    (
        re.compile(r'Overhaul', re.IGNORECASE),
        "OVERHAUL",
        "time_overhaul_start",
        None,
        "LOW"
    ),
    (
        re.compile(r'Ventilat', re.IGNORECASE),
        "VENTILATION",
        "time_ventilation_start",
        None,
        "LOW"
    ),
    (
        re.compile(r'All Clear', re.IGNORECASE),
        "ALL_CLEAR",
        None,
        "time_all_clear",
        "LOW"
    ),
    (
        re.compile(r'Loss Stop', re.IGNORECASE),
        "LOSS_STOP",
        None,
        "time_loss_stop",
        "LOW"
    ),
    (
        re.compile(r'Size.?Up|360', re.IGNORECASE),
        "SIZEUP",
        "time_sizeup_completed",
        None,
        "LOW"
    ),
]

# Crew count pattern
CREW_COUNT_PATTERN = re.compile(r'Enroute with a crew of\s*(\d+)', re.IGNORECASE)


# =============================================================================
# ML MODEL INTEGRATION (v2 - with operator_type)
# =============================================================================

# ML model - lazy loaded
_ml_model = None
_ml_available = False


def _get_ml_model():
    """
    Lazy load the ML model.
    Returns None if ML is not available (scikit-learn not installed).
    """
    global _ml_model, _ml_available
    
    if _ml_model is not None:
        return _ml_model
    
    try:
        from .comcat_model import get_model
        _ml_model = get_model()
        _ml_available = _ml_model.is_trained
        if _ml_available:
            logger.info(f"ComCat ML model v{_ml_model.model_version} loaded successfully")
        else:
            logger.warning("ComCat ML model not trained - categories may be inaccurate")
    except ImportError as e:
        logger.warning(f"ComCat ML not available: {e}")
        _ml_available = False
    except Exception as e:
        logger.error(f"Failed to load ComCat ML model: {e}")
        _ml_available = False
    
    return _ml_model


def _predict_category_ml(text: str, operator_type: str = "UNKNOWN") -> Tuple[Optional[str], Optional[float]]:
    """
    Get ML prediction for comment category.
    
    v2: Now includes operator_type as a feature for context-aware predictions.
    
    Args:
        text: Comment text
        operator_type: Who entered it (CALLTAKER, DISPATCHER, UNIT, SYSTEM, UNKNOWN)
    
    Returns:
        (category, confidence) or (None, None) if ML unavailable
    """
    model = _get_ml_model()
    if model is None or not _ml_available:
        return None, None
    
    try:
        category, confidence = model.predict(text, operator_type)
        return category, confidence
    except Exception as e:
        logger.error(f"ML prediction failed: {e}")
        return None, None


# =============================================================================
# PROCESSOR CLASS
# =============================================================================

class CommentProcessor:
    """
    Processes CAD event comments for RunSheet.
    
    ComCat v2.0 uses hybrid categorization:
    1. Pattern matching (deterministic, high confidence)
    2. ML fallback (Random Forest with confidence scores)
    
    Usage:
        processor = CommentProcessor()
        result = processor.process_clear_html(raw_html, incident_date)
        # result.to_dict() -> JSONB for cad_event_comments column
    """
    
    def __init__(self, use_ml: bool = True):
        """
        Initialize processor.
        
        Args:
            use_ml: Whether to use ML for unmatched comments (default: True)
        """
        self.result = ProcessedComments()
        self.use_ml = use_ml
    
    def process_clear_html(self, html: str, incident_date: Optional[date] = None) -> ProcessedComments:
        """
        Process a CAD Clear Report HTML to extract event comments.
        
        Args:
            html: Raw HTML from CAD Clear Report
            incident_date: Date of incident for timestamp conversion
            
        Returns:
            ProcessedComments object ready for JSONB storage
        """
        self.result = ProcessedComments()
        self.result.parsed_at = datetime.utcnow().isoformat() + "Z"
        self.result.incident_date = incident_date.isoformat() if incident_date else None
        
        if not html:
            return self.result
            
        soup = BeautifulSoup(html, 'html.parser')
        
        # Parse comments from EventComments table
        self._parse_comments(soup, incident_date)
        
        # Detect tactical timestamps
        self._detect_timestamps()
        
        # Extract crew counts
        self._extract_crew_counts(incident_date)
        
        return self.result
    
    def _parse_comments(self, soup: BeautifulSoup, incident_date: Optional[date]):
        """Extract all event comments from HTML"""
        for table in soup.find_all('table'):
            # Look for EventComments table
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all('td', class_='EventComment')
                if len(cells) >= 3:
                    time_str = self._clean_text(cells[0].get_text())
                    operator = self._clean_text(cells[1].get_text())
                    text = self._clean_text(cells[2].get_text())
                    
                    if not text:
                        continue
                    
                    # Get category with source tracking
                    category, source, confidence = self._categorize_comment(text, operator)
                    
                    comment = ParsedComment(
                        time=time_str,
                        time_iso=self._to_iso_time(time_str, incident_date),
                        operator=operator,
                        operator_type=self._detect_operator_type(operator),
                        text=text,
                        is_noise=self._is_noise(text),
                        category=category,
                        category_source=source,
                        category_confidence=confidence
                    )
                    
                    self.result.comments.append(comment)
    
    def _categorize_comment(self, text: str, operator: str) -> Tuple[str, str, Optional[float]]:
        """
        Categorize a comment using ML with text + operator_type features.
        
        v2.0: Pure ML - no hardcoded pattern rules. The model learns from
        officer corrections, considering both the comment text and who
        entered it (calltaker, dispatcher, unit, etc).
        
        Returns:
            (category, source, confidence)
            - source: "ML" or "FALLBACK" (if ML unavailable)
            - confidence: float for ML, None for fallback
        """
        operator_type = self._detect_operator_type(operator)
        
        # Use ML for all categorization
        if self.use_ml:
            ml_category, ml_confidence = _predict_category_ml(text, operator_type)
            if ml_category is not None:
                return ml_category, "ML", ml_confidence
        
        # Fallback to OTHER only if ML unavailable
        return "OTHER", "FALLBACK", None
    
    def _detect_timestamps(self):
        """Scan comments for tactical timestamps and suggest NERIS mappings"""
        seen_types = set()  # Track to avoid duplicate detections
        
        for comment in self.result.comments:
            if comment.is_noise:
                continue
                
            for pattern, detected_type, neris_field, op_field, confidence in TIMESTAMP_PATTERNS:
                # Skip if we already detected this type (first match wins)
                if detected_type in seen_types:
                    continue
                    
                if pattern.search(comment.text):
                    timestamp = DetectedTimestamp(
                        time=comment.time,
                        time_iso=comment.time_iso,
                        raw_text=comment.text,
                        detected_type=detected_type,
                        suggested_neris_field=neris_field,
                        suggested_operational_field=op_field,
                        confidence=confidence,
                        pattern_matched=pattern.pattern
                    )
                    self.result.detected_timestamps.append(timestamp)
                    seen_types.add(detected_type)
                    break  # Only one detection per comment
    
    def _extract_crew_counts(self, incident_date: Optional[date]):
        """Extract crew counts from unit status updates"""
        for comment in self.result.comments:
            # Only look at unit comments
            if comment.operator_type != "UNIT":
                continue
                
            match = CREW_COUNT_PATTERN.search(comment.text)
            if match:
                # Extract unit ID from operator (remove $ prefix)
                unit_id = comment.operator.lstrip('$')
                crew_count = int(match.group(1))
                
                self.result.unit_crew_counts.append(UnitCrewCount(
                    unit_id=unit_id,
                    crew_count=crew_count,
                    time=comment.time,
                    time_iso=comment.time_iso
                ))
    
    def _detect_operator_type(self, operator: str) -> str:
        """Determine operator type from code"""
        for op_type, pattern in OPERATOR_PATTERNS.items():
            if pattern.match(operator):
                return op_type
        return "UNKNOWN"
    
    def _is_noise(self, text: str) -> bool:
        """Check if comment is system noise to filter"""
        for pattern in NOISE_PATTERNS:
            if pattern.search(text):
                return True
        return False
    
    def _to_iso_time(self, time_str: str, incident_date: Optional[date]) -> Optional[str]:
        """Convert HH:MM:SS to ISO format with date"""
        if not time_str or not incident_date:
            return None
            
        try:
            # Parse time
            time_parts = time_str.split(':')
            if len(time_parts) >= 2:
                hour = int(time_parts[0])
                minute = int(time_parts[1])
                second = int(time_parts[2]) if len(time_parts) > 2 else 0
                
                dt = datetime.combine(
                    incident_date,
                    datetime.min.time().replace(hour=hour, minute=minute, second=second)
                )
                return dt.isoformat() + "Z"
        except (ValueError, IndexError):
            pass
            
        return None
    
    def _clean_text(self, text: str) -> str:
        """Clean text from HTML"""
        if not text:
            return ""
        # Remove extra whitespace
        text = ' '.join(text.split())
        return text.strip()


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def process_cad_clear(html: str, incident_date: Optional[date] = None, use_ml: bool = True) -> Dict[str, Any]:
    """
    Convenience function to process CAD clear HTML and return dict.
    
    Args:
        html: Raw HTML from CAD Clear Report
        incident_date: Date of incident
        use_ml: Whether to use ML for categorization (default: True)
        
    Returns:
        Dictionary ready for JSONB storage in cad_event_comments
    """
    processor = CommentProcessor(use_ml=use_ml)
    result = processor.process_clear_html(html, incident_date)
    return result.to_dict()


def get_filtered_comments(processed: Dict[str, Any], include_noise: bool = False) -> List[Dict]:
    """
    Get comments filtered for PDF display.
    
    Args:
        processed: The cad_event_comments JSONB data
        include_noise: Whether to include system noise
        
    Returns:
        List of comment dicts filtered appropriately
    """
    comments = processed.get("comments", [])
    if include_noise:
        return comments
    return [c for c in comments if not c.get("is_noise", False)]


def get_comments_by_category(processed: Dict[str, Any]) -> Dict[str, List[Dict]]:
    """
    Group comments by category for structured PDF display.
    
    Args:
        processed: The cad_event_comments JSONB data
        
    Returns:
        Dictionary with category keys and comment lists
    """
    categories = {
        "CALLER": [],
        "TACTICAL": [],
        "OPERATIONS": [],
        "UNIT": [],
        "OTHER": []
    }
    
    for comment in processed.get("comments", []):
        if comment.get("is_noise"):
            continue
        category = comment.get("category", "OTHER")
        # Map legacy "UNCATEGORIZED" to "OTHER"
        if category == "UNCATEGORIZED":
            category = "OTHER"
        if category in categories:
            categories[category].append(comment)
        else:
            categories["OTHER"].append(comment)
    
    # Remove empty categories
    return {k: v for k, v in categories.items() if v}


def get_comments_needing_review(processed: Dict[str, Any], threshold: float = 0.50) -> List[Dict]:
    """
    Get ML-categorized comments with low confidence that need officer review.
    
    Args:
        processed: The cad_event_comments JSONB data
        threshold: Confidence threshold below which to flag for review
        
    Returns:
        List of comment dicts needing review
    """
    comments = processed.get("comments", [])
    review_needed = []
    
    for comment in comments:
        if comment.get("is_noise"):
            continue
        if comment.get("category_source") == "ML":
            confidence = comment.get("category_confidence", 0)
            if confidence is not None and confidence < threshold:
                review_needed.append(comment)
    
    return review_needed


def get_pending_timestamp_mappings(processed: Dict[str, Any]) -> List[Dict]:
    """
    Get detected timestamps that haven't been mapped yet.
    For UI display in RunSheet form.
    
    Args:
        processed: The cad_event_comments JSONB data
        
    Returns:
        List of unmapped detected timestamps
    """
    timestamps = processed.get("detected_timestamps", [])
    return [t for t in timestamps if not t.get("mapped_to")]


def get_high_confidence_suggestions(processed: Dict[str, Any]) -> List[Dict]:
    """
    Get only HIGH confidence timestamp suggestions.
    These are most reliable for auto-suggestion in UI.
    
    Args:
        processed: The cad_event_comments JSONB data
        
    Returns:
        List of HIGH confidence detected timestamps
    """
    timestamps = processed.get("detected_timestamps", [])
    return [t for t in timestamps if t.get("confidence") == "HIGH"]


def get_training_data_from_comments(processed: Dict[str, Any]) -> List[Tuple[str, str, str]]:
    """
    Extract training data from comments for ML model retraining.
    
    v2.0: Returns (text, operator_type, category) tuples for context-aware learning.
    Only includes OFFICER corrections as ground truth for retraining.
    
    Args:
        processed: The cad_event_comments JSONB data
        
    Returns:
        List of (text, operator_type, category) tuples for training
    """
    training_data = []
    
    for comment in processed.get("comments", []):
        if comment.get("is_noise"):
            continue
        
        source = comment.get("category_source", "ML")
        # Only use OFFICER corrections as ground truth for retraining
        # (Seed data is already in the model)
        if source == "OFFICER":
            text = comment.get("text", "")
            operator_type = comment.get("operator_type", "UNKNOWN")
            category = comment.get("category", "OTHER")
            if text and category:
                training_data.append((text, operator_type, category))
    
    return training_data


# =============================================================================
# COMPATIBILITY FUNCTION FOR CAD LISTENER
# =============================================================================

def process_clear_report_comments(
    event_comments: List[Dict[str, str]],
    incident_date: str,
    timezone: str = 'America/New_York',
    use_ml: bool = True
) -> Dict[str, Any]:
    """
    Process pre-parsed event comments from CAD clear report.
    
    This is a compatibility wrapper for the CAD listener which passes
    event_comments as a list of {time, operator, text} dicts rather than raw HTML.
    
    Args:
        event_comments: List of comment dicts from cad_parser
        incident_date: Date string (YYYY-MM-DD)
        timezone: IANA timezone string
        use_ml: Whether to use ML for categorization (default: True)
        
    Returns:
        Dict with:
        - cad_event_comments: Full processed comments for JSONB storage
        - tactical_timestamps: Dict of NERIS field -> ISO timestamp (HIGH confidence only)
        - crew_counts: Dict of unit_id -> crew_count
    """
    from zoneinfo import ZoneInfo
    
    result = ProcessedComments()
    result.parsed_at = datetime.utcnow().isoformat() + "Z"
    result.incident_date = incident_date
    
    try:
        inc_date = datetime.strptime(incident_date, '%Y-%m-%d').date()
    except:
        inc_date = datetime.now().date()
    
    local_tz = ZoneInfo(timezone)
    
    # Convert pre-parsed comments to our format
    for comment in (event_comments or []):
        time_str = comment.get('time', '')
        operator = comment.get('operator', '')
        text = comment.get('text', '')
        
        if not text:
            continue
        
        # Parse time to ISO with timezone
        time_iso = None
        if time_str:
            try:
                time_parts = time_str.split(':')
                if len(time_parts) >= 2:
                    hour = int(time_parts[0])
                    minute = int(time_parts[1])
                    second = int(time_parts[2]) if len(time_parts) > 2 else 0
                    
                    dt = datetime.combine(
                        inc_date,
                        datetime.min.time().replace(hour=hour, minute=minute, second=second)
                    )
                    local_dt = dt.replace(tzinfo=local_tz)
                    utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
                    time_iso = utc_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
            except:
                pass
        
        # Detect operator type
        operator_type = "UNKNOWN"
        for op_type, pattern in OPERATOR_PATTERNS.items():
            if pattern.match(operator):
                operator_type = op_type
                break
        
        # Check if noise
        is_noise = False
        for pattern in NOISE_PATTERNS:
            if pattern.search(text):
                is_noise = True
                break
        
        # Categorize using hybrid approach
        category, category_source, category_confidence = _categorize_comment_standalone(
            text, operator, operator_type, use_ml
        )
        
        parsed = ParsedComment(
            time=time_str,
            time_iso=time_iso,
            operator=operator,
            operator_type=operator_type,
            text=text,
            is_noise=is_noise,
            category=category,
            category_source=category_source,
            category_confidence=category_confidence
        )
        result.comments.append(parsed)
    
    # Detect tactical timestamps
    seen_types = set()
    for comment in result.comments:
        if comment.is_noise:
            continue
        
        for pattern, detected_type, neris_field, op_field, confidence in TIMESTAMP_PATTERNS:
            if detected_type in seen_types:
                continue
            
            if pattern.search(comment.text):
                timestamp = DetectedTimestamp(
                    time=comment.time,
                    time_iso=comment.time_iso,
                    raw_text=comment.text,
                    detected_type=detected_type,
                    suggested_neris_field=neris_field,
                    suggested_operational_field=op_field,
                    confidence=confidence,
                    pattern_matched=pattern.pattern
                )
                result.detected_timestamps.append(timestamp)
                seen_types.add(detected_type)
                break
    
    # Extract crew counts
    for comment in result.comments:
        if comment.operator_type != "UNIT":
            continue
        
        match = CREW_COUNT_PATTERN.search(comment.text)
        if match:
            unit_id = comment.operator.lstrip('$')
            crew_count = int(match.group(1))
            result.unit_crew_counts.append(UnitCrewCount(
                unit_id=unit_id,
                crew_count=crew_count,
                time=comment.time,
                time_iso=comment.time_iso
            ))
    
    # Build return dict in format expected by cad_listener
    # Only return HIGH confidence tactical timestamps for auto-population
    tactical_timestamps = {}
    for ts in result.detected_timestamps:
        if ts.confidence == "HIGH" and ts.time_iso:
            if ts.suggested_neris_field:
                tactical_timestamps[ts.suggested_neris_field] = ts.time_iso
            elif ts.suggested_operational_field:
                tactical_timestamps[ts.suggested_operational_field] = ts.time_iso
    
    # Crew counts as dict
    crew_counts = {}
    for uc in result.unit_crew_counts:
        crew_counts[uc.unit_id] = uc.crew_count
    
    return {
        'cad_event_comments': result.to_dict(),
        'tactical_timestamps': tactical_timestamps,
        'crew_counts': crew_counts,
    }


def _categorize_comment_standalone(
    text: str, 
    operator: str, 
    operator_type: str,
    use_ml: bool = True
) -> Tuple[str, str, Optional[float]]:
    """
    Standalone categorization using pure ML.
    
    v2.0: No hardcoded rules - ML learns from text + operator_type.
    
    Returns:
        (category, source, confidence)
    """
    # Use ML for all categorization
    if use_ml:
        ml_category, ml_confidence = _predict_category_ml(text, operator_type)
        if ml_category is not None:
            return ml_category, "ML", ml_confidence
    
    # Fallback to OTHER only if ML unavailable
    return "OTHER", "FALLBACK", None
