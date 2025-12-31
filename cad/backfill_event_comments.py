#!/usr/bin/env python3
"""
Backfill CAD Event Comments for Existing Incidents

This script processes all incidents with cad_raw_clear data and populates:
1. cad_event_comments JSONB field with parsed/categorized comments
2. HIGH confidence tactical timestamps into NERIS columns (if currently NULL)

Run from server:
    cd /opt/runsheet
    ./runsheet_env/bin/python -m cad.backfill_event_comments

Or with options:
    python3 -m cad.backfill_event_comments --dry-run          # Preview changes
    python3 -m cad.backfill_event_comments --incident F250001 # Single incident
    python3 -m cad.backfill_event_comments --limit 10         # Process 10 incidents
    python3 -m cad.backfill_event_comments --force            # Reprocess all incidents
    python3 -m cad.backfill_event_comments --no-ml            # Skip ML categorization
"""

import argparse
import json
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime
from typing import Optional, List, Dict, Any

import psycopg2
from psycopg2.extras import RealDictCursor

from cad.cad_parser import parse_cad_html
from cad.comment_processor import process_clear_report_comments


# Database connection - matches RunSheet backend config (Unix socket auth)
DATABASE_URL = "postgresql:///runsheet_db"

# Timezone for CAD timestamps (Chester County)
CAD_TIMEZONE = 'America/New_York'


def get_db_connection():
    """Get database connection using Unix socket (same as backend)."""
    return psycopg2.connect(DATABASE_URL)


def get_incidents_to_process(
    conn,
    incident_number: Optional[str] = None,
    limit: Optional[int] = None,
    force: bool = False
) -> List[Dict]:
    """
    Get incidents that need event comments backfilled.
    
    Args:
        conn: Database connection
        incident_number: Specific incident to process (optional)
        limit: Maximum number to process (optional)
        only_missing: Only get incidents where cad_event_comments is empty
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        conditions = ["cad_raw_clear IS NOT NULL"]
        params = []
        
        if incident_number:
            conditions.append("internal_incident_number = %s")
            params.append(incident_number)
        
        if not force:
            conditions.append("(cad_event_comments IS NULL OR cad_event_comments = '{}'::jsonb)")
        
        where_clause = " AND ".join(conditions)
        limit_clause = f"LIMIT {limit}" if limit else ""
        
        query = f"""
            SELECT 
                id,
                internal_incident_number,
                incident_date,
                cad_raw_clear,
                cad_event_comments,
                time_command_established,
                time_fire_under_control,
                time_water_on_fire,
                time_primary_search_complete,
                time_evac_ordered,
                time_par_started,
                time_water_supply_established
            FROM incidents
            WHERE {where_clause}
            ORDER BY id DESC
            {limit_clause}
        """
        
        cur.execute(query, params)
        return cur.fetchall()


def process_incident(incident: Dict, dry_run: bool = False, use_ml: bool = True) -> Dict[str, Any]:
    """
    Process a single incident's raw CAD clear data.
    
    Returns dict with:
        - success: bool
        - incident_number: str
        - comments_count: int
        - timestamps_detected: int
        - timestamps_populated: list of field names
        - error: str (if failed)
    """
    result = {
        'success': False,
        'incident_number': incident['internal_incident_number'],
        'comments_count': 0,
        'timestamps_detected': 0,
        'timestamps_populated': [],
        'error': None,
    }
    
    try:
        raw_clear = incident['cad_raw_clear']
        if not raw_clear:
            result['error'] = 'No cad_raw_clear data'
            return result
        
        # Parse the raw HTML to extract event comments
        parsed = parse_cad_html(raw_clear)
        if not parsed:
            result['error'] = 'Failed to parse CAD HTML'
            return result
        
        event_comments = getattr(parsed, 'event_comments', None) or []
        if not event_comments:
            # No comments to process, but that's okay
            result['success'] = True
            result['comments_count'] = 0
            return result
        
        # Get incident date for timestamp conversion
        incident_date = incident.get('incident_date')
        if incident_date:
            incident_date_str = str(incident_date)
        else:
            incident_date_str = datetime.now().strftime('%Y-%m-%d')
        
        # Process comments
        processed = process_clear_report_comments(
            event_comments,
            incident_date_str,
            CAD_TIMEZONE,
            use_ml=use_ml
        )
        
        cad_event_comments = processed.get('cad_event_comments', {})
        tactical_timestamps = processed.get('tactical_timestamps', {})
        
        result['comments_count'] = len(cad_event_comments.get('comments', []))
        result['timestamps_detected'] = len(cad_event_comments.get('detected_timestamps', []))
        
        # Determine which NERIS fields to populate (only if currently NULL)
        fields_to_update = {}
        
        timestamp_field_mapping = [
            ('time_command_established', 'time_command_established'),
            ('time_fire_under_control', 'time_fire_under_control'),
            ('time_water_on_fire', 'time_water_on_fire'),
            ('time_primary_search_complete', 'time_primary_search_complete'),
            ('time_evac_ordered', 'time_evac_ordered'),
            ('time_par_started', 'time_par_started'),
            ('time_water_supply_established', 'time_water_supply_established'),
        ]
        
        for db_field, tactical_key in timestamp_field_mapping:
            if tactical_timestamps.get(tactical_key):
                # Only update if currently NULL
                if incident.get(db_field) is None:
                    fields_to_update[db_field] = tactical_timestamps[tactical_key]
                    result['timestamps_populated'].append(db_field)
        
        # Always update cad_event_comments
        fields_to_update['cad_event_comments'] = json.dumps(cad_event_comments)
        
        if not dry_run:
            # Build UPDATE query
            set_clauses = []
            params = []
            
            for field, value in fields_to_update.items():
                if field == 'cad_event_comments':
                    set_clauses.append(f"{field} = %s::jsonb")
                else:
                    set_clauses.append(f"{field} = %s")
                params.append(value)
            
            params.append(incident['id'])
            
            query = f"""
                UPDATE incidents 
                SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """
            
            return {
                **result,
                'success': True,
                'query': query,
                'params': params,
            }
        else:
            result['success'] = True
            return result
            
    except Exception as e:
        result['error'] = str(e)
        return result


def run_backfill(
    dry_run: bool = False,
    incident_number: Optional[str] = None,
    limit: Optional[int] = None,
    verbose: bool = False,
    force: bool = False,
    use_ml: bool = True
):
    """
    Run the backfill process.
    
    Args:
        dry_run: If True, don't actually update the database
        incident_number: Process only this incident
        limit: Maximum number of incidents to process
        verbose: Print detailed progress
    """
    conn = get_db_connection()
    
    try:
        print(f"{'[DRY RUN] ' if dry_run else ''}Starting event comments backfill...")
        print(f"Timezone: {CAD_TIMEZONE}")
        print(f"ML Categorization: {'Enabled' if use_ml else 'Disabled'}")
        if force:
            print("Force mode: Reprocessing ALL incidents (not just missing)")
        print()
        
        # Get incidents to process
        incidents = get_incidents_to_process(
            conn,
            incident_number=incident_number,
            limit=limit,
            force=force
        )
        
        print(f"Found {len(incidents)} incidents to process")
        print()
        
        if not incidents:
            print("No incidents need processing.")
            return
        
        # Process each incident
        stats = {
            'total': len(incidents),
            'success': 0,
            'failed': 0,
            'comments_total': 0,
            'timestamps_populated': 0,
        }
        
        for i, incident in enumerate(incidents, 1):
            result = process_incident(incident, dry_run=dry_run, use_ml=use_ml)
            
            if result['success']:
                stats['success'] += 1
                stats['comments_total'] += result['comments_count']
                stats['timestamps_populated'] += len(result['timestamps_populated'])
                
                if not dry_run and 'query' in result:
                    # Execute the update
                    with conn.cursor() as cur:
                        cur.execute(result['query'], result['params'])
                    conn.commit()
                
                if verbose or result['timestamps_populated']:
                    print(f"✓ {result['incident_number']}: {result['comments_count']} comments, "
                          f"{result['timestamps_detected']} timestamps detected")
                    if result['timestamps_populated']:
                        print(f"  → Populated: {', '.join(result['timestamps_populated'])}")
            else:
                stats['failed'] += 1
                print(f"✗ {result['incident_number']}: {result['error']}")
            
            # Progress indicator every 50
            if i % 50 == 0:
                print(f"  ... processed {i}/{stats['total']}")
        
        # Summary
        print()
        print("=" * 50)
        print(f"{'[DRY RUN] ' if dry_run else ''}Backfill Complete")
        print(f"  Total incidents:     {stats['total']}")
        print(f"  Successful:          {stats['success']}")
        print(f"  Failed:              {stats['failed']}")
        print(f"  Total comments:      {stats['comments_total']}")
        print(f"  Timestamps populated: {stats['timestamps_populated']}")
        print("=" * 50)
        
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='Backfill CAD event comments for existing incidents'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without updating database'
    )
    parser.add_argument(
        '--incident',
        type=str,
        help='Process only this incident number (e.g., F250001)'
    )
    parser.add_argument(
        '--limit',
        type=int,
        help='Maximum number of incidents to process'
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Show detailed progress for each incident'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Reprocess all incidents, not just those with missing comments'
    )
    parser.add_argument(
        '--no-ml',
        action='store_true',
        help='Disable ML categorization (use patterns only)'
    )
    
    args = parser.parse_args()
    
    run_backfill(
        dry_run=args.dry_run,
        incident_number=args.incident,
        limit=args.limit,
        verbose=args.verbose,
        force=args.force,
        use_ml=not args.no_ml
    )


if __name__ == '__main__':
    main()
