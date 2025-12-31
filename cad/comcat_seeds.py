"""
ComCat Seed Data for ML Training Bootstrap
Created: 2025-12-31
Updated: 2025-12-31 - v2.0: Added operator_type for context-aware learning

These seed examples bootstrap the Random Forest classifier before any
officer corrections are available. Patterns are derived from Chester County
CAD event comments and fire service terminology.

v2.0 adds operator_type to each example, allowing the model to learn
context like "calltaker comments tend to be caller info" naturally.

Categories:
- CALLER: Dispatch/caller information from 911/calltakers
- TACTICAL: Command decisions, benchmarks, accountability
- OPERATIONS: Fireground operations, equipment, utilities
- UNIT: Unit status updates, crew counts, staging
- OTHER: Miscellaneous, external agencies, non-categorized

Operator Types:
- CALLTAKER: 911 call taker (ct##)
- DISPATCHER: Fire dispatcher (fd##)
- UNIT: Unit/apparatus ($ENG48, $CHF48)
- SYSTEM: CAD system automated
- UNKNOWN: Unable to determine
"""

# =============================================================================
# VALID VALUES
# =============================================================================

VALID_OPERATOR_TYPES = ["CALLTAKER", "DISPATCHER", "UNIT", "SYSTEM", "UNKNOWN"]

CATEGORY_INFO = {
    "CALLER": {
        "label": "Caller Information",
        "description": "Information from 911 callers and dispatch",
        "color": "#3B82F6",  # Blue
        "icon": "phone"
    },
    "TACTICAL": {
        "label": "Command & Tactical",
        "description": "Command decisions, benchmarks, accountability",
        "color": "#EF4444",  # Red
        "icon": "shield"
    },
    "OPERATIONS": {
        "label": "Operations",
        "description": "Fireground operations, equipment, utilities",
        "color": "#F59E0B",  # Amber
        "icon": "wrench"
    },
    "UNIT": {
        "label": "Unit Activity",
        "description": "Unit status updates, crew counts, staging",
        "color": "#10B981",  # Green
        "icon": "truck"
    },
    "OTHER": {
        "label": "Other",
        "description": "Miscellaneous, external agencies",
        "color": "#6B7280",  # Gray
        "icon": "dots"
    }
}

VALID_CATEGORIES = list(CATEGORY_INFO.keys())

# =============================================================================
# SEED EXAMPLES v2: (text, operator_type, category)
# The operator_type helps the model learn contextual patterns
# =============================================================================

SEED_EXAMPLES_V2 = [
    # =========================================================================
    # CALLER - Primarily from calltakers, sometimes relayed by dispatchers
    # =========================================================================
    # Calltaker entering caller info (most common)
    ("HOUSE ON FIRE", "CALLTAKER", "CALLER"),
    ("FLAMES SHOWING", "CALLTAKER", "CALLER"),
    ("FLAMES VISIBLE", "CALLTAKER", "CALLER"),
    ("SMOKE COMING FROM", "CALLTAKER", "CALLER"),
    ("SMOKE SHOWING", "CALLTAKER", "CALLER"),
    ("HEAVY SMOKE", "CALLTAKER", "CALLER"),
    ("BLACK SMOKE", "CALLTAKER", "CALLER"),
    ("FIRE IN THE", "CALLTAKER", "CALLER"),
    ("BURNING", "CALLTAKER", "CALLER"),
    ("EVERYONE IS OUT", "CALLTAKER", "CALLER"),
    ("EVERYONE OUT OF THE HOUSE", "CALLTAKER", "CALLER"),
    ("ALL OCCUPANTS OUT", "CALLTAKER", "CALLER"),
    ("OCCUPANTS EVACUATED", "CALLTAKER", "CALLER"),
    ("NO ONE INSIDE", "CALLTAKER", "CALLER"),
    ("PEOPLE STILL INSIDE", "CALLTAKER", "CALLER"),
    ("PERSON TRAPPED", "CALLTAKER", "CALLER"),
    ("CALLER STATES", "CALLTAKER", "CALLER"),
    ("CALLER ADVISES", "CALLTAKER", "CALLER"),
    ("CALLER REPORTS", "CALLTAKER", "CALLER"),
    ("RP STATES", "CALLTAKER", "CALLER"),
    ("RP ADVISED", "CALLTAKER", "CALLER"),
    ("COMPLAINANT STATES", "CALLTAKER", "CALLER"),
    ("SMELL OF SMOKE", "CALLTAKER", "CALLER"),
    ("ODOR OF SMOKE", "CALLTAKER", "CALLER"),
    ("SMELLS LIKE SOMETHING BURNING", "CALLTAKER", "CALLER"),
    ("FIRE ALARM SOUNDING", "CALLTAKER", "CALLER"),
    ("ALARM GOING OFF", "CALLTAKER", "CALLER"),
    ("SMOKE DETECTOR ACTIVATED", "CALLTAKER", "CALLER"),
    ("UNKNOWN TYPE FIRE", "CALLTAKER", "CALLER"),
    ("ELECTRICAL FIRE", "CALLTAKER", "CALLER"),
    ("CHIMNEY FIRE", "CALLTAKER", "CALLER"),
    ("KITCHEN FIRE", "CALLTAKER", "CALLER"),
    ("GREASE FIRE", "CALLTAKER", "CALLER"),
    ("CAR ON FIRE", "CALLTAKER", "CALLER"),
    ("VEHICLE FIRE", "CALLTAKER", "CALLER"),
    ("BRUSH FIRE", "CALLTAKER", "CALLER"),
    ("WOODS ON FIRE", "CALLTAKER", "CALLER"),
    ("DIFFICULTY BREATHING", "CALLTAKER", "CALLER"),
    ("CHEST PAIN", "CALLTAKER", "CALLER"),
    ("FALL VICTIM", "CALLTAKER", "CALLER"),
    ("UNCONSCIOUS", "CALLTAKER", "CALLER"),
    ("NOT BREATHING", "CALLTAKER", "CALLER"),
    ("UNRESPONSIVE", "CALLTAKER", "CALLER"),
    ("CARDIAC ARREST", "CALLTAKER", "CALLER"),
    ("CHOKING", "CALLTAKER", "CALLER"),
    ("BLEEDING", "CALLTAKER", "CALLER"),
    ("INJURED PERSON", "CALLTAKER", "CALLER"),
    ("ACCIDENT WITH INJURIES", "CALLTAKER", "CALLER"),
    ("ENTRAPMENT", "CALLTAKER", "CALLER"),
    ("WIRES DOWN", "CALLTAKER", "CALLER"),
    ("TRANSFORMER BLEW", "CALLTAKER", "CALLER"),
    ("EXPLOSION", "CALLTAKER", "CALLER"),
    ("GAS LEAK", "CALLTAKER", "CALLER"),
    ("SMELL OF GAS", "CALLTAKER", "CALLER"),
    ("CARBON MONOXIDE DETECTOR", "CALLTAKER", "CALLER"),
    ("CO ALARM", "CALLTAKER", "CALLER"),
    # Dispatcher relaying caller info updates
    ("UPDATE FROM CALLER", "DISPATCHER", "CALLER"),
    ("ADDITIONAL CALLER INFO", "DISPATCHER", "CALLER"),
    ("CALLER NOW SAYS", "DISPATCHER", "CALLER"),
    ("CALLER UPDATE", "DISPATCHER", "CALLER"),
    ("2ND CALLER CONFIRMS", "DISPATCHER", "CALLER"),
    
    # =========================================================================
    # TACTICAL - Typically from dispatcher relaying command/unit info
    # =========================================================================
    ("Command Established", "DISPATCHER", "TACTICAL"),
    ("COMMAND ESTABLISHED", "DISPATCHER", "TACTICAL"),
    ("CMD EST", "DISPATCHER", "TACTICAL"),
    ("Command Established for set Fire Incident Command Times", "SYSTEM", "TACTICAL"),
    ("Fire Under Control", "DISPATCHER", "TACTICAL"),
    ("FIRE UNDER CONTROL", "DISPATCHER", "TACTICAL"),
    ("FUC", "DISPATCHER", "TACTICAL"),
    ("Fire Under Control at", "SYSTEM", "TACTICAL"),
    ("** Fire Under Control at", "SYSTEM", "TACTICAL"),
    ("FIRE KNOCKED DOWN", "DISPATCHER", "TACTICAL"),
    ("FIRE OUT", "DISPATCHER", "TACTICAL"),
    ("PAR CHECK", "DISPATCHER", "TACTICAL"),
    ("PAR COMPLETE", "DISPATCHER", "TACTICAL"),
    ("PARS CHECK COMPLETE", "DISPATCHER", "TACTICAL"),
    ("PARS COMPLETE", "DISPATCHER", "TACTICAL"),
    ("ALL ACCOUNTED FOR", "DISPATCHER", "TACTICAL"),
    ("ACCOUNTABILITY CHECK", "DISPATCHER", "TACTICAL"),
    ("Accountability/Start PAR", "SYSTEM", "TACTICAL"),
    ("HOLDING AIR PAR CHECK", "DISPATCHER", "TACTICAL"),
    ("ALL CLEAR", "DISPATCHER", "TACTICAL"),
    ("PRIMARY ALL CLEAR", "DISPATCHER", "TACTICAL"),
    ("SECONDARY ALL CLEAR", "DISPATCHER", "TACTICAL"),
    ("PRIMARY SEARCH COMPLETE", "DISPATCHER", "TACTICAL"),
    ("SECONDARY SEARCH COMPLETE", "DISPATCHER", "TACTICAL"),
    ("PAC", "DISPATCHER", "TACTICAL"),
    ("SAC", "DISPATCHER", "TACTICAL"),
    ("EVACUATE", "DISPATCHER", "TACTICAL"),
    ("EVACUATION", "DISPATCHER", "TACTICAL"),
    ("EVAC ORDERED", "DISPATCHER", "TACTICAL"),
    ("Evac Ordered for set Fire Incident Command Times", "SYSTEM", "TACTICAL"),
    ("EMERGENCY EVACUATION", "DISPATCHER", "TACTICAL"),
    ("MAYDAY", "DISPATCHER", "TACTICAL"),
    ("MAYDAY DECLARED", "DISPATCHER", "TACTICAL"),
    ("RIT ACTIVATED", "DISPATCHER", "TACTICAL"),
    ("RIT DEPLOYED", "DISPATCHER", "TACTICAL"),
    ("RAPID INTERVENTION", "DISPATCHER", "TACTICAL"),
    ("LOSS STOP", "DISPATCHER", "TACTICAL"),
    ("LOSS STOPPED", "DISPATCHER", "TACTICAL"),
    ("FIRE INVESTIGATION", "DISPATCHER", "TACTICAL"),
    ("MARSHAL REQUESTED", "DISPATCHER", "TACTICAL"),
    ("FIRE MARSHAL", "DISPATCHER", "TACTICAL"),
    ("INVESTIGATOR REQUESTED", "DISPATCHER", "TACTICAL"),
    ("GOING DEFENSIVE", "DISPATCHER", "TACTICAL"),
    ("DEFENSIVE OPERATIONS", "DISPATCHER", "TACTICAL"),
    ("TRANSITIONING TO DEFENSIVE", "DISPATCHER", "TACTICAL"),
    ("OFFENSIVE OPERATIONS", "DISPATCHER", "TACTICAL"),
    ("SIZE UP", "DISPATCHER", "TACTICAL"),
    ("360 COMPLETE", "DISPATCHER", "TACTICAL"),
    ("ASSUMING COMMAND", "DISPATCHER", "TACTICAL"),
    ("TRANSFERRING COMMAND", "DISPATCHER", "TACTICAL"),
    ("COMMAND TRANSFERRED", "DISPATCHER", "TACTICAL"),
    # Unit reporting tactical info
    ("COMMAND ESTABLISHED", "UNIT", "TACTICAL"),
    ("ASSUMING COMMAND", "UNIT", "TACTICAL"),
    ("PAR COMPLETE", "UNIT", "TACTICAL"),
    ("FIRE UNDER CONTROL", "UNIT", "TACTICAL"),
    ("PRIMARY ALL CLEAR", "UNIT", "TACTICAL"),
    
    # =========================================================================
    # OPERATIONS - From dispatcher or unit reporting ops activity
    # =========================================================================
    ("HYDRANT", "DISPATCHER", "OPERATIONS"),
    ("CATCHING HYDRANT", "DISPATCHER", "OPERATIONS"),
    ("HYDRANT SECURED", "DISPATCHER", "OPERATIONS"),
    ("WATER SUPPLY", "DISPATCHER", "OPERATIONS"),
    ("WATER SUPPLY ESTABLISHED", "DISPATCHER", "OPERATIONS"),
    ("SUPPLY LINE", "DISPATCHER", "OPERATIONS"),
    ("LDH", "DISPATCHER", "OPERATIONS"),
    ("INTERIOR OPERATIONS", "DISPATCHER", "OPERATIONS"),
    ("INTERIOR OPS", "DISPATCHER", "OPERATIONS"),
    ("GOING INTERIOR", "DISPATCHER", "OPERATIONS"),
    ("MAKING ENTRY", "DISPATCHER", "OPERATIONS"),
    ("EXTERIOR OPERATIONS", "DISPATCHER", "OPERATIONS"),
    ("OVERHAUL", "DISPATCHER", "OPERATIONS"),
    ("EXTENSIVE OVERHAUL", "DISPATCHER", "OPERATIONS"),
    ("OVERHAUL IN PROGRESS", "DISPATCHER", "OPERATIONS"),
    ("CONTINUING OVERHAUL", "DISPATCHER", "OPERATIONS"),
    ("VENTILATION", "DISPATCHER", "OPERATIONS"),
    ("VERTICAL VENTILATION", "DISPATCHER", "OPERATIONS"),
    ("HORIZONTAL VENTILATION", "DISPATCHER", "OPERATIONS"),
    ("PPV", "DISPATCHER", "OPERATIONS"),
    ("POSITIVE PRESSURE", "DISPATCHER", "OPERATIONS"),
    ("LINES IN SERVICE", "DISPATCHER", "OPERATIONS"),
    ("LINES I S", "DISPATCHER", "OPERATIONS"),
    ("2 LINES", "DISPATCHER", "OPERATIONS"),
    ("LINE IN OPERATION", "DISPATCHER", "OPERATIONS"),
    ("HAND LINE", "DISPATCHER", "OPERATIONS"),
    ("ATTACK LINE", "DISPATCHER", "OPERATIONS"),
    ("BACKUP LINE", "DISPATCHER", "OPERATIONS"),
    ("LADDER TO ROOF", "DISPATCHER", "OPERATIONS"),
    ("LADDER DEPLOYED", "DISPATCHER", "OPERATIONS"),
    ("GROUND LADDERS", "DISPATCHER", "OPERATIONS"),
    ("AERIAL IN SERVICE", "DISPATCHER", "OPERATIONS"),
    ("SEARCH IN PROGRESS", "DISPATCHER", "OPERATIONS"),
    ("PRIMARY SEARCH", "DISPATCHER", "OPERATIONS"),
    ("SECONDARY SEARCH", "DISPATCHER", "OPERATIONS"),
    ("SEARCHING", "DISPATCHER", "OPERATIONS"),
    ("SALVAGE", "DISPATCHER", "OPERATIONS"),
    ("SALVAGE OPERATIONS", "DISPATCHER", "OPERATIONS"),
    ("UTILITIES SECURED", "DISPATCHER", "OPERATIONS"),
    ("UTILITIES OFF", "DISPATCHER", "OPERATIONS"),
    ("GAS SHUT OFF", "DISPATCHER", "OPERATIONS"),
    ("GAS SECURED", "DISPATCHER", "OPERATIONS"),
    ("ELECTRIC SECURED", "DISPATCHER", "OPERATIONS"),
    ("ELECTRIC OFF", "DISPATCHER", "OPERATIONS"),
    ("POWER OFF", "DISPATCHER", "OPERATIONS"),
    ("PECO", "DISPATCHER", "OPERATIONS"),
    ("PECO NOTIFIED", "DISPATCHER", "OPERATIONS"),
    ("PECO ON SCENE", "DISPATCHER", "OPERATIONS"),
    ("PPL NOTIFIED", "DISPATCHER", "OPERATIONS"),
    ("PPL ON SCENE", "DISPATCHER", "OPERATIONS"),
    ("PPL INCIDENT", "DISPATCHER", "OTHER"),  # utility tracking number
    ("WINDOWS", "DISPATCHER", "OPERATIONS"),
    ("BREAKING WINDOWS", "DISPATCHER", "OPERATIONS"),
    ("HOLES IN ROOF", "DISPATCHER", "OPERATIONS"),
    ("CUTTING ROOF", "DISPATCHER", "OPERATIONS"),
    ("ROOF OPENED", "DISPATCHER", "OPERATIONS"),
    ("BRING EXTRA", "DISPATCHER", "OPERATIONS"),
    ("NEED ADDITIONAL", "DISPATCHER", "OPERATIONS"),
    ("FOAM", "DISPATCHER", "OPERATIONS"),
    ("FOAM OPERATION", "DISPATCHER", "OPERATIONS"),
    ("CLASS B FOAM", "DISPATCHER", "OPERATIONS"),
    ("REHAB", "DISPATCHER", "OPERATIONS"),
    ("REHAB ESTABLISHED", "DISPATCHER", "OPERATIONS"),
    ("REHAB SECTOR", "DISPATCHER", "OPERATIONS"),
    ("CONTINUING INTERIOR", "DISPATCHER", "OPERATIONS"),
    ("OPS 2", "DISPATCHER", "OPERATIONS"),
    ("C OPS", "DISPATCHER", "OPERATIONS"),
    ("DIVISION A", "DISPATCHER", "OPERATIONS"),
    ("DIVISION B", "DISPATCHER", "OPERATIONS"),
    ("SECTOR", "DISPATCHER", "OPERATIONS"),
    ("GROUP", "DISPATCHER", "OPERATIONS"),
    ("EXPOSURE", "DISPATCHER", "OPERATIONS"),
    ("EXPOSURE PROTECTION", "DISPATCHER", "OPERATIONS"),
    ("CHECKING FOR EXTENSION", "DISPATCHER", "OPERATIONS"),
    ("EXTENSION FOUND", "DISPATCHER", "OPERATIONS"),
    ("NO EXTENSION", "DISPATCHER", "OPERATIONS"),
    ("OPENING WALLS", "DISPATCHER", "OPERATIONS"),
    ("PULLING CEILING", "DISPATCHER", "OPERATIONS"),
    ("HOT SPOTS", "DISPATCHER", "OPERATIONS"),
    ("THERMAL IMAGING", "DISPATCHER", "OPERATIONS"),
    ("TIC", "DISPATCHER", "OPERATIONS"),
    # Unit reporting operations
    ("HYDRANT SECURED", "UNIT", "OPERATIONS"),
    ("WATER SUPPLY ESTABLISHED", "UNIT", "OPERATIONS"),
    ("GOING INTERIOR", "UNIT", "OPERATIONS"),
    ("MAKING ENTRY", "UNIT", "OPERATIONS"),
    ("SEARCHING FIRST FLOOR", "UNIT", "OPERATIONS"),
    
    # =========================================================================
    # UNIT - Status updates, primarily from unit operators ($ENG48, etc)
    # =========================================================================
    ("Enroute with a crew of", "UNIT", "UNIT"),
    ("CREW OF", "UNIT", "UNIT"),
    ("RESPONDING", "UNIT", "UNIT"),
    ("RESPONDING WITH", "UNIT", "UNIT"),
    ("ON SCENE", "UNIT", "UNIT"),
    ("ARRIVED", "UNIT", "UNIT"),
    ("ARRIVING", "UNIT", "UNIT"),
    ("DELAYED", "UNIT", "UNIT"),
    ("DELAYED RESPONSE", "UNIT", "UNIT"),
    ("OUT OF SERVICE", "UNIT", "UNIT"),
    ("IN SERVICE", "UNIT", "UNIT"),
    ("AVAILABLE", "UNIT", "UNIT"),
    ("CLEAR", "UNIT", "UNIT"),
    ("RETURNING", "UNIT", "UNIT"),
    ("AT QUARTERS", "UNIT", "UNIT"),
    ("IN QUARTERS", "UNIT", "UNIT"),
    ("STAGING", "UNIT", "UNIT"),
    ("AT STAGING", "UNIT", "UNIT"),
    ("LEVEL 1 STAGING", "UNIT", "UNIT"),
    ("LEVEL 2 STAGING", "UNIT", "UNIT"),
    ("HOLDING", "UNIT", "UNIT"),
    ("STANDING BY", "UNIT", "UNIT"),
    ("REASSIGNED", "UNIT", "UNIT"),
    ("RELOCATED", "UNIT", "UNIT"),
    ("FILLING STATION", "UNIT", "UNIT"),
    ("STANDBY", "UNIT", "UNIT"),
    ("COVER ASSIGNMENT", "UNIT", "UNIT"),
    # Dispatcher noting unit status
    ("RESPONDING", "DISPATCHER", "UNIT"),
    ("DELAYED RESPONSE", "DISPATCHER", "UNIT"),
    ("ON SCENE", "DISPATCHER", "UNIT"),
    ("AVAILABLE", "DISPATCHER", "UNIT"),
    
    # =========================================================================
    # OTHER - Miscellaneous from various sources
    # =========================================================================
    ("CONTINUED", "DISPATCHER", "OTHER"),
    ("DISREGARD", "DISPATCHER", "OTHER"),
    ("CANCEL", "DISPATCHER", "OTHER"),
    ("CANCELLED", "DISPATCHER", "OTHER"),
    ("OK ON", "DISPATCHER", "OTHER"),
    ("BELFOR", "DISPATCHER", "OTHER"),
    ("SERVPRO", "DISPATCHER", "OTHER"),
    ("RED CROSS", "DISPATCHER", "OTHER"),
    ("RED CROSS NOTIFIED", "DISPATCHER", "OTHER"),
    ("CORONER", "DISPATCHER", "OTHER"),
    ("CORONER REQUESTED", "DISPATCHER", "OTHER"),
    ("MEDICAL EXAMINER", "DISPATCHER", "OTHER"),
    ("POLICE ON SCENE", "DISPATCHER", "OTHER"),
    ("PD ON SCENE", "DISPATCHER", "OTHER"),
    ("STATE POLICE", "DISPATCHER", "OTHER"),
    ("OWNER NOTIFIED", "DISPATCHER", "OTHER"),
    ("PROPERTY OWNER", "DISPATCHER", "OTHER"),
    ("TENANT", "DISPATCHER", "OTHER"),
    ("KEYHOLDER", "DISPATCHER", "OTHER"),
    ("ALARM COMPANY", "DISPATCHER", "OTHER"),
    ("CENTRAL STATION", "DISPATCHER", "OTHER"),
    ("FALSE ALARM", "DISPATCHER", "OTHER"),
    ("GOOD INTENT", "DISPATCHER", "OTHER"),
    ("NOTHING FOUND", "DISPATCHER", "OTHER"),
    ("UNFOUNDED", "DISPATCHER", "OTHER"),
    ("NO FIRE", "DISPATCHER", "OTHER"),
    ("NO SMOKE", "DISPATCHER", "OTHER"),
    ("REFERRED TO", "DISPATCHER", "OTHER"),
    ("TURNED OVER TO", "DISPATCHER", "OTHER"),
    ("MUTUAL AID", "DISPATCHER", "OTHER"),
    ("SPECIAL SERVICE", "DISPATCHER", "OTHER"),
    ("ASSIST", "DISPATCHER", "OTHER"),
    ("PUBLIC ASSIST", "DISPATCHER", "OTHER"),
    ("LIFT ASSIST", "DISPATCHER", "OTHER"),
    ("SUBMITTED ELECTRONICALLY", "DISPATCHER", "OTHER"),
    ("INCIDENT NUMBER", "DISPATCHER", "OTHER"),
    # Calltaker OTHER
    ("CALL DISCONNECTED", "CALLTAKER", "OTHER"),
    ("NO ANSWER ON CALLBACK", "CALLTAKER", "OTHER"),
    # System noise that might slip through
    ("Tracking device", "SYSTEM", "OTHER"),
    ("timer expired", "SYSTEM", "OTHER"),
    ("ProQA Case Entry", "SYSTEM", "OTHER"),
]

# Legacy v1 examples for backward compatibility
SEED_EXAMPLES = [(text, cat) for text, _, cat in SEED_EXAMPLES_V2]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_seed_data():
    """Return v1 format: (texts, categories) tuple."""
    texts = [ex[0] for ex in SEED_EXAMPLES]
    categories = [ex[1] for ex in SEED_EXAMPLES]
    return texts, categories


def get_seed_data_v2():
    """Return v2 format: List of (text, operator_type, category) tuples."""
    return SEED_EXAMPLES_V2


def get_seed_count_by_category():
    """Return count of seed examples per category."""
    counts = {cat: 0 for cat in VALID_CATEGORIES}
    for _, _, category in SEED_EXAMPLES_V2:
        counts[category] += 1
    return counts


def get_seed_count_by_operator():
    """Return count of seed examples per operator type."""
    counts = {op: 0 for op in VALID_OPERATOR_TYPES}
    for _, op_type, _ in SEED_EXAMPLES_V2:
        counts[op_type] += 1
    return counts


def validate_seeds():
    """Validate that all seed categories and operator types are valid."""
    invalid = []
    for text, op_type, category in SEED_EXAMPLES_V2:
        if category not in VALID_CATEGORIES:
            invalid.append((text, op_type, category, "invalid category"))
        if op_type not in VALID_OPERATOR_TYPES:
            invalid.append((text, op_type, category, "invalid operator"))
    return invalid


if __name__ == "__main__":
    print(f"Total seed examples: {len(SEED_EXAMPLES_V2)}")
    
    print("\nBy category:")
    for cat, count in get_seed_count_by_category().items():
        print(f"  {cat}: {count}")
    
    print("\nBy operator type:")
    for op, count in get_seed_count_by_operator().items():
        print(f"  {op}: {count}")
    
    invalid = validate_seeds()
    if invalid:
        print(f"\nWARNING: {len(invalid)} invalid entries found!")
        for entry in invalid:
            print(f"  {entry}")
    else:
        print("\nAll seed entries valid.")
