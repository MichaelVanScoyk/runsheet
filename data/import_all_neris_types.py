#!/usr/bin/env python3
"""
Import ALL NERIS type codes from xlsx files into the database.
Reads from incident_type_files.xlsx and shared_type_files.xlsx
"""

import openpyxl
import psycopg2
from datetime import datetime, timezone
import sys

DB_CONFIG = {
    'dbname': 'runsheet_db',
    'user': 'dashboard',
    'host': 'localhost'
}

# Files to import
XLSX_FILES = [
    '/opt/runsheet/data/incident_type_files.xlsx',
    '/opt/runsheet/data/shared_type_files.xlsx',
]

def get_connection():
    return psycopg2.connect(dbname='runsheet_db')

def import_type_file(conn, category, sheet):
    """Import a single type file (sheet) into neris_codes table"""
    cursor = conn.cursor()
    
    headers = [cell.value for cell in sheet[1]]
    if not headers or headers[0] is None:
        return 0
    
    # Normalize header names
    headers = [h.lower().strip() if h else '' for h in headers]
    
    # Find column indices
    def find_col(names):
        for name in names:
            if name in headers:
                return headers.index(name)
        return None
    
    value_idx = find_col(['value'])
    active_idx = find_col(['active'])
    desc_idx = find_col(['description'])
    desc1_idx = find_col(['description_1'])
    desc2_idx = find_col(['description_2'])
    desc3_idx = find_col(['description_3'])
    v1_idx = find_col(['value_1'])
    v2_idx = find_col(['value_2'])
    v3_idx = find_col(['value_3'])
    def_idx = find_col(['definition', 'definition_1'])
    nfirs_idx = find_col(['nfirs crosswalk', 'nfirs_crosswalk'])
    
    if value_idx is None:
        print(f"  Skipping {category}: no 'value' column")
        return 0
    
    # Delete existing codes for this category
    cursor.execute("DELETE FROM neris_codes WHERE category = %s", (category,))
    
    imported = 0
    for row in list(sheet.rows)[1:]:  # Skip header
        vals = [cell.value for cell in row]
        
        value = vals[value_idx] if value_idx is not None else None
        if not value:
            continue
        
        active = vals[active_idx] if active_idx is not None else True
        if active is None:
            active = True
        
        # Handle description - could be single or hierarchical
        if desc1_idx is not None:
            description = vals[desc1_idx]
            description_1 = vals[desc1_idx]
            description_2 = vals[desc2_idx] if desc2_idx is not None else None
            description_3 = vals[desc3_idx] if desc3_idx is not None else None
        elif desc_idx is not None:
            description = vals[desc_idx]
            description_1 = vals[desc_idx]
            description_2 = None
            description_3 = None
        else:
            description = value
            description_1 = value
            description_2 = None
            description_3 = None
        
        value_1 = vals[v1_idx] if v1_idx is not None else None
        value_2 = vals[v2_idx] if v2_idx is not None else None
        value_3 = vals[v3_idx] if v3_idx is not None else None
        
        definition = vals[def_idx] if def_idx is not None else None
        nfirs_crosswalk = str(vals[nfirs_idx]) if nfirs_idx is not None and vals[nfirs_idx] else None
        
        cursor.execute("""
            INSERT INTO neris_codes 
            (category, value, description, description_1, description_2, description_3,
             value_1, value_2, value_3, definition, nfirs_crosswalk, active, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            category, value, description, description_1, description_2, description_3,
            value_1, value_2, value_3, definition, nfirs_crosswalk, active,
            datetime.now(timezone.utc)
        ))
        imported += 1
    
    conn.commit()
    return imported

def main():
    conn = get_connection()
    
    total_categories = 0
    total_codes = 0
    
    for xlsx_path in XLSX_FILES:
        print(f"\nProcessing: {xlsx_path}")
        try:
            wb = openpyxl.load_workbook(xlsx_path)
        except FileNotFoundError:
            print(f"  ERROR: File not found: {xlsx_path}")
            continue
        
        for sheet_name in wb.sheetnames:
            if not sheet_name.startswith('type_'):
                print(f"  Skipping non-type sheet: {sheet_name}")
                continue
            
            sheet = wb[sheet_name]
            count = import_type_file(conn, sheet_name, sheet)
            if count > 0:
                print(f"  {sheet_name}: {count} codes imported")
                total_categories += 1
                total_codes += count
    
    conn.close()
    
    print(f"\n{'='*50}")
    print(f"IMPORT COMPLETE")
    print(f"Categories: {total_categories}")
    print(f"Total codes: {total_codes}")
    print(f"{'='*50}")

if __name__ == '__main__':
    main()
