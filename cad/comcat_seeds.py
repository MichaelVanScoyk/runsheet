"""
ComCat Seed Data for ML Training Bootstrap
Created: 2025-12-31

These seed examples bootstrap the Random Forest classifier before any
officer corrections are available. Patterns are derived from Chester County
CAD event comments and fire service terminology.

Categories:
- CALLER: Dispatch/caller information from 911/calltakers
- TACTICAL: Command decisions, benchmarks, accountability
- OPERATIONS: Fireground operations, equipment, utilities
- UNIT: Unit status updates, crew counts, staging
- OTHER: Miscellaneous, external agencies, non-categorized

Each tuple is (comment_text, category). The text should be representative
of real CAD comments - partial matches work because ML uses TF-IDF.
"""

# =============================================================================
# SEED EXAMPLES BY CATEGORY
# =============================================================================

SEED_EXAMPLES = [
    # =========================================================================
    # CALLER - Dispatch/caller information from 911
    # These are typically from calltakers (ct##) relaying caller info
    # =========================================================================
    ("HOUSE ON FIRE", "CALLER"),
    ("FLAMES SHOWING", "CALLER"),
    ("FLAMES VISIBLE", "CALLER"),
    ("SMOKE COMING FROM", "CALLER"),
    ("SMOKE SHOWING", "CALLER"),
    ("HEAVY SMOKE", "CALLER"),
    ("BLACK SMOKE", "CALLER"),
    ("FIRE IN THE", "CALLER"),
    ("BURNING", "CALLER"),
    ("EVERYONE IS OUT", "CALLER"),
    ("EVERYONE OUT OF THE HOUSE", "CALLER"),
    ("ALL OCCUPANTS OUT", "CALLER"),
    ("OCCUPANTS EVACUATED", "CALLER"),
    ("NO ONE INSIDE", "CALLER"),
    ("PEOPLE STILL INSIDE", "CALLER"),
    ("PERSON TRAPPED", "CALLER"),
    ("CALLER STATES", "CALLER"),
    ("CALLER ADVISES", "CALLER"),
    ("CALLER REPORTS", "CALLER"),
    ("RP STATES", "CALLER"),
    ("COMPLAINANT STATES", "CALLER"),
    ("SMELL OF SMOKE", "CALLER"),
    ("ODOR OF SMOKE", "CALLER"),
    ("SMELLS LIKE SOMETHING BURNING", "CALLER"),
    ("FIRE ALARM SOUNDING", "CALLER"),
    ("ALARM GOING OFF", "CALLER"),
    ("SMOKE DETECTOR ACTIVATED", "CALLER"),
    ("UNKNOWN TYPE FIRE", "CALLER"),
    ("ELECTRICAL FIRE", "CALLER"),
    ("CHIMNEY FIRE", "CALLER"),
    ("KITCHEN FIRE", "CALLER"),
    ("GREASE FIRE", "CALLER"),
    ("CAR ON FIRE", "CALLER"),
    ("VEHICLE FIRE", "CALLER"),
    ("BRUSH FIRE", "CALLER"),
    ("WOODS ON FIRE", "CALLER"),
    ("DIFFICULTY BREATHING", "CALLER"),
    ("CHEST PAIN", "CALLER"),
    ("FALL VICTIM", "CALLER"),
    ("UNCONSCIOUS", "CALLER"),
    ("NOT BREATHING", "CALLER"),
    ("UNRESPONSIVE", "CALLER"),
    ("CARDIAC ARREST", "CALLER"),
    ("CHOKING", "CALLER"),
    ("BLEEDING", "CALLER"),
    ("INJURED PERSON", "CALLER"),
    ("ACCIDENT WITH INJURIES", "CALLER"),
    ("ENTRAPMENT", "CALLER"),
    ("WIRES DOWN", "CALLER"),
    ("TRANSFORMER BLEW", "CALLER"),
    ("EXPLOSION", "CALLER"),
    ("GAS LEAK", "CALLER"),
    ("SMELL OF GAS", "CALLER"),
    ("CARBON MONOXIDE DETECTOR", "CALLER"),
    ("CO ALARM", "CALLER"),
    
    # =========================================================================
    # TACTICAL - Command decisions, benchmarks, accountability
    # These represent NERIS tactic timestamps and command operations
    # =========================================================================
    ("Command Established", "TACTICAL"),
    ("COMMAND ESTABLISHED", "TACTICAL"),
    ("CMD EST", "TACTICAL"),
    ("Command Established for set Fire Incident Command Times", "TACTICAL"),
    ("Fire Under Control", "TACTICAL"),
    ("FIRE UNDER CONTROL", "TACTICAL"),
    ("FUC", "TACTICAL"),
    ("Fire Under Control at", "TACTICAL"),
    ("** Fire Under Control at", "TACTICAL"),
    ("FIRE KNOCKED DOWN", "TACTICAL"),
    ("FIRE OUT", "TACTICAL"),
    ("PAR CHECK", "TACTICAL"),
    ("PAR COMPLETE", "TACTICAL"),
    ("PARS CHECK COMPLETE", "TACTICAL"),
    ("PARS COMPLETE", "TACTICAL"),
    ("ALL ACCOUNTED FOR", "TACTICAL"),
    ("ACCOUNTABILITY CHECK", "TACTICAL"),
    ("Accountability/Start PAR", "TACTICAL"),
    ("HOLDING AIR PAR CHECK", "TACTICAL"),
    ("ALL CLEAR", "TACTICAL"),
    ("PRIMARY ALL CLEAR", "TACTICAL"),
    ("SECONDARY ALL CLEAR", "TACTICAL"),
    ("PRIMARY SEARCH COMPLETE", "TACTICAL"),
    ("SECONDARY SEARCH COMPLETE", "TACTICAL"),
    ("PAC", "TACTICAL"),
    ("SAC", "TACTICAL"),
    ("EVACUATE", "TACTICAL"),
    ("EVACUATION", "TACTICAL"),
    ("EVAC ORDERED", "TACTICAL"),
    ("Evac Ordered for set Fire Incident Command Times", "TACTICAL"),
    ("EMERGENCY EVACUATION", "TACTICAL"),
    ("MAYDAY", "TACTICAL"),
    ("MAYDAY DECLARED", "TACTICAL"),
    ("RIT ACTIVATED", "TACTICAL"),
    ("RIT DEPLOYED", "TACTICAL"),
    ("RAPID INTERVENTION", "TACTICAL"),
    ("LOSS STOP", "TACTICAL"),
    ("LOSS STOPPED", "TACTICAL"),
    ("FIRE INVESTIGATION", "TACTICAL"),
    ("MARSHAL REQUESTED", "TACTICAL"),
    ("FIRE MARSHAL", "TACTICAL"),
    ("INVESTIGATOR REQUESTED", "TACTICAL"),
    ("GOING DEFENSIVE", "TACTICAL"),
    ("DEFENSIVE OPERATIONS", "TACTICAL"),
    ("TRANSITIONING TO DEFENSIVE", "TACTICAL"),
    ("OFFENSIVE OPERATIONS", "TACTICAL"),
    ("SIZE UP", "TACTICAL"),
    ("360 COMPLETE", "TACTICAL"),
    ("ASSUMING COMMAND", "TACTICAL"),
    ("TRANSFERRING COMMAND", "TACTICAL"),
    ("COMMAND TRANSFERRED", "TACTICAL"),
    
    # =========================================================================
    # OPERATIONS - Fireground operations, equipment, utilities
    # Physical actions and equipment deployment
    # =========================================================================
    ("HYDRANT", "OPERATIONS"),
    ("CATCHING HYDRANT", "OPERATIONS"),
    ("HYDRANT SECURED", "OPERATIONS"),
    ("WATER SUPPLY", "OPERATIONS"),
    ("WATER SUPPLY ESTABLISHED", "OPERATIONS"),
    ("SUPPLY LINE", "OPERATIONS"),
    ("LDH", "OPERATIONS"),
    ("INTERIOR OPERATIONS", "OPERATIONS"),
    ("INTERIOR OPS", "OPERATIONS"),
    ("GOING INTERIOR", "OPERATIONS"),
    ("MAKING ENTRY", "OPERATIONS"),
    ("EXTERIOR OPERATIONS", "OPERATIONS"),
    ("OVERHAUL", "OPERATIONS"),
    ("EXTENSIVE OVERHAUL", "OPERATIONS"),
    ("OVERHAUL IN PROGRESS", "OPERATIONS"),
    ("CONTINUING OVERHAUL", "OPERATIONS"),
    ("VENTILATION", "OPERATIONS"),
    ("VERTICAL VENTILATION", "OPERATIONS"),
    ("HORIZONTAL VENTILATION", "OPERATIONS"),
    ("PPV", "OPERATIONS"),
    ("POSITIVE PRESSURE", "OPERATIONS"),
    ("LINES IN SERVICE", "OPERATIONS"),
    ("LINES I S", "OPERATIONS"),
    ("2 LINES", "OPERATIONS"),
    ("LINE IN OPERATION", "OPERATIONS"),
    ("HAND LINE", "OPERATIONS"),
    ("ATTACK LINE", "OPERATIONS"),
    ("BACKUP LINE", "OPERATIONS"),
    ("LADDER TO ROOF", "OPERATIONS"),
    ("LADDER DEPLOYED", "OPERATIONS"),
    ("GROUND LADDERS", "OPERATIONS"),
    ("AERIAL IN SERVICE", "OPERATIONS"),
    ("SEARCH IN PROGRESS", "OPERATIONS"),
    ("PRIMARY SEARCH", "OPERATIONS"),
    ("SECONDARY SEARCH", "OPERATIONS"),
    ("SEARCHING", "OPERATIONS"),
    ("SALVAGE", "OPERATIONS"),
    ("SALVAGE OPERATIONS", "OPERATIONS"),
    ("UTILITIES SECURED", "OPERATIONS"),
    ("UTILITIES OFF", "OPERATIONS"),
    ("GAS SHUT OFF", "OPERATIONS"),
    ("GAS SECURED", "OPERATIONS"),
    ("ELECTRIC SECURED", "OPERATIONS"),
    ("ELECTRIC OFF", "OPERATIONS"),
    ("POWER OFF", "OPERATIONS"),
    ("PECO", "OPERATIONS"),
    ("PECO NOTIFIED", "OPERATIONS"),
    ("PECO ON SCENE", "OPERATIONS"),
    ("WINDOWS", "OPERATIONS"),
    ("BREAKING WINDOWS", "OPERATIONS"),
    ("HOLES IN ROOF", "OPERATIONS"),
    ("CUTTING ROOF", "OPERATIONS"),
    ("ROOF OPENED", "OPERATIONS"),
    ("BRING EXTRA", "OPERATIONS"),
    ("NEED ADDITIONAL", "OPERATIONS"),
    ("FOAM", "OPERATIONS"),
    ("FOAM OPERATION", "OPERATIONS"),
    ("CLASS B FOAM", "OPERATIONS"),
    ("REHAB", "OPERATIONS"),
    ("REHAB ESTABLISHED", "OPERATIONS"),
    ("REHAB SECTOR", "OPERATIONS"),
    ("CONTINUING INTERIOR", "OPERATIONS"),
    ("OPS 2", "OPERATIONS"),
    ("C OPS", "OPERATIONS"),
    ("DIVISION A", "OPERATIONS"),
    ("DIVISION B", "OPERATIONS"),
    ("SECTOR", "OPERATIONS"),
    ("GROUP", "OPERATIONS"),
    ("EXPOSURE", "OPERATIONS"),
    ("EXPOSURE PROTECTION", "OPERATIONS"),
    ("CHECKING FOR EXTENSION", "OPERATIONS"),
    ("EXTENSION FOUND", "OPERATIONS"),
    ("NO EXTENSION", "OPERATIONS"),
    ("OPENING WALLS", "OPERATIONS"),
    ("PULLING CEILING", "OPERATIONS"),
    ("HOT SPOTS", "OPERATIONS"),
    ("THERMAL IMAGING", "OPERATIONS"),
    ("TIC", "OPERATIONS"),
    
    # =========================================================================
    # UNIT - Unit status updates, crew counts, staging
    # These typically come from units ($ENG48, $RES48, etc.)
    # =========================================================================
    ("Enroute with a crew of", "UNIT"),
    ("CREW OF", "UNIT"),
    ("RESPONDING", "UNIT"),
    ("RESPONDING WITH", "UNIT"),
    ("ON SCENE", "UNIT"),
    ("ARRIVED", "UNIT"),
    ("ARRIVING", "UNIT"),
    ("DELAYED", "UNIT"),
    ("DELAYED RESPONSE", "UNIT"),
    ("OUT OF SERVICE", "UNIT"),
    ("IN SERVICE", "UNIT"),
    ("AVAILABLE", "UNIT"),
    ("CLEAR", "UNIT"),
    ("RETURNING", "UNIT"),
    ("AT QUARTERS", "UNIT"),
    ("IN QUARTERS", "UNIT"),
    ("STAGING", "UNIT"),
    ("AT STAGING", "UNIT"),
    ("LEVEL 1 STAGING", "UNIT"),
    ("LEVEL 2 STAGING", "UNIT"),
    ("HOLDING", "UNIT"),
    ("STANDING BY", "UNIT"),
    ("REASSIGNED", "UNIT"),
    ("RELOCATED", "UNIT"),
    ("FILLING STATION", "UNIT"),
    ("STANDBY", "UNIT"),
    ("COVER ASSIGNMENT", "UNIT"),
    
    # =========================================================================
    # OTHER - Miscellaneous, external agencies
    # Non-operational, administrative, or external coordination
    # =========================================================================
    ("CONTINUED", "OTHER"),
    ("DISREGARD", "OTHER"),
    ("CANCEL", "OTHER"),
    ("CANCELLED", "OTHER"),
    ("OK ON", "OTHER"),
    ("BELFOR", "OTHER"),
    ("SERVPRO", "OTHER"),
    ("RED CROSS", "OTHER"),
    ("RED CROSS NOTIFIED", "OTHER"),
    ("CORONER", "OTHER"),
    ("CORONER REQUESTED", "OTHER"),
    ("MEDICAL EXAMINER", "OTHER"),
    ("POLICE ON SCENE", "OTHER"),
    ("PD ON SCENE", "OTHER"),
    ("STATE POLICE", "OTHER"),
    ("OWNER NOTIFIED", "OTHER"),
    ("PROPERTY OWNER", "OTHER"),
    ("TENANT", "OTHER"),
    ("KEYHOLDER", "OTHER"),
    ("ALARM COMPANY", "OTHER"),
    ("CENTRAL STATION", "OTHER"),
    ("FALSE ALARM", "OTHER"),
    ("GOOD INTENT", "OTHER"),
    ("NOTHING FOUND", "OTHER"),
    ("UNFOUNDED", "OTHER"),
    ("NO FIRE", "OTHER"),
    ("NO SMOKE", "OTHER"),
    ("REFERRED TO", "OTHER"),
    ("TURNED OVER TO", "OTHER"),
    ("MUTUAL AID", "OTHER"),
    ("SPECIAL SERVICE", "OTHER"),
    ("ASSIST", "OTHER"),
    ("PUBLIC ASSIST", "OTHER"),
    ("LIFT ASSIST", "OTHER"),
]

# =============================================================================
# CATEGORY DESCRIPTIONS (for UI display)
# =============================================================================

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

# Valid categories for validation
VALID_CATEGORIES = list(CATEGORY_INFO.keys())

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_seed_data():
    """Return seed examples as (texts, categories) tuple for training."""
    texts = [example[0] for example in SEED_EXAMPLES]
    categories = [example[1] for example in SEED_EXAMPLES]
    return texts, categories


def get_seed_count_by_category():
    """Return count of seed examples per category."""
    counts = {cat: 0 for cat in VALID_CATEGORIES}
    for _, category in SEED_EXAMPLES:
        counts[category] += 1
    return counts


def validate_seeds():
    """Validate that all seed categories are valid."""
    invalid = []
    for text, category in SEED_EXAMPLES:
        if category not in VALID_CATEGORIES:
            invalid.append((text, category))
    return invalid


if __name__ == "__main__":
    # Quick validation when run directly
    print(f"Total seed examples: {len(SEED_EXAMPLES)}")
    print("\nBy category:")
    for cat, count in get_seed_count_by_category().items():
        print(f"  {cat}: {count}")
    
    invalid = validate_seeds()
    if invalid:
        print(f"\nWARNING: {len(invalid)} invalid categories found!")
        for text, cat in invalid:
            print(f"  '{text}' -> '{cat}'")
    else:
        print("\nAll seed categories valid.")
