"""
TTS Preprocessing - Text normalization for Piper TTS

Handles:
- Unit pronunciation lookups (ENG481 -> "Engine forty-eight one")
- Auto-creation of new unit mappings when unknown units seen
- Number to spoken word conversion
- Field pause formatting

Usage:
    from services.tts_preprocessing import tts_preprocessor
    
    spoken = await tts_preprocessor.get_unit_spoken(db, "ENG481")
    # Returns "Engine forty-eight one"
    
    text = tts_preprocessor.format_with_pauses(parts, field_settings)
    # Returns formatted string with appropriate punctuation for pauses
"""

import logging
import re
from typing import Dict, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

# =============================================================================
# NUMBER TO WORDS CONVERSION
# =============================================================================

ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
        'seventeen', 'eighteen', 'nineteen']
TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']


def number_to_words(n: int) -> str:
    """
    Convert integer to spoken words.
    Handles 0-99 for station numbers.
    
    Examples:
        0 -> "zero"
        1 -> "one"
        12 -> "twelve"
        48 -> "forty-eight"
        99 -> "ninety-nine"
    """
    if n == 0:
        return "zero"
    if n < 0 or n > 99:
        # For numbers outside our range, spell out digits
        return ' '.join(ONES[int(d)] if d != '0' else 'zero' for d in str(abs(n)))
    if n < 20:
        return ONES[n]
    
    tens_digit = n // 10
    ones_digit = n % 10
    
    if ones_digit == 0:
        return TENS[tens_digit]
    return f"{TENS[tens_digit]}-{ONES[ones_digit]}"


def digits_to_words(digits: str) -> str:
    """
    Spell out each digit individually.
    
    Examples:
        "1" -> "one"
        "12" -> "one two"
        "481" -> "four eight one"
    """
    if not digits:
        return ""
    
    words = []
    for d in digits:
        if d.isdigit():
            words.append(ONES[int(d)] if int(d) > 0 else 'zero')
    
    return ' '.join(words)


# =============================================================================
# UNIT PARSING
# =============================================================================

def parse_unit_id(unit_id: str) -> Tuple[str, str, str]:
    """
    Parse a CAD unit ID into components.
    
    Returns: (prefix, station_number, unit_suffix)
    
    Examples:
        "ENG481" -> ("ENG", "48", "1")
        "ENG48" -> ("ENG", "48", "")
        "MIC2441" -> ("MIC", "244", "1")  # if 3-digit station
        "QRS48" -> ("QRS", "48", "")
        "48" -> ("", "48", "")
    """
    if not unit_id:
        return ("", "", "")
    
    unit_id = unit_id.upper().strip()
    
    # Extract alphabetic prefix
    match = re.match(r'^([A-Z]+)(\d+)$', unit_id)
    if match:
        prefix = match.group(1)
        numbers = match.group(2)
    else:
        # No prefix, might just be a station number
        prefix = ""
        numbers = re.sub(r'[^0-9]', '', unit_id)
    
    if not numbers:
        return (prefix, "", "")
    
    # Default: assume 2-digit station numbers
    # Station is first 2 digits (or all if less than 2), remainder is unit suffix
    if len(numbers) <= 2:
        station = numbers
        suffix = ""
    else:
        station = numbers[:2]
        suffix = numbers[2:]
    
    return (prefix, station, suffix)


def generate_spoken_guess_with_prefixes(unit_id: str, prefix_map: Dict[str, str], station_digits: int = 2) -> str:
    """
    Generate a best-guess pronunciation for a unit ID using provided prefix map.
    
    Args:
        unit_id: The CAD unit ID (e.g., "ENG481")
        prefix_map: Dict mapping prefix -> spoken form (e.g., {"ENG": "Engine"})
        station_digits: How many digits make up the station number (default 2)
    
    Returns:
        Best-guess spoken form (e.g., "Engine forty-eight one")
    """
    if not unit_id:
        return ""
    
    unit_id = unit_id.upper().strip()
    
    # Extract prefix and numbers
    match = re.match(r'^([A-Z]+)(\d+)$', unit_id)
    if match:
        prefix = match.group(1)
        numbers = match.group(2)
    else:
        # No clear prefix/number split - just return as-is spelled out
        return spell_out_mixed(unit_id)
    
    # Get spoken prefix from map, or spell out if not found
    spoken_prefix = prefix_map.get(prefix, spell_out_letters(prefix))
    
    # Parse station and unit suffix based on station_digits
    if len(numbers) <= station_digits:
        station = numbers.lstrip('0') or '0'  # Strip leading zeros but keep at least one digit
        suffix = ""
    else:
        station = numbers[:station_digits].lstrip('0') or '0'
        suffix = numbers[station_digits:]
    
    # Convert station number to words
    try:
        station_int = int(station)
        if station_int <= 99:
            spoken_station = number_to_words(station_int)
        else:
            # For 3-digit stations, say like "two forty-four"
            if station_int >= 100 and station_int <= 999:
                hundreds = station_int // 100
                remainder = station_int % 100
                if remainder == 0:
                    spoken_station = f"{ONES[hundreds]} hundred"
                else:
                    spoken_station = f"{ONES[hundreds]} {number_to_words(remainder)}"
            else:
                spoken_station = digits_to_words(station)
    except ValueError:
        spoken_station = digits_to_words(station)
    
    # Suffix digits spoken individually
    spoken_suffix = digits_to_words(suffix) if suffix else ""
    
    # Combine
    parts = [spoken_prefix, spoken_station]
    if spoken_suffix:
        parts.append(spoken_suffix)
    
    return ' '.join(parts)


def spell_out_letters(text: str) -> str:
    """Spell out letters with spaces: 'QRS' -> 'Q R S'"""
    return ' '.join(text.upper())


def preprocess_for_tts(text: str) -> str:
    """
    Preprocess text for TTS pronunciation.
    
    Rules:
    1. Replace / with space
    2. All caps words <= 3 chars: spell out (BLS -> B L S)
    3. All caps words > 3 chars: title case (FALL -> Fall)
    
    Examples:
        "FALL / LIFT ASSIST - BLS" -> "Fall Lift Assist - B L S"
        "MEDICAL" -> "Medical"
        "ALS" -> "A L S"
    """
    if not text:
        return ""
    
    # Rule 1: Replace / with space
    text = text.replace('/', ' ')
    
    # Clean up multiple spaces
    text = ' '.join(text.split())
    
    words = text.split()
    result = []
    
    for word in words:
        # Preserve punctuation
        clean_word = word.rstrip('.,!?-')
        trailing = word[len(clean_word):] if word != clean_word else ''
        
        # Check if word is all uppercase letters
        if clean_word.isupper() and clean_word.isalpha():
            if len(clean_word) <= 3:
                # Rule 2: Spell out short acronyms
                spelled = ' '.join(clean_word)
                result.append(spelled + trailing)
            else:
                # Rule 3: Title case longer words
                result.append(clean_word.title() + trailing)
        else:
            result.append(word)
    
    return ' '.join(result)


def spell_out_mixed(text: str) -> str:
    """Spell out mixed alphanumeric: 'A1B2' -> 'A one B two'"""
    result = []
    for char in text.upper():
        if char.isalpha():
            result.append(char)
        elif char.isdigit():
            result.append(ONES[int(char)] if int(char) > 0 else 'zero')
    return ' '.join(result)


# =============================================================================
# ADDRESS NUMBER PRONUNCIATION
# =============================================================================

def address_number_to_words(n: int) -> str:
    """
    Convert a street address number to spoken words using fire/dispatch convention.
    
    Address numbers are spoken differently than regular numbers:
    - 1-9: spoken normally ("five")
    - 10-99: spoken normally ("forty-two")
    - 100-999: hundred style ("one twenty-three", "nine fifty", "three hundred")
    - 1000-9999: split into two pairs ("eleven forty-six", "twenty-three hundred",
                 "fifteen oh-two")
    - 10000+: first digit(s) then last group ("one oh three fifty")
    
    Examples:
        5 -> "five"
        42 -> "forty-two"
        123 -> "one twenty-three"
        300 -> "three hundred"
        950 -> "nine fifty"
        1146 -> "eleven forty-six"
        2300 -> "twenty-three hundred"
        1502 -> "fifteen oh-two"
        1000 -> "ten hundred"
        2001 -> "twenty oh-one"
        10350 -> "one oh three fifty"
    """
    if n <= 0:
        return str(n)
    if n < 100:
        return number_to_words(n)
    
    # 100-999: "[hundreds digit] [remainder as two-digit]"
    # e.g., 123 -> "one twenty-three", 300 -> "three hundred", 950 -> "nine fifty"
    if n < 1000:
        hundreds = n // 100
        remainder = n % 100
        if remainder == 0:
            return f"{ONES[hundreds]} hundred"
        else:
            return f"{ONES[hundreds]} {number_to_words(remainder)}"
    
    # 1000-9999: split into top two digits and bottom two digits
    # e.g., 1146 -> top=11, bottom=46 -> "eleven forty-six"
    #        2300 -> top=23, bottom=00 -> "twenty-three hundred"
    #        1502 -> top=15, bottom=02 -> "fifteen oh-two"
    #        2001 -> top=20, bottom=01 -> "twenty oh-one"
    if n < 10000:
        top = n // 100
        bottom = n % 100
        top_words = number_to_words(top)
        if bottom == 0:
            return f"{top_words} hundred"
        elif bottom < 10:
            return f"{top_words} oh-{ONES[bottom]}"
        else:
            return f"{top_words} {number_to_words(bottom)}"
    
    # 10000+: split into leading digits and last two pairs
    # e.g., 10350 -> "one oh three fifty"
    #        12000 -> "one twenty hundred"
    # Treat as: first digit(s) + remaining 4 digits using the 1000-9999 rule
    s = str(n)
    # Split: everything except last 4 digits, then last 4 digits
    leading = s[:-4]
    trailing_4 = int(s[-4:])
    
    leading_words = ' '.join(ONES[int(d)] if int(d) > 0 else 'zero' for d in leading)
    trailing_words = address_number_to_words(trailing_4)
    
    return f"{leading_words} {trailing_words}"


# Direction expansions - hardcoded because they need positional context
DIRECTIONS = {
    'N': 'North',
    'S': 'South',
    'E': 'East',
    'W': 'West',
    'NE': 'Northeast',
    'NW': 'Northwest',
    'SE': 'Southeast',
    'SW': 'Southwest',
}


def expand_address_with_street_types(address: str, street_types: Dict[str, str]) -> str:
    """
    Expand abbreviations in an address for TTS.
    Converts address numbers to dispatch-style pronunciation.
    
    Args:
        address: The address string
        street_types: Dict mapping abbreviation -> expansion (from DB)
    
    Examples:
        "123 Main St" -> "one twenty-three Main Street"
        "456 N Oak Ave" -> "four fifty-six North Oak Avenue"
        "1146 Valley Rd" -> "eleven forty-six Valley Road"
        "2300 W Chester Pike" -> "twenty-three hundred West Chester Pike"
    """
    if not address:
        return ""
    
    words = address.split()
    result = []
    address_number_done = False
    
    for i, word in enumerate(words):
        upper = word.upper().rstrip('.,')
        
        # Convert leading address number(s) to spoken words
        # Address numbers are typically the first token(s), possibly hyphenated (e.g., "123-A")
        if not address_number_done and i == 0:
            # Handle hyphenated address numbers like "123-A" or "1146-B"
            if '-' in word:
                parts = word.split('-', 1)
                if parts[0].isdigit():
                    num = int(parts[0])
                    spoken_num = address_number_to_words(num)
                    # Suffix after hyphen (e.g., "A", "B", "1/2")
                    suffix = parts[1]
                    if suffix.isalpha() and len(suffix) <= 2:
                        suffix = ' '.join(suffix.upper())  # "A" -> "A", "AB" -> "A B"
                    result.append(f"{spoken_num} {suffix}")
                    address_number_done = True
                    continue
            elif word.isdigit():
                num = int(word)
                result.append(address_number_to_words(num))
                address_number_done = True
                continue
            # Not a number, skip address number conversion
            address_number_done = True
        
        # Check if it's a direction (usually at start or after number)
        if upper in DIRECTIONS and (i == 0 or i == 1 or (i > 0 and words[i-1].isdigit())):
            result.append(DIRECTIONS[upper])
        # Check if it's a street type
        elif upper in street_types:
            result.append(street_types[upper])
        else:
            result.append(word)
    
    return ' '.join(result)


# =============================================================================
# DATABASE OPERATIONS
# =============================================================================

class TTSPreprocessor:
    """
    Handles TTS text preprocessing with database-backed unit mappings.
    """
    
    def __init__(self):
        # Cache for abbreviations to avoid repeated DB queries
        self._prefix_cache: Optional[Dict[str, str]] = None
        self._street_type_cache: Optional[Dict[str, str]] = None
        self._cache_loaded = False
    
    def _load_abbreviations_cache(self, db) -> None:
        """Load abbreviations from database into cache."""
        if self._cache_loaded:
            return
        
        self._prefix_cache = {}
        self._street_type_cache = {}
        
        try:
            from sqlalchemy import text
            
            result = db.execute(text(
                "SELECT category, abbreviation, spoken_as FROM tts_abbreviations"
            ))
            
            for row in result:
                category = row[0]
                abbrev = row[1].upper()
                spoken = row[2]
                
                if category == 'unit_prefix':
                    self._prefix_cache[abbrev] = spoken
                elif category == 'street_type':
                    self._street_type_cache[abbrev] = spoken
            
            self._cache_loaded = True
            logger.debug(f"Loaded {len(self._prefix_cache)} unit prefixes, {len(self._street_type_cache)} street types")
            
        except Exception as e:
            logger.warning(f"Error loading TTS abbreviations cache: {e}")
            self._prefix_cache = {}
            self._street_type_cache = {}
    
    def clear_cache(self) -> None:
        """Clear the abbreviations cache (call after DB updates)."""
        self._prefix_cache = None
        self._street_type_cache = None
        self._cache_loaded = False
    
    def get_prefix_map(self, db) -> Dict[str, str]:
        """Get unit prefix pronunciations from database."""
        self._load_abbreviations_cache(db)
        return self._prefix_cache or {}
    
    def get_street_type_map(self, db) -> Dict[str, str]:
        """Get street type expansions from database."""
        self._load_abbreviations_cache(db)
        return self._street_type_cache or {}
    
    def expand_address(self, db, address: str) -> str:
        """Expand address abbreviations using DB-backed street types."""
        street_types = self.get_street_type_map(db)
        return expand_address_with_street_types(address, street_types)
    
    def generate_spoken_guess(self, db, unit_id: str, station_digits: int = 2) -> str:
        """Generate spoken guess using DB-backed prefix map."""
        prefix_map = self.get_prefix_map(db)
        return generate_spoken_guess_with_prefixes(unit_id, prefix_map, station_digits)
    
    async def get_unit_spoken(self, db, cad_unit_id: str, incident_id: int = None) -> str:
        """
        Get the spoken pronunciation for a CAD unit ID.
        If not in database, auto-creates with best guess and flags for review.
        
        Args:
            db: Database session
            cad_unit_id: The unit ID from CAD (e.g., "ENG481")
            incident_id: Optional incident ID where this unit was first seen
        
        Returns:
            Spoken pronunciation string
        """
        if not cad_unit_id:
            return ""
        
        cad_unit_id = cad_unit_id.upper().strip()
        
        try:
            from sqlalchemy import text
            
            # Look up existing mapping
            result = db.execute(text(
                "SELECT spoken_as, needs_review FROM tts_unit_mappings WHERE cad_unit_id = :unit_id"
            ), {"unit_id": cad_unit_id})
            row = result.fetchone()
            
            if row:
                spoken_as = row[0]
                if spoken_as:
                    return spoken_as
                # Has entry but no spoken_as yet - generate one
                spoken_as = self.generate_spoken_guess(db, cad_unit_id)
                db.execute(text(
                    "UPDATE tts_unit_mappings SET spoken_as = :spoken WHERE cad_unit_id = :unit_id"
                ), {"spoken": spoken_as, "unit_id": cad_unit_id})
                db.commit()
                return spoken_as
            
            # Not found - auto-create with best guess
            spoken_as = self.generate_spoken_guess(db, cad_unit_id)
            
            # Check if this unit is one of ours (in apparatus table)
            apparatus_result = db.execute(text("""
                SELECT id FROM apparatus 
                WHERE UPPER(cad_unit_id) = :unit_id 
                   OR UPPER(unit_designator) = :unit_id
                   OR :unit_id = ANY(SELECT UPPER(unnest(cad_unit_aliases)))
                LIMIT 1
            """), {"unit_id": cad_unit_id})
            apparatus_row = apparatus_result.fetchone()
            apparatus_id = apparatus_row[0] if apparatus_row else None
            
            # Insert new mapping
            db.execute(text("""
                INSERT INTO tts_unit_mappings (cad_unit_id, spoken_as, needs_review, apparatus_id, first_seen_incident_id)
                VALUES (:unit_id, :spoken, true, :apparatus_id, :incident_id)
                ON CONFLICT (cad_unit_id) DO NOTHING
            """), {
                "unit_id": cad_unit_id,
                "spoken": spoken_as,
                "apparatus_id": apparatus_id,
                "incident_id": incident_id
            })
            db.commit()
            
            logger.info(f"Auto-created TTS mapping: {cad_unit_id} -> '{spoken_as}' (needs review)")
            
            return spoken_as
            
        except Exception as e:
            logger.warning(f"Error getting unit spoken form for {cad_unit_id}: {e}")
            # Fallback to generated guess without DB
            prefix_map = self.get_prefix_map(db) if db else {}
            return generate_spoken_guess_with_prefixes(cad_unit_id, prefix_map)
    
    async def get_units_spoken(self, db, cad_unit_ids: List[str], incident_id: int = None) -> List[str]:
        """
        Get spoken pronunciations for multiple units.
        """
        result = []
        for unit_id in cad_unit_ids:
            spoken = await self.get_unit_spoken(db, unit_id, incident_id)
            if spoken:
                result.append(spoken)
        return result
    
    def get_field_settings(self, db) -> Dict[str, dict]:
        """
        Get TTS field settings from database.
        Returns dict keyed by field_id.
        """
        defaults = {
            'units': {'pause_after': 'medium', 'prefix': None, 'options': {'max_units': 5, 'join_word': 'and'}},
            'call_type': {'pause_after': 'medium', 'prefix': None, 'options': {}},
            'subtype': {'pause_after': 'short', 'prefix': None, 'options': {}},
            'box': {'pause_after': 'short', 'prefix': 'Box', 'options': {}},
            'address': {'pause_after': 'medium', 'prefix': None, 'options': {'expand_street_types': True}},
            'cross_streets': {'pause_after': 'short', 'prefix': 'between', 'options': {}},
            'municipality': {'pause_after': 'short', 'prefix': None, 'options': {}},
            'development': {'pause_after': 'short', 'prefix': None, 'options': {}},
        }
        
        if not db:
            return defaults
        
        try:
            from sqlalchemy import text
            import json
            
            result = db.execute(text(
                "SELECT field_id, pause_after, prefix, suffix, options FROM tts_field_settings"
            ))
            
            for row in result:
                field_id = row[0]
                if field_id in defaults:
                    raw_options = row[4]
                    if isinstance(raw_options, dict):
                        options = raw_options
                    elif raw_options:
                        options = json.loads(raw_options)
                    else:
                        options = {}
                    defaults[field_id] = {
                        'pause_after': row[1] or 'medium',
                        'prefix': row[2],
                        'suffix': row[3],
                        'options': options,
                    }
            
        except Exception as e:
            logger.warning(f"Error loading TTS field settings: {e}")
        
        return defaults
    
    def get_pause_punctuation(self, pause_style: str) -> str:
        """
        Get punctuation for a pause style.
        
        Args:
            pause_style: 'none', 'short', 'medium', 'long'
        
        Returns:
            Punctuation string that Piper interprets as a pause
        """
        PAUSE_MAP = {
            'none': '',
            'short': ',',      # ~200ms
            'medium': '.',     # ~400ms  
            'long': '...',     # ~600ms
        }
        return PAUSE_MAP.get(pause_style, '.')
    
    def format_with_pauses(self, parts: List[Tuple[str, str]], default_pause: str = 'medium') -> str:
        """
        Format parts with appropriate pause punctuation.
        
        Args:
            parts: List of (text, pause_style) tuples
            default_pause: Default pause style if not specified
        
        Returns:
            Formatted string with punctuation
        """
        if not parts:
            return ""
        
        result_parts = []
        for i, (text, pause_style) in enumerate(parts):
            if not text:
                continue
            
            text = text.strip()
            
            # Use specified pause or default
            pause = pause_style or default_pause
            punct = self.get_pause_punctuation(pause)
            
            # Don't add punctuation after the last part (we'll add a period at the end)
            if i == len(parts) - 1:
                result_parts.append(text)
            else:
                result_parts.append(text + punct)
        
        if not result_parts:
            return ""
        
        # Join with space and ensure ends with period
        result = ' '.join(result_parts)
        if not result.endswith(('.', '!', '?')):
            result += '.'
        
        return result
    
    async def get_pending_review_count(self, db) -> int:
        """Get count of unit mappings needing review."""
        try:
            from sqlalchemy import text
            result = db.execute(text(
                "SELECT COUNT(*) FROM tts_unit_mappings WHERE needs_review = true"
            ))
            row = result.fetchone()
            return row[0] if row else 0
        except Exception as e:
            logger.warning(f"Error getting pending review count: {e}")
            return 0


# Singleton instance
tts_preprocessor = TTSPreprocessor()
