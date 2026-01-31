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

# Common unit prefixes and their default pronunciations
DEFAULT_UNIT_PRONUNCIATIONS = {
    'ENG': 'Engine',
    'TWR': 'Tower',
    'LAD': 'Ladder',
    'TRK': 'Truck',
    'RES': 'Rescue',
    'SQD': 'Squad',
    'AMB': 'Ambulance',
    'MED': 'Medic',
    'MIC': 'M I C U',
    'BLS': 'B L S',
    'ALS': 'A L S',
    'QRS': 'Q R S',
    'CHF': 'Chief',
    'BC': 'Battalion Chief',
    'DC': 'Deputy Chief',
    'CAR': 'Car',
    'UT': 'Utility',
    'UTL': 'Utility',
    'TAN': 'Tanker',
    'TNK': 'Tanker',
    'BR': 'Brush',
    'BRU': 'Brush',
    'BOT': 'Boat',
    'HAZ': 'Hazmat',
    'HM': 'Hazmat',
    'AIR': 'Air',
    'STA': 'Station',
    'FIR': 'Fire',
}


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


def generate_spoken_guess(unit_id: str, station_digits: int = 2) -> str:
    """
    Generate a best-guess pronunciation for a unit ID.
    Used when auto-creating mappings for unknown units.
    
    Args:
        unit_id: The CAD unit ID (e.g., "ENG481")
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
    
    # Get spoken prefix
    spoken_prefix = DEFAULT_UNIT_PRONUNCIATIONS.get(prefix, spell_out_letters(prefix))
    
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
# DATABASE OPERATIONS
# =============================================================================

class TTSPreprocessor:
    """
    Handles TTS text preprocessing with database-backed unit mappings.
    """
    
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
                spoken_as = generate_spoken_guess(cad_unit_id)
                db.execute(text(
                    "UPDATE tts_unit_mappings SET spoken_as = :spoken WHERE cad_unit_id = :unit_id"
                ), {"spoken": spoken_as, "unit_id": cad_unit_id})
                db.commit()
                return spoken_as
            
            # Not found - auto-create with best guess
            spoken_as = generate_spoken_guess(cad_unit_id)
            
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
            return generate_spoken_guess(cad_unit_id)
    
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
                    defaults[field_id] = {
                        'pause_after': row[1] or 'medium',
                        'prefix': row[2],
                        'suffix': row[3],
                        'options': json.loads(row[4]) if row[4] else {},
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


# =============================================================================
# ADDRESS FORMATTING
# =============================================================================

# Street type expansions
STREET_TYPES = {
    'RD': 'Road',
    'ST': 'Street',
    'AVE': 'Avenue',
    'AV': 'Avenue',
    'DR': 'Drive',
    'LN': 'Lane',
    'CT': 'Court',
    'CIR': 'Circle',
    'BLVD': 'Boulevard',
    'PL': 'Place',
    'TER': 'Terrace',
    'TERR': 'Terrace',
    'WAY': 'Way',
    'PKY': 'Parkway',
    'PKWY': 'Parkway',
    'HWY': 'Highway',
    'RT': 'Route',
    'RTE': 'Route',
}

# Direction expansions
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


def expand_address(address: str, expand_street_types: bool = True) -> str:
    """
    Expand abbreviations in an address for TTS.
    
    Examples:
        "123 Main St" -> "123 Main Street"
        "456 N Oak Ave" -> "456 North Oak Avenue"
    """
    if not address:
        return ""
    
    words = address.split()
    result = []
    
    for i, word in enumerate(words):
        upper = word.upper().rstrip('.,')
        
        # Check if it's a direction (usually at start or after number)
        if upper in DIRECTIONS and (i == 0 or i == 1 or (i > 0 and words[i-1].isdigit())):
            result.append(DIRECTIONS[upper])
        # Check if it's a street type (usually at end)
        elif expand_street_types and upper in STREET_TYPES:
            result.append(STREET_TYPES[upper])
        else:
            result.append(word)
    
    return ' '.join(result)


# =============================================================================
# TESTING
# =============================================================================

if __name__ == "__main__":
    print("TTS Preprocessing Tests")
    print("=" * 50)
    
    print("\nNumber to words:")
    for n in [0, 1, 5, 10, 12, 19, 20, 21, 48, 69, 99]:
        print(f"  {n} -> '{number_to_words(n)}'")
    
    print("\nDigits to words:")
    for d in ["1", "12", "481", "2441"]:
        print(f"  '{d}' -> '{digits_to_words(d)}'")
    
    print("\nUnit parsing (station_digits=2):")
    test_units = ["ENG481", "ENG48", "ENG01", "TWR48", "QRS48", "MIC2441", "CHF48", "48"]
    for unit in test_units:
        guess = generate_spoken_guess(unit, station_digits=2)
        print(f"  {unit:10} -> '{guess}'")
    
    print("\nUnit parsing (station_digits=3 for ambulance):")
    test_amb = ["MIC244", "MIC2441", "AMB891", "AMB8911"]
    for unit in test_amb:
        guess = generate_spoken_guess(unit, station_digits=3)
        print(f"  {unit:10} -> '{guess}'")
    
    print("\nAddress expansion:")
    test_addresses = [
        "123 Main St",
        "456 N Oak Ave",
        "789 Valley Rd",
        "100 S Market St",
    ]
    for addr in test_addresses:
        expanded = expand_address(addr)
        print(f"  '{addr}' -> '{expanded}'")
    
    print("\nPause formatting:")
    parts = [
        ("Engine forty-eight one", "medium"),
        ("Structure Fire", "medium"),
        ("123 Main Street", "long"),
    ]
    preprocessor = TTSPreprocessor()
    formatted = preprocessor.format_with_pauses(parts)
    print(f"  Parts: {parts}")
    print(f"  Result: '{formatted}'")
