"""
nerisv1: NERIS Field Mapping Configuration

Endpoints:
  GET  /api/nerisv1/mapping/schema        — Introspect tenant DB (discover tables/columns)
  GET  /api/nerisv1/mapping/sample-data   — Most recent data for each column
  GET  /api/nerisv1/mapping               — Get all active mappings
  GET  /api/nerisv1/mapping/section/{num}  — Get mappings for a section
  POST /api/nerisv1/mapping               — Create a mapping
  PUT  /api/nerisv1/mapping/{id}          — Update a mapping
  DELETE /api/nerisv1/mapping/{id}        — Delete a mapping
  POST /api/nerisv1/mapping/create-column — Create a new DB column (ALTER TABLE)
"""

import logging
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Pydantic models
# ============================================================================

class MappingCreate(BaseModel):
    neris_section: int
    neris_field_path: str
    neris_type: Optional[str] = None
    neris_required: bool = False
    source_table: Optional[str] = None
    source_column: Optional[str] = None
    transform: str = "direct"
    transform_params: Optional[dict] = None
    priority: int = 1
    notes: Optional[str] = None


class MappingUpdate(BaseModel):
    source_table: Optional[str] = None
    source_column: Optional[str] = None
    transform: Optional[str] = None
    transform_params: Optional[dict] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CreateColumnRequest(BaseModel):
    table_name: str
    column_name: str
    column_type: str = "text"
    neris_field_hint: Optional[str] = None


# ============================================================================
# Tables we expose for mapping (safety: only these tables are introspectable)
# ============================================================================

ALLOWED_TABLES = [
    "incidents",
    "incident_units",
    "incident_personnel",
    "municipalities",
    "apparatus",
    "settings",
]

# Tables where column creation is allowed
ALTERABLE_TABLES = [
    "incidents",
    "incident_units",
    "incident_personnel",
]

# Column types allowed for creation
ALLOWED_COLUMN_TYPES = [
    "text",
    "integer",
    "boolean",
    "timestamp",
    "date",
    "numeric",
    "jsonb",
]


# ============================================================================
# Helper: get column names for a table
# ============================================================================

def _get_col_names(db, table):
    result = db.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
        ORDER BY ordinal_position
    """), {"table": table})
    return [r[0] for r in result.fetchall()]


def _build_select(col_names):
    """Build SELECT clause casting all columns to text."""
    parts = []
    for c in col_names:
        parts.append('"' + c + '"::text')
    return ', '.join(parts)


def _truncate(val, maxlen=80):
    if val is None:
        return None
    val = str(val)
    if len(val) > maxlen:
        return val[:maxlen - 3] + '...'
    return val


# ============================================================================
# DB Schema Introspection
# ============================================================================

@router.get("/mapping/schema")
def get_db_schema(db: Session = Depends(get_db)):
    """
    Introspect the tenant database. Returns all columns from allowed tables.
    Dynamic — reflects current schema including columns created via mapping UI.
    """
    result = db.execute(text("""
        SELECT
            table_name,
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(:tables)
        ORDER BY table_name, ordinal_position
    """), {"tables": ALLOWED_TABLES})

    schema = {}
    for row in result.fetchall():
        tbl = row[0]
        if tbl not in schema:
            schema[tbl] = {"table": tbl, "columns": []}

        data_type = row[2]
        udt_name = row[6]
        max_len = row[5]

        if data_type == "ARRAY":
            type_str = udt_name.lstrip('_') + "[]"
        elif data_type == "USER-DEFINED":
            type_str = udt_name
        elif max_len:
            type_str = data_type + "(" + str(max_len) + ")"
        else:
            type_str = data_type

        schema[tbl]["columns"].append({
            "name": row[1],
            "type": type_str,
            "nullable": row[3] == "YES",
            "has_default": row[4] is not None,
        })

    return {"tables": list(schema.values())}


# ============================================================================
# Sample data — most recent CLOSED incident values for each column
# ============================================================================

@router.get("/mapping/sample-data")
def get_sample_data(db: Session = Depends(get_db)):
    """
    Get sample data from the most recent CLOSED incident and its related rows.
    Shows real values so the mapping UI can display them as context.
    """
    samples = {}

    # Find the latest closed incident for context
    latest_row = db.execute(text(
        "SELECT id FROM incidents WHERE status = 'CLOSED' ORDER BY id DESC LIMIT 1"
    )).fetchone()
    latest_id = latest_row[0] if latest_row else None

    for table in ALLOWED_TABLES:
        try:
            col_names = _get_col_names(db, table)
            if not col_names:
                continue

            select_parts = _build_select(col_names)

            # Build query per table
            if table == 'incidents' and latest_id is not None:
                query = "SELECT " + select_parts + ' FROM "incidents" WHERE id = ' + str(latest_id)
            elif table == 'incident_units' and latest_id is not None and 'incident_id' in col_names:
                query = "SELECT " + select_parts + ' FROM "incident_units" WHERE incident_id = ' + str(latest_id) + " ORDER BY id DESC LIMIT 1"
            elif table == 'incident_personnel' and latest_id is not None and 'incident_id' in col_names:
                query = "SELECT " + select_parts + ' FROM "incident_personnel" WHERE incident_id = ' + str(latest_id) + " ORDER BY id DESC LIMIT 1"
            elif 'id' in col_names:
                query = "SELECT " + select_parts + ' FROM "' + table + '" ORDER BY id DESC LIMIT 1'
            elif 'created_at' in col_names:
                query = "SELECT " + select_parts + ' FROM "' + table + '" ORDER BY created_at DESC LIMIT 1'
            else:
                query = "SELECT " + select_parts + ' FROM "' + table + '" LIMIT 1'

            row = db.execute(text(query)).fetchone()

            if row:
                samples[table] = {}
                for i, col in enumerate(col_names):
                    samples[table][col] = _truncate(row[i])
        except Exception as e:
            logger.warning("Failed to sample %s: %s", table, e)
            samples[table] = {}

    return samples


# ============================================================================
# Mapping CRUD
# ============================================================================

@router.get("/mapping")
def get_all_mappings(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Get all field mappings, optionally filtered to active only."""
    query = "SELECT * FROM neris_field_mapping"
    if active_only:
        query += " WHERE is_active = TRUE"
    query += " ORDER BY neris_section, neris_field_path, priority"

    rows = db.execute(text(query)).fetchall()
    columns = [
        "id", "neris_section", "neris_field_path", "neris_type", "neris_required",
        "source_table", "source_column", "transform", "transform_params",
        "priority", "is_active", "notes", "created_at", "updated_at",
    ]
    return [dict(zip(columns, row)) for row in rows]


@router.get("/mapping/section/{section_num}")
def get_section_mappings(
    section_num: int,
    db: Session = Depends(get_db),
):
    """Get all active mappings for a specific NERIS section."""
    rows = db.execute(text("""
        SELECT * FROM neris_field_mapping
        WHERE neris_section = :sec AND is_active = TRUE
        ORDER BY neris_field_path, priority
    """), {"sec": section_num}).fetchall()

    columns = [
        "id", "neris_section", "neris_field_path", "neris_type", "neris_required",
        "source_table", "source_column", "transform", "transform_params",
        "priority", "is_active", "notes", "created_at", "updated_at",
    ]
    return [dict(zip(columns, row)) for row in rows]


@router.post("/mapping")
def create_mapping(
    mapping: MappingCreate,
    db: Session = Depends(get_db),
):
    """Create a new field mapping."""
    if mapping.source_table and mapping.source_table not in ALLOWED_TABLES:
        raise HTTPException(400, "Table '" + mapping.source_table + "' not in allowed tables")

    if not 1 <= mapping.neris_section <= 23:
        raise HTTPException(400, "Section must be 1-23")

    try:
        result = db.execute(text("""
            INSERT INTO neris_field_mapping
                (neris_section, neris_field_path, neris_type, neris_required,
                 source_table, source_column, transform, transform_params,
                 priority, notes)
            VALUES
                (:sec, :path, :type, :req,
                 :s_table, :s_col, :transform, :params::jsonb,
                 :priority, :notes)
            RETURNING id
        """), {
            "sec": mapping.neris_section,
            "path": mapping.neris_field_path,
            "type": mapping.neris_type,
            "req": mapping.neris_required,
            "s_table": mapping.source_table,
            "s_col": mapping.source_column,
            "transform": mapping.transform,
            "params": None if mapping.transform_params is None else str(mapping.transform_params).replace("'", '"'),
            "priority": mapping.priority,
            "notes": mapping.notes,
        })
        db.commit()
        new_id = result.fetchone()[0]
        return {"id": new_id, "status": "created"}
    except Exception as e:
        db.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(409, "Mapping already exists for " + mapping.neris_field_path + " at priority " + str(mapping.priority))
        raise HTTPException(500, str(e))


@router.put("/mapping/{mapping_id}")
def update_mapping(
    mapping_id: int,
    updates: MappingUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing field mapping."""
    set_parts = []
    params = {"id": mapping_id}

    if updates.source_table is not None:
        if updates.source_table not in ALLOWED_TABLES:
            raise HTTPException(400, "Table '" + updates.source_table + "' not in allowed tables")
        set_parts.append("source_table = :s_table")
        params["s_table"] = updates.source_table

    if updates.source_column is not None:
        set_parts.append("source_column = :s_col")
        params["s_col"] = updates.source_column

    if updates.transform is not None:
        set_parts.append("transform = :transform")
        params["transform"] = updates.transform

    if updates.transform_params is not None:
        set_parts.append("transform_params = :params::jsonb")
        params["params"] = str(updates.transform_params).replace("'", '"')

    if updates.priority is not None:
        set_parts.append("priority = :priority")
        params["priority"] = updates.priority

    if updates.is_active is not None:
        set_parts.append("is_active = :active")
        params["active"] = updates.is_active

    if updates.notes is not None:
        set_parts.append("notes = :notes")
        params["notes"] = updates.notes

    if not set_parts:
        raise HTTPException(400, "No fields to update")

    set_parts.append("updated_at = NOW()")
    set_clause = ", ".join(set_parts)

    result = db.execute(text(
        "UPDATE neris_field_mapping SET " + set_clause + " WHERE id = :id RETURNING id"
    ), params)
    db.commit()

    if result.fetchone() is None:
        raise HTTPException(404, "Mapping " + str(mapping_id) + " not found")

    return {"id": mapping_id, "status": "updated"}


@router.delete("/mapping/{mapping_id}")
def delete_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
):
    """Delete a field mapping."""
    result = db.execute(text("""
        DELETE FROM neris_field_mapping WHERE id = :id RETURNING id
    """), {"id": mapping_id})
    db.commit()

    if result.fetchone() is None:
        raise HTTPException(404, "Mapping " + str(mapping_id) + " not found")

    return {"id": mapping_id, "status": "deleted"}


# ============================================================================
# Create Column (ALTER TABLE from mapping UI)
# ============================================================================

@router.post("/mapping/create-column")
def create_column(
    req: CreateColumnRequest,
    db: Session = Depends(get_db),
):
    """
    Create a new column on a tenant table from the mapping UI.
    Restricted to allowed tables and types. Logged for audit.
    """
    if req.table_name not in ALTERABLE_TABLES:
        raise HTTPException(400, "Cannot add columns to '" + req.table_name + "'. Allowed: " + str(ALTERABLE_TABLES))

    if req.column_type not in ALLOWED_COLUMN_TYPES:
        raise HTTPException(400, "Column type '" + req.column_type + "' not allowed. Allowed: " + str(ALLOWED_COLUMN_TYPES))

    if not req.column_name.replace("_", "").isalnum():
        raise HTTPException(400, "Column name must be alphanumeric with underscores only")

    if len(req.column_name) > 63:
        raise HTTPException(400, "Column name too long (max 63 chars)")

    exists = db.execute(text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = :table
          AND column_name = :col
    """), {"table": req.table_name, "col": req.column_name}).fetchone()

    if exists:
        raise HTTPException(409, "Column '" + req.column_name + "' already exists on '" + req.table_name + "'")

    try:
        db.execute(text(
            'ALTER TABLE "' + req.table_name + '" ADD COLUMN "' + req.column_name + '" ' + req.column_type
        ))

        db.execute(text("""
            INSERT INTO neris_field_mapping_columns_log
                (table_name, column_name, column_type, neris_field_hint)
            VALUES
                (:table, :col, :type, :hint)
        """), {
            "table": req.table_name,
            "col": req.column_name,
            "type": req.column_type,
            "hint": req.neris_field_hint,
        })

        db.commit()
        logger.info("Created column %s.%s (%s) via mapping UI", req.table_name, req.column_name, req.column_type)

        return {
            "status": "created",
            "table": req.table_name,
            "column": req.column_name,
            "type": req.column_type,
        }
    except Exception as e:
        db.rollback()
        logger.error("Failed to create column: %s", e)
        raise HTTPException(500, "Failed to create column: " + str(e))


# ============================================================================
# Column creation audit log
# ============================================================================

@router.get("/mapping/columns-log")
def get_columns_log(db: Session = Depends(get_db)):
    """Get audit log of columns created through the mapping UI."""
    rows = db.execute(text("""
        SELECT id, table_name, column_name, column_type, created_by, neris_field_hint, created_at
        FROM neris_field_mapping_columns_log
        ORDER BY created_at DESC
    """)).fetchall()

    return [
        {
            "id": r[0], "table_name": r[1], "column_name": r[2],
            "column_type": r[3], "created_by": r[4],
            "neris_field_hint": r[5], "created_at": r[6],
        }
        for r in rows
    ]
