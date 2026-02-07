#!/usr/bin/env python3
"""
Demo Environment Seeder for CADReport

Clones Glen Moore's production data into the demo tenant database,
anonymizes all PII (names, addresses, phone numbers, etc.), and creates
a test user account for prospects to explore.

Run manually:
    cd /opt/runsheet/scripts
    python3 seed_demo.py

Or via cron (daily at 3:00 AM):
    0 3 * * * cd /opt/runsheet/scripts && /usr/bin/python3 seed_demo.py >> /var/log/cadreport_demo_seed.log 2>&1

What it does:
    1. Ensures 'demo' tenant exists in cadreport_master
    2. Drops and recreates runsheet_demo database from runsheet_db dump
    3. Anonymizes all personnel (fake names, clear auth tokens)
    4. Renames apparatus from Station 48 -> Station 99
    5. Anonymizes incident addresses, caller info, narratives
    6. Randomizes mutual aid unit IDs
    7. Renames municipalities to fictional ones
    8. Updates branding to "Brookfield Fire Company, Station 99"
    9. Shifts all dates so most recent incident = yesterday
   10. Creates testuser/demo123 admin account
   11. Sets tenant password to demo123

Credentials:
    - Tenant login: demo / demo123
    - User login: testuser / demo123 (ADMIN role)
"""

import subprocess
import os
import sys
import re
import random
import hashlib
import secrets
import json
import logging
import base64
from datetime import datetime, timezone, timedelta, date

import psycopg2
import psycopg2.extras
import bcrypt

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SOURCE_DB = "runsheet_db"           # Glen Moore production
DEMO_DB = "runsheet_demo"           # Demo database
MASTER_DB = "cadreport_master"      # Master tenant registry

DEMO_SLUG = "demo"
DEMO_TENANT_NAME = "Brookfield Fire Company"
DEMO_TENANT_PASSWORD = "demo123"    # Tenant-level login

DEMO_USER_EMAIL = "testuser"        # Personnel login
DEMO_USER_PASSWORD = "demo123"
DEMO_USER_FIRST = "Demo"
DEMO_USER_LAST = "Admin"

DB_USER = "dashboard"
DB_PASSWORD = "dashboard"
DB_HOST = "localhost"

# Station number remapping
SOURCE_STATION = "48"
DEMO_STATION = "99"

PG_DUMP = "/usr/bin/pg_dump"
PSQL = "/usr/bin/psql"
CREATEDB = "/usr/bin/createdb"
DROPDB = "/usr/bin/dropdb"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("seed_demo")

# ---------------------------------------------------------------------------
# Fake name pools (common US first/last names, no real people)
# ---------------------------------------------------------------------------

FIRST_NAMES_MALE = [
    "James", "Robert", "John", "Michael", "David", "William", "Richard",
    "Joseph", "Thomas", "Christopher", "Daniel", "Matthew", "Anthony",
    "Mark", "Steven", "Paul", "Andrew", "Joshua", "Kenneth", "Kevin",
    "Brian", "George", "Timothy", "Ronald", "Edward", "Jason", "Jeffrey",
    "Ryan", "Jacob", "Gary", "Nicholas", "Eric", "Jonathan", "Stephen",
    "Larry", "Justin", "Scott", "Brandon", "Benjamin", "Samuel",
]

FIRST_NAMES_FEMALE = [
    "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth",
    "Susan", "Jessica", "Sarah", "Karen", "Lisa", "Nancy", "Betty",
    "Margaret", "Sandra", "Ashley", "Dorothy", "Kimberly", "Emily",
    "Donna", "Michelle", "Carol", "Amanda", "Melissa", "Deborah",
    "Stephanie", "Rebecca", "Sharon", "Laura", "Cynthia", "Kathleen",
    "Amy", "Angela", "Shirley", "Anna", "Brenda", "Pamela", "Nicole",
    "Emma", "Samantha",
]

FIRST_NAMES = FIRST_NAMES_MALE + FIRST_NAMES_FEMALE

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
    "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
    "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
    "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
    "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Phillips", "Evans", "Turner", "Parker", "Collins",
    "Edwards", "Stewart", "Morris", "Murphy", "Cook", "Rogers", "Morgan",
    "Peterson", "Cooper", "Reed", "Bailey", "Bell", "Howard", "Ward",
    "Cox", "Richardson", "Wood", "Watson", "Brooks", "Bennett", "Gray",
]

# Fictional street names for address anonymization
STREET_NAMES = [
    "Maple", "Oak", "Cedar", "Pine", "Elm", "Birch", "Walnut", "Chestnut",
    "Hickory", "Spruce", "Willow", "Sycamore", "Ash", "Poplar", "Cherry",
    "Laurel", "Holly", "Magnolia", "Dogwood", "Beech", "Hawthorn", "Juniper",
    "Redwood", "Cypress", "Hemlock", "Alder",
]

STREET_SUFFIXES = [
    "St", "Ave", "Rd", "Ln", "Dr", "Ct", "Blvd", "Way", "Pl", "Cir",
]

MUNICIPALITY_NAMES = [
    ("BROOK", "Brookfield", "Brookfield Township"),
    ("MAPLE", "Maplewood", "Maplewood Borough"),
    ("CEDAR", "Cedarville", "Cedarville Township"),
    ("SPRING", "Springfield", "Springfield Township"),
    ("OAKHIL", "Oak Hill", "Oak Hill Borough"),
    ("PINECR", "Pine Creek", "Pine Creek Township"),
    ("ELMWOD", "Elmwood", "Elmwood Township"),
    ("WILLOW", "Willowbrook", "Willowbrook Borough"),
    ("BIRCH", "Birchdale", "Birchdale Township"),
    ("HCKRY", "Hickory", "Hickory Township"),
    ("LAUREL", "Laurelton", "Laurelton Borough"),
    ("HOLLY", "Hollyfield", "Hollyfield Township"),
    ("SPRUCE", "Sprucewood", "Sprucewood Township"),
    ("CHERRY", "Cherry Hill", "Cherry Hill Township"),
    ("POPLAR", "Poplar Grove", "Poplar Grove Township"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_pg_env():
    """Environment dict with PGPASSWORD for subprocess calls."""
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD
    return env


def run_pg(cmd, check=True):
    """Run a PostgreSQL CLI command, return CompletedProcess."""
    result = subprocess.run(cmd, capture_output=True, text=True, env=get_pg_env())
    if check and result.returncode != 0:
        log.error(f"Command failed: {' '.join(cmd)}")
        log.error(f"stderr: {result.stderr}")
        raise RuntimeError(result.stderr)
    return result


def db_connect(dbname):
    """Return a psycopg2 connection to the given database."""
    return psycopg2.connect(
        dbname=dbname, user=DB_USER, password=DB_PASSWORD, host=DB_HOST
    )


def hash_tenant_password(password):
    """bcrypt hash for tenant-level password (cadreport_master.tenants)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def hash_personnel_password(password):
    """sha256+salt hash for personnel password (matches personnel.py pattern)."""
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hashed}"


def random_address():
    """Generate a random street address."""
    num = random.randint(100, 9999)
    street = random.choice(STREET_NAMES)
    suffix = random.choice(STREET_SUFFIXES)
    return f"{num} {street} {suffix}"


def random_phone():
    """Generate a random phone number."""
    return f"({random.randint(200,999)}) {random.randint(200,999)}-{random.randint(1000,9999)}"


def random_cross_streets():
    """Generate random cross streets."""
    s1 = random.choice(STREET_NAMES)
    s2 = random.choice(STREET_NAMES)
    while s2 == s1:
        s2 = random.choice(STREET_NAMES)
    sx1 = random.choice(STREET_SUFFIXES)
    sx2 = random.choice(STREET_SUFFIXES)
    return f"{s1} {sx1} / {s2} {sx2}"


def remap_unit_id(unit_id):
    """
    Remap a unit designator from Station 48 -> Station 99.
    ENG481 -> ENG991, RES48 -> RES99, CHF48 -> CHF99, 48QRS -> 99QRS, etc.
    """
    if not unit_id:
        return unit_id
    return unit_id.replace(SOURCE_STATION, DEMO_STATION)


def build_ma_unit_map(conn):
    """
    Collect all unique mutual aid unit IDs from cad_units JSONB,
    then generate a consistent fake ID for each.
    Preserves letter prefix, randomizes digits.
    e.g. AMB891 -> AMB263, NO244BLS -> NO738BLS, MED871 -> MED429
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT unit_obj->>'unit_id' AS uid
        FROM incidents, jsonb_array_elements(cad_units) AS unit_obj
        WHERE (unit_obj->>'is_mutual_aid')::boolean = true
          AND unit_obj->>'unit_id' IS NOT NULL
    """)
    real_ids = sorted(set(r[0] for r in cur.fetchall()))
    cur.close()

    ma_map = {}
    used = set()
    for rid in real_ids:
        # Match pattern: optional prefix letters, digits, optional suffix letters
        # e.g. AMB891 -> prefix=AMB digits=891 suffix=
        #      NO244BLS -> prefix=NO digits=244 suffix=BLS
        #      48QRS -> prefix= digits=48 suffix=QRS (but this is a station unit)
        m = re.match(r'^([A-Za-z]*)(\d+)([A-Za-z]*)$', rid)
        if m:
            prefix, digits, suffix = m.group(1), m.group(2), m.group(3)
            for _ in range(200):
                lo = 10 ** (len(digits) - 1)
                hi = 10 ** len(digits) - 1
                fake_num = str(random.randint(lo, hi))
                candidate = f"{prefix}{fake_num}{suffix}"
                if candidate not in used and candidate != rid:
                    used.add(candidate)
                    ma_map[rid] = candidate
                    break
            else:
                ma_map[rid] = f"{prefix}X{digits}{suffix}"
        else:
            # No clear pattern - randomize all digits in place
            fake = re.sub(r'\d', lambda x: str(random.randint(0, 9)), rid)
            if fake == rid:
                fake = rid + "X"
            ma_map[rid] = fake

    return ma_map


# ---------------------------------------------------------------------------
# Step 1: Ensure demo tenant in master DB
# ---------------------------------------------------------------------------

def ensure_demo_tenant():
    """Create or update the demo tenant in cadreport_master."""
    log.info("Ensuring demo tenant exists in master DB...")
    conn = db_connect(MASTER_DB)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT id FROM tenants WHERE slug = %s", (DEMO_SLUG,))
    row = cur.fetchone()

    pw_hash = hash_tenant_password(DEMO_TENANT_PASSWORD)

    if row:
        tenant_id = row[0]
        cur.execute("""
            UPDATE tenants SET
                name = %s,
                password_hash = %s,
                database_name = %s,
                status = 'active',
                updated_at = NOW()
            WHERE id = %s
        """, (DEMO_TENANT_NAME, pw_hash, DEMO_DB, tenant_id))
        log.info(f"Updated existing demo tenant (id={tenant_id})")
    else:
        cur.execute("""
            INSERT INTO tenants (
                slug, name, password_hash, database_name,
                status, neris_state, neris_county,
                timezone, approved_at
            ) VALUES (%s, %s, %s, %s, 'active', 'PA', 'Chester',
                      'America/New_York', NOW())
            RETURNING id
        """, (DEMO_SLUG, DEMO_TENANT_NAME, pw_hash, DEMO_DB))
        tenant_id = cur.fetchone()[0]
        log.info(f"Created demo tenant (id={tenant_id})")

    cur.close()
    conn.close()
    return tenant_id


# ---------------------------------------------------------------------------
# Step 2: Clone source DB -> demo DB
# ---------------------------------------------------------------------------

def clone_database():
    """Drop demo DB, dump source, restore into fresh demo DB."""
    log.info(f"Dropping {DEMO_DB} if exists...")
    # Terminate active connections first (backend may be connected)
    conn = db_connect("postgres")
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"""
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '{DEMO_DB}' AND pid <> pg_backend_pid()
    """)
    cur.close()
    conn.close()
    run_pg([DROPDB, "-U", DB_USER, "-h", DB_HOST, "--if-exists", DEMO_DB], check=False)

    log.info(f"Creating {DEMO_DB}...")
    run_pg([CREATEDB, "-U", DB_USER, "-h", DB_HOST, DEMO_DB])

    log.info(f"Dumping {SOURCE_DB}...")
    dump_file = "/tmp/cadreport_demo_dump.sql"
    run_pg([
        PG_DUMP, "-U", DB_USER, "-h", DB_HOST,
        "--no-owner", "--no-privileges",
        "-f", dump_file,
        SOURCE_DB,
    ])

    log.info(f"Restoring into {DEMO_DB}...")
    run_pg([PSQL, "-U", DB_USER, "-h", DB_HOST, DEMO_DB, "-f", dump_file])

    # Clean up dump file
    try:
        os.unlink(dump_file)
    except OSError:
        pass

    log.info("Database cloned successfully")


# ---------------------------------------------------------------------------
# Step 3: Anonymize personnel
# ---------------------------------------------------------------------------

def anonymize_personnel(conn):
    """Replace all personnel names with fake ones, clear auth data."""
    log.info("Anonymizing personnel...")
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("SELECT id FROM personnel ORDER BY id")
    personnel_ids = [r["id"] for r in cur.fetchall()]

    # Shuffle name pools to get unique combos
    used_names = set()
    random.shuffle(FIRST_NAMES)
    random.shuffle(LAST_NAMES)

    name_idx = 0
    for pid in personnel_ids:
        # Generate unique name combo
        while True:
            first = FIRST_NAMES[name_idx % len(FIRST_NAMES)]
            last = LAST_NAMES[name_idx % len(LAST_NAMES)]
            name_idx += 1
            if (first, last) not in used_names:
                used_names.add((first, last))
                break

        cur.execute("""
            UPDATE personnel SET
                first_name = %s,
                last_name = %s,
                email = NULL,
                password_hash = NULL,
                reset_token = NULL,
                reset_token_expires_at = NULL,
                invite_token = NULL,
                invite_token_expires_at = NULL,
                pending_email = NULL,
                pending_email_token = NULL,
                pending_email_expires_at = NULL,
                email_verified_at = NULL,
                approved_at = NULL,
                approved_by = NULL,
                last_login_at = NULL,
                notification_preferences = '{}'::jsonb,
                needs_profile_review = FALSE
            WHERE id = %s
        """, (first, last, pid))

    # Also update the snapshot names in incident_personnel
    cur.execute("SELECT DISTINCT personnel_id FROM incident_personnel")
    for row in cur.fetchall():
        pid = row["personnel_id"]
        # Look up the new name we assigned
        cur.execute("SELECT first_name, last_name FROM personnel WHERE id = %s", (pid,))
        prow = cur.fetchone()
        if prow:
            cur.execute("""
                UPDATE incident_personnel
                SET personnel_first_name = %s, personnel_last_name = %s
                WHERE personnel_id = %s
            """, (prow["first_name"], prow["last_name"], pid))
        else:
            # Personnel was deleted but snapshot remains - use generic
            fake_first = random.choice(FIRST_NAMES)
            fake_last = random.choice(LAST_NAMES)
            cur.execute("""
                UPDATE incident_personnel
                SET personnel_first_name = %s, personnel_last_name = %s
                WHERE personnel_id = %s
            """, (fake_first, fake_last, pid))

    conn.commit()
    log.info(f"Anonymized {len(personnel_ids)} personnel records")


# ---------------------------------------------------------------------------
# Step 4: Remap apparatus (Station 48 -> 99)
# ---------------------------------------------------------------------------

def remap_apparatus(conn):
    """Rename all apparatus from Station 48 to Station 99."""
    log.info("Remapping apparatus to Station 99...")
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("SELECT id, unit_designator, name, cad_unit_id, cad_unit_aliases FROM apparatus")
    rows = cur.fetchall()

    for row in rows:
        new_designator = remap_unit_id(row["unit_designator"])
        new_name = row["name"].replace(SOURCE_STATION, DEMO_STATION) if row["name"] else row["name"]
        new_cad_id = remap_unit_id(row["cad_unit_id"])

        # Remap aliases array
        aliases = row["cad_unit_aliases"] or []
        new_aliases = [remap_unit_id(a) for a in aliases]

        cur.execute("""
            UPDATE apparatus SET
                unit_designator = %s,
                name = %s,
                cad_unit_id = %s,
                cad_unit_aliases = %s
            WHERE id = %s
        """, (new_designator, new_name, new_cad_id, new_aliases, row["id"]))

    # Also update cad_unit_id in incident_units (station units only here)
    cur.execute("SELECT id, cad_unit_id FROM incident_units")
    for row in cur.fetchall():
        new_cad = remap_unit_id(row["cad_unit_id"])
        cur.execute("UPDATE incident_units SET cad_unit_id = %s WHERE id = %s",
                     (new_cad, row["id"]))

    conn.commit()
    log.info(f"Remapped {len(rows)} apparatus records")


# ---------------------------------------------------------------------------
# Step 5: Anonymize incidents
# ---------------------------------------------------------------------------

def anonymize_incidents(conn, ma_map):
    """Anonymize addresses, caller info, narratives, shift dates, and remap unit IDs."""
    log.info("Anonymizing incidents...")
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    # Calculate date shift: make most recent incident = yesterday
    cur.execute("""
        SELECT MAX(incident_date) FROM incidents
        WHERE incident_date IS NOT NULL AND deleted_at IS NULL
    """)
    max_date_row = cur.fetchone()
    if max_date_row and max_date_row[0]:
        yesterday = date.today() - timedelta(days=1)
        date_shift = (yesterday - max_date_row[0]).days
        log.info(f"Shifting dates by {date_shift} days (most recent -> yesterday)")
    else:
        date_shift = 0
        log.warning("No incidents found with dates, skipping date shift")

    date_shift_interval = f"{date_shift} days"

    # Anonymize all incidents
    cur.execute("SELECT id FROM incidents ORDER BY id")
    incident_ids = [r["id"] for r in cur.fetchall()]

    for iid in incident_ids:
        new_addr = random_address()
        new_cross = random_cross_streets()
        new_caller_name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        new_caller_phone = random_phone()

        cur.execute("""
            UPDATE incidents SET
                address = %s,
                cross_streets = %s,
                caller_name = %s,
                caller_phone = %s,
                -- Clear raw CAD HTML (contains real addresses/names)
                cad_raw_dispatch = NULL,
                cad_raw_updates = NULL,
                cad_raw_clear = NULL,
                -- Clear narratives that may contain PII
                narrative = CASE
                    WHEN narrative IS NOT NULL THEN 'Demo incident - narrative redacted for privacy.'
                    ELSE NULL
                END,
                situation_found = CASE
                    WHEN situation_found IS NOT NULL THEN 'Units arrived on scene and assessed the situation.'
                    ELSE NULL
                END,
                companies_called = CASE
                    WHEN companies_called IS NOT NULL THEN 'Mutual aid companies assisted.'
                    ELSE NULL
                END,
                -- Clear location data
                neris_location = NULL,
                latitude = NULL,
                longitude = NULL
            WHERE id = %s
        """, (new_addr, new_cross, new_caller_name, new_caller_phone, iid))

    # Shift all dates by the calculated offset
    if date_shift != 0:
        log.info("Shifting incident dates...")

        # Shift incident_date (Date type)
        cur.execute(f"""
            UPDATE incidents SET
                incident_date = incident_date + INTERVAL '{date_shift_interval}'
            WHERE incident_date IS NOT NULL
        """)

        # Shift all timestamp columns on incidents
        timestamp_cols = [
            "time_dispatched", "time_first_enroute", "time_first_on_scene",
            "time_last_cleared", "time_in_service",
            "time_event_start", "time_event_end",
            "time_command_established", "time_sizeup_completed",
            "time_primary_search_begin", "time_primary_search_complete",
            "time_water_on_fire", "time_fire_under_control",
            "time_fire_knocked_down", "time_suppression_complete",
            "time_extrication_complete",
            "time_secondary_search_begin", "time_secondary_search_complete",
            "time_ventilation_start", "time_ventilation_complete",
            "time_overhaul_start", "time_overhaul_complete",
            "time_rit_activated", "time_mayday_declared", "time_mayday_cleared",
            "time_extrication_start",
            "time_patient_contact", "time_patient_assessment_complete",
            "time_cpr_started", "time_aed_applied", "time_aed_shock_delivered",
            "time_rosc_achieved", "time_airway_secured", "time_iv_access",
            "time_par_started", "time_par_complete", "time_evac_ordered",
            "time_water_supply_established", "time_all_clear", "time_loss_stop",
            "time_utilities_secured", "time_rehab_established",
            "time_investigation_requested",
            "time_hazmat_identified", "time_hazmat_contained",
            "time_decon_started", "time_decon_complete",
            "time_victim_located", "time_victim_accessed", "time_victim_freed",
            "time_wildland_contained", "time_wildland_controlled",
            "time_wildland_mopup_complete",
            "cad_dispatch_received_at", "cad_clear_received_at", "cad_last_updated_at",
            "weather_fetched_at",
            "created_at", "updated_at",
        ]

        for col in timestamp_cols:
            cur.execute(f"""
                UPDATE incidents SET {col} = {col} + INTERVAL '{date_shift_interval}'
                WHERE {col} IS NOT NULL
            """)

        # Shift incident_unit timestamps
        unit_ts_cols = [
            "time_dispatch", "time_enroute_to_scene", "time_on_scene",
            "time_canceled_enroute", "time_staging", "time_at_patient",
            "time_enroute_hospital", "time_arrived_hospital",
            "time_hospital_clear", "time_unit_clear",
            "created_at",
        ]
        for col in unit_ts_cols:
            cur.execute(f"""
                UPDATE incident_units SET {col} = {col} + INTERVAL '{date_shift_interval}'
                WHERE {col} IS NOT NULL
            """)

        # Shift audit_log timestamps
        cur.execute(f"""
            UPDATE audit_log SET created_at = created_at + INTERVAL '{date_shift_interval}'
            WHERE created_at IS NOT NULL
        """)

    # Remap cad_units JSONB: station units (48->99) AND mutual aid units (randomized)
    cur.execute("SELECT id, cad_units FROM incidents WHERE cad_units IS NOT NULL AND cad_units != '[]'::jsonb")
    for row in cur.fetchall():
        units = row["cad_units"]
        if isinstance(units, str):
            units = json.loads(units)
        if isinstance(units, list):
            changed = False
            for u in units:
                if isinstance(u, dict) and "unit_id" in u:
                    old = u["unit_id"]
                    if u.get("is_mutual_aid"):
                        # Use MA mapping
                        new = ma_map.get(old, old)
                    else:
                        # Station unit: 48 -> 99
                        new = remap_unit_id(old)
                    if old != new:
                        u["unit_id"] = new
                        changed = True
                    # Also remap station field if present
                    if "station" in u and u["station"]:
                        old_station = str(u["station"])
                        new_station = old_station.replace(SOURCE_STATION, DEMO_STATION)
                        if old_station != new_station:
                            u["station"] = new_station
                            changed = True
            if changed:
                cur.execute("UPDATE incidents SET cad_units = %s WHERE id = %s",
                            (json.dumps(units), row["id"]))

    # Remap mutual aid unit IDs in incident_units table
    if ma_map:
        log.info(f"Remapping {len(ma_map)} mutual aid unit IDs in incident_units...")
        for real_id, fake_id in ma_map.items():
            cur.execute("""
                UPDATE incident_units SET cad_unit_id = %s
                WHERE cad_unit_id = %s
            """, (fake_id, real_id))

    # Clear cad_event_comments (may contain real names/addresses in parsed comments)
    cur.execute("UPDATE incidents SET cad_event_comments = '{}'::jsonb")

    conn.commit()
    log.info(f"Anonymized {len(incident_ids)} incidents (date shift: {date_shift} days)")
    if ma_map:
        log.info(f"Mutual aid unit mapping: {ma_map}")


# ---------------------------------------------------------------------------
# Step 6: Anonymize municipalities
# ---------------------------------------------------------------------------

def anonymize_municipalities(conn):
    """Replace municipality names with fictional ones."""
    log.info("Anonymizing municipalities...")
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("SELECT id, code, name, display_name FROM municipalities ORDER BY id")
    rows = cur.fetchall()

    for i, row in enumerate(rows):
        if i < len(MUNICIPALITY_NAMES):
            new_code, new_name, new_display = MUNICIPALITY_NAMES[i]
        else:
            # Generate more if needed
            new_code = f"MUN{i:03d}"
            new_name = f"Township {i}"
            new_display = f"Township {i}"

        cur.execute("""
            UPDATE municipalities SET
                code = %s,
                name = %s,
                display_name = %s
            WHERE id = %s
        """, (new_code, new_name, new_display, row["id"]))

        # Update matching municipality_code on incidents
        cur.execute("""
            UPDATE incidents SET municipality_code = %s
            WHERE municipality_code = %s
        """, (new_code, row["code"]))

    conn.commit()
    log.info(f"Anonymized {len(rows)} municipalities")


# ---------------------------------------------------------------------------
# Step 7: Update branding / settings
# ---------------------------------------------------------------------------

def restore_demo_branding(conn):
    """Restore the demo-specific branding: logo, colors, logo_size.
    
    Logo file: scripts/demo_logo.webp (CadReport shield)
    Colors picked from the logo by Mike.
    """
    log.info("Restoring demo branding (logo + colors)...")
    cur = conn.cursor()

    # --- Helper ---
    def _set_branding(key, value):
        cur.execute(
            "DELETE FROM settings WHERE category = 'branding' AND key = %s",
            (key,),
        )
        cur.execute("""
            INSERT INTO settings (category, key, value, value_type, updated_at)
            VALUES ('branding', %s, %s, 'string', NOW())
        """, (key, value))

    # Colors
    _set_branding("primary_color", "#7e0000")
    _set_branding("secondary_color", "#eba12d")
    _set_branding("logo_size", "xlarge")

    # Logo from file
    logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo_logo.webp")
    if os.path.exists(logo_path):
        with open(logo_path, "rb") as f:
            logo_b64 = base64.b64encode(f.read()).decode("utf-8")
        _set_branding("logo", logo_b64)
        _set_branding("logo_mime_type", "image/webp")
        log.info(f"Inserted demo logo from {logo_path} ({len(logo_b64)} chars base64)")
    else:
        log.warning(f"Demo logo not found at {logo_path}, skipping logo")

    conn.commit()
    cur.close()
    log.info("Demo branding restored")


def update_branding(conn):
    """Set demo branding, scrub all identifiable settings."""
    log.info("Updating branding and settings...")
    cur = conn.cursor()

    # --- Upsert helper (delete + insert, safe without unique constraint) ---
    def _set(category, key, value, value_type="string"):
        cur.execute(
            "DELETE FROM settings WHERE category = %s AND key = %s",
            (category, key),
        )
        cur.execute("""
            INSERT INTO settings (category, key, value, value_type, updated_at)
            VALUES (%s, %s, %s, %s, NOW())
        """, (category, key, value, value_type))

    # Station identity
    _set("station", "name", "Brookfield Fire Company")
    _set("station", "number", "99")
    _set("station", "short_name", "BFC Sta 99")
    _set("station", "tagline", "Proudly Serving Brookfield Township")
    _set("station", "address", "100 Brookfield Rd, Brookfield, PA 19000")
    _set("station", "latitude", "40.1200")
    _set("station", "longitude", "-75.8100")

    # NERIS identity
    _set("neris", "fd_name", "Brookfield Fire Company")
    _set("neris", "fd_neris_id", "")  # Clear real NERIS ID

    # Admin password - set to demo123 (bcrypt)
    demo_admin_hash = hash_tenant_password(DEMO_TENANT_PASSWORD)
    _set("admin", "password_hash", demo_admin_hash)

    # API URL - use relative or localhost (not internal IP)
    _set("api", "url", "")

    # Remap station_units from 48 -> 99
    cur.execute("""
        SELECT value FROM settings WHERE category = 'units' AND key = 'station_units'
    """)
    row = cur.fetchone()
    if row and row[0]:
        remapped = row[0].replace(SOURCE_STATION, DEMO_STATION)
        _set("units", "station_units", remapped)
        log.info(f"Remapped station_units: {remapped}")

    # Clear any existing logo (it's Glen Moore's)
    cur.execute("DELETE FROM settings WHERE category = 'branding' AND key = 'logo'")
    cur.execute("DELETE FROM settings WHERE category = 'branding' AND key = 'logo_mime_type'")

    # Catch-all: scrub any remaining settings containing source identifiers
    for pattern in ['%Glen Moore%', '%GMFC%', '%glenmoore%', '%Glenmoore%']:
        cur.execute("""
            UPDATE settings SET value = 'Brookfield Fire Company'
            WHERE value ILIKE %s
            AND NOT (category = 'station' AND key IN ('name', 'short_name', 'tagline', 'address'))
        """, (pattern,))

    conn.commit()
    log.info("Branding and settings updated")


# ---------------------------------------------------------------------------
# Step 8: Create test user
# ---------------------------------------------------------------------------

def create_test_user(conn):
    """Create the testuser admin account."""
    log.info("Creating test user account...")
    cur = conn.cursor()

    pw_hash = hash_personnel_password(DEMO_USER_PASSWORD)

    # Insert new personnel record as the test admin
    cur.execute("""
        INSERT INTO personnel (
            first_name, last_name, email, password_hash, role,
            active, email_verified_at, approved_at
        ) VALUES (%s, %s, %s, %s, 'ADMIN', TRUE, NOW(), NOW())
        RETURNING id
    """, (DEMO_USER_FIRST, DEMO_USER_LAST, DEMO_USER_EMAIL, pw_hash))

    user_id = cur.fetchone()[0]
    conn.commit()
    log.info(f"Created test user: {DEMO_USER_EMAIL} / {DEMO_USER_PASSWORD} (id={user_id}, role=ADMIN)")
    return user_id


# ---------------------------------------------------------------------------
# Step 9: Clean up misc data
# ---------------------------------------------------------------------------

def cleanup_misc(conn):
    """Clear review tasks, audit log entries with real names, etc."""
    log.info("Cleaning up miscellaneous data...")
    cur = conn.cursor()

    # Clear review tasks (may reference real personnel by name)
    cur.execute("DELETE FROM review_tasks")

    # Clear tenant_query_usage and saved_queries if they exist
    for table in ["tenant_query_usage", "saved_queries"]:
        try:
            cur.execute(f"TRUNCATE {table}")
            conn.commit()
        except Exception:
            conn.rollback()

    # Clear any weather API data (contains coordinates)
    cur.execute("UPDATE incidents SET weather_api_data = NULL")

    # Clear NERIS submission tracking (don't want demo submitting to real NERIS)
    cur.execute("""
        UPDATE incidents SET
            neris_submitted_at = NULL,
            neris_submission_id = NULL,
            neris_validation_errors = NULL,
            neris_last_validated_at = NULL
    """)

    conn.commit()
    log.info("Misc cleanup complete")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    start = datetime.now()
    log.info("=" * 60)
    log.info("CADReport Demo Environment Seeder")
    log.info(f"Started at {start.strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 60)

    try:
        # Step 1: Ensure tenant
        ensure_demo_tenant()

        # Step 2: Clone database
        clone_database()

        # Steps 3-9: Anonymize in the demo database
        conn = db_connect(DEMO_DB)
        try:
            anonymize_personnel(conn)
            remap_apparatus(conn)
            # Build MA unit map BEFORE anonymizing incidents (needs original IDs)
            ma_map = build_ma_unit_map(conn)
            anonymize_incidents(conn, ma_map)
            anonymize_municipalities(conn)
            update_branding(conn)
            restore_demo_branding(conn)
            create_test_user(conn)
            cleanup_misc(conn)

            # Drop and recreate audit log LAST - anonymization steps above
            # trigger DB audit triggers that re-create entries with real data.
            # DROP/CREATE ensures correct schema and zero real data.
            cur = conn.cursor()
            cur.execute("""
                DROP TABLE IF EXISTS audit_log;
                CREATE TABLE audit_log (
                    id SERIAL PRIMARY KEY,
                    personnel_id INTEGER REFERENCES personnel(id) ON DELETE SET NULL,
                    personnel_name VARCHAR(100),
                    action VARCHAR(50) NOT NULL,
                    entity_type VARCHAR(50),
                    entity_id INTEGER,
                    entity_display VARCHAR(255),
                    summary TEXT,
                    fields_changed JSONB,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX idx_audit_log_created ON audit_log(created_at);
                CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
                CREATE INDEX idx_audit_log_personnel ON audit_log(personnel_id);
            """)
            conn.commit()
            cur.close()
            log.info("Dropped and recreated audit_log table (final step)")
        finally:
            conn.close()

        elapsed = (datetime.now() - start).total_seconds()
        log.info("=" * 60)
        log.info(f"Demo environment ready! ({elapsed:.1f}s)")
        log.info(f"  URL:            https://demo.cadreport.com")
        log.info(f"  Tenant login:   {DEMO_SLUG} / {DEMO_TENANT_PASSWORD}")
        log.info(f"  User login:     {DEMO_USER_EMAIL} / {DEMO_USER_PASSWORD}")
        log.info("=" * 60)

    except Exception as e:
        log.exception(f"FATAL: Demo seed failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
