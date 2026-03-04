"""
Migration 042: Seed Glen Moore Entity Data

Populates neris_entity, neris_stations, and neris_units with Glen Moore Fire Company
data, seeding units from the existing apparatus table.

Glen Moore seed data:
  Entity:  fd_neris_id=FD42029593, Glen Moore Fire Company, 578 Fairview Rd, Glenmoore PA 19343
  Station: FD42029593S001, Station 48
  Units:   seeded from apparatus WHERE unit_category='APPARATUS' AND active=true

IMPORTANT: station_unit_id_1 is set from apparatus.unit_designator — this MUST
match the CAD unit ID exactly and is what gets used as unit_id_linked in payloads.

Usage:
    python 042_neris_entity_seed_glenmoor.py migrate    -- seed data
    python 042_neris_entity_seed_glenmoor.py rollback   -- remove seeded data
    python 042_neris_entity_seed_glenmoor.py status     -- show current entity data
"""

import sys
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = "postgresql://dashboard:dashboard@localhost:6432/runsheet_db"

# Map from apparatus neris_unit_type to NERIS station_unit_capability enum
# NERIS values: engine, ladder_truck, quint, rescue, tanker_tender, brush,
#               ambulance, air_unit, boat, command, foam_unit, haz_mat,
#               investigation, mass_casualty, salvage, technical_rescue,
#               wildland, other
UNIT_TYPE_MAP = {
    "ENGINE":           "engine",
    "LADDER":           "ladder_truck",
    "LADDER_TRUCK":     "ladder_truck",
    "QUINT":            "quint",
    "RESCUE":           "rescue",
    "TANKER":           "tanker_tender",
    "TENDER":           "tanker_tender",
    "TANKER_TENDER":    "tanker_tender",
    "BRUSH":            "brush",
    "AMBULANCE":        "ambulance",
    "AMBULANCE_ALS":    "ambulance",
    "AMBULANCE_BLS":    "ambulance",
    "AIR":              "air_unit",
    "BOAT":             "boat",
    "COMMAND":          "command",
    "CHIEF":            "command",
    "FOAM":             "foam_unit",
    "HAZMAT":           "haz_mat",
    "HAZ_MAT":          "haz_mat",
    "INVESTIGATION":    "investigation",
    "MCI":              "mass_casualty",
    "MASS_CASUALTY":    "mass_casualty",
    "SALVAGE":          "salvage",
    "TECHNICAL_RESCUE": "technical_rescue",
    "WILDLAND":         "wildland",
    "QRS":              "rescue",
}


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def map_capability(neris_unit_type):
    """Map apparatus.neris_unit_type to NERIS station_unit_capability."""
    if not neris_unit_type:
        return None
    return UNIT_TYPE_MAP.get(neris_unit_type.upper())


def status():
    print("=" * 60)
    print("Migration 042 -- Glen Moore Entity Seed -- STATUS")
    print("=" * 60)
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT id, fd_neris_id, fd_name, fd_city, fd_state FROM neris_entity")
    entities = cur.fetchall()
    if not entities:
        print("  neris_entity: (empty)")
    else:
        for e in entities:
            print(f"  Entity #{e['id']}: {e['fd_neris_id']} — {e['fd_name']} ({e['fd_city']}, {e['fd_state']})")

    cur.execute("""
        SELECT ns.id, ns.station_id, ns.station_name, COUNT(nu.id) as unit_count
        FROM neris_stations ns
        LEFT JOIN neris_units nu ON nu.station_id = ns.id
        GROUP BY ns.id, ns.station_id, ns.station_name
    """)
    stations = cur.fetchall()
    if not stations:
        print("  neris_stations: (empty)")
    else:
        for s in stations:
            print(f"  Station #{s['id']}: {s['station_id']} — {s['station_name']} ({s['unit_count']} units)")

    cur.execute("""
        SELECT nu.station_unit_id_1, nu.station_unit_capability, a.unit_designator
        FROM neris_units nu
        LEFT JOIN apparatus a ON nu.apparatus_id = a.id
        ORDER BY nu.display_order, nu.id
    """)
    units = cur.fetchall()
    if not units:
        print("  neris_units: (empty)")
    else:
        for u in units:
            print(f"    Unit: {u['station_unit_id_1']} | capability={u['station_unit_capability']} | apparatus={u['unit_designator']}")

    conn.close()


def migrate():
    print("=" * 60)
    print("Migration 042 -- Glen Moore Entity Seed -- MIGRATE")
    print("=" * 60)

    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Check if entity already exists
    cur.execute("SELECT id FROM neris_entity WHERE fd_neris_id = 'FD42029593'")
    if cur.fetchone():
        print("  Entity FD42029593 already exists — skipping (run rollback first to re-seed)")
        conn.close()
        return

    # ------------------------------------------------------------------
    # 1. Insert Entity
    # ------------------------------------------------------------------
    print("Inserting Glen Moore entity...")
    cur.execute("""
        INSERT INTO neris_entity (
            fd_neris_id, fd_name,
            fd_address_1, fd_city, fd_state, fd_zip,
            rms_software,
            neris_entity_status
        ) VALUES (
            'FD42029593', 'Glen Moore Fire Company',
            '578 Fairview Rd', 'Glenmoore', 'PA', '19343',
            'CADReport',
            'draft'
        )
        RETURNING id
    """)
    entity_id = cur.fetchone()['id']
    print(f"  OK entity id={entity_id}")

    # ------------------------------------------------------------------
    # 2. Insert Station 48
    # ------------------------------------------------------------------
    print("Inserting Station 48...")
    cur.execute("""
        INSERT INTO neris_stations (
            entity_id, station_id, station_name,
            station_address_1, station_city, station_state, station_zip,
            display_order
        ) VALUES (
            %s, 'FD42029593S001', 'Station 48',
            '578 Fairview Rd', 'Glenmoore', 'PA', '19343',
            0
        )
        RETURNING id
    """, (entity_id,))
    station_id = cur.fetchone()['id']
    print(f"  OK station id={station_id}")

    # ------------------------------------------------------------------
    # 3. Seed units from apparatus table
    # ------------------------------------------------------------------
    print("Seeding units from apparatus table...")
    cur.execute("""
        SELECT id, unit_designator, name, neris_unit_type, display_order
        FROM apparatus
        WHERE unit_category = 'APPARATUS' AND active = true
        ORDER BY display_order, id
    """)
    apparatus_rows = cur.fetchall()

    if not apparatus_rows:
        print("  WARNING: No active APPARATUS-category units found in apparatus table")
    else:
        for idx, app in enumerate(apparatus_rows):
            capability = map_capability(app['neris_unit_type'])
            cur.execute("""
                INSERT INTO neris_units (
                    station_id,
                    station_unit_id_1,
                    station_unit_capability,
                    apparatus_id,
                    display_order
                ) VALUES (%s, %s, %s, %s, %s)
            """, (
                station_id,
                app['unit_designator'],   # CRITICAL: must match CAD exactly
                capability,               # May be None if neris_unit_type not mapped
                app['id'],
                idx,
            ))
            print(f"  OK unit: {app['unit_designator']} (capability={capability}, apparatus_id={app['id']})")

    # ------------------------------------------------------------------
    # 4. Update station count on entity
    # ------------------------------------------------------------------
    cur.execute("UPDATE neris_entity SET fd_station_count = 1 WHERE id = %s", (entity_id,))

    conn.commit()
    conn.close()

    print()
    print("Migration 042 complete.")
    status()


def rollback():
    print("=" * 60)
    print("Migration 042 -- Glen Moore Entity Seed -- ROLLBACK")
    print("=" * 60)
    print("This will DELETE Glen Moore entity, stations, and units from new tables.")
    print("It does NOT restore old settings keys (those are still intact at this stage).")
    confirm = input("Type YES to confirm: ")
    if confirm != "YES":
        print("Aborted.")
        return

    conn = get_connection()
    cur = conn.cursor()

    # CASCADE handles stations and units automatically
    cur.execute("DELETE FROM neris_entity WHERE fd_neris_id = 'FD42029593'")
    rows = cur.rowcount
    conn.commit()
    conn.close()
    print(f"  OK deleted {rows} entity row(s) (stations and units cascade-deleted)")
    print("Rollback complete.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python 042_neris_entity_seed_glenmoor.py [migrate|rollback|status]")
        sys.exit(1)
    cmd = sys.argv[1].lower()
    if cmd == "migrate":
        migrate()
    elif cmd == "rollback":
        rollback()
    elif cmd == "status":
        status()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
