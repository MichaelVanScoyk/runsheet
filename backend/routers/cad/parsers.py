"""
Parser template management — CRUD, clone, version tracking.

A parser template defines how to parse a specific CAD vendor's data format.
Chester County DES sends HTML tables — that's one template. Another county
might send XML or JSON — each gets its own template.

Templates are reusable across tenants and cloneable. When a vendor's format
changes slightly, clone the existing template and tweak it rather than
modifying the one that's working for other tenants.

Version auto-bumps when parsing_config changes, so you can track what changed.
test_sample_data stores example input for testing in the admin UI.

Format types: html_table, xml, json, csv, fixed_width, pdf, email_body, plaintext

Tables: cad_parser_templates (cadreport_master)
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional
import json
import logging

from master_database import get_master_db
from .helpers import require_role, get_client_ip, log_audit, iso, build_update

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_FORMATS = ['html_table', 'xml', 'json', 'csv', 'fixed_width', 'pdf', 'email_body', 'plaintext']


class ParserTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_contact: Optional[str] = None
    format_type: str
    parsing_config: dict = {}
    test_sample_data: Optional[str] = None
    clone_from_id: Optional[int] = None

class ParserTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    vendor_name: Optional[str] = None
    vendor_contact: Optional[str] = None
    format_type: Optional[str] = None
    parsing_config: Optional[dict] = None
    test_sample_data: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/parsers")
async def list_parsers(
    active_only: bool = False,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """List all parser templates with usage counts"""
    with get_master_db() as db:
        query = """
            SELECT p.id, p.name, p.description, p.vendor_name, p.format_type,
                   p.version, p.cloned_from_id, p.is_active,
                   p.last_tested_at, p.created_at, p.updated_at,
                   COUNT(l.id) as usage_count
            FROM cad_parser_templates p
            LEFT JOIN cad_listeners l ON l.parser_template_id = p.id
        """
        if active_only:
            query += " WHERE p.is_active = TRUE"
        query += " GROUP BY p.id ORDER BY p.name"

        results = db.fetchall(query)

        return {
            'parsers': [{
                'id': r[0], 'name': r[1], 'description': r[2], 'vendor_name': r[3],
                'format_type': r[4], 'version': r[5], 'cloned_from_id': r[6],
                'is_active': r[7], 'last_tested_at': iso(r[8]),
                'created_at': iso(r[9]), 'updated_at': iso(r[10]),
                'usage_count': r[11],
            } for r in results]
        }


@router.get("/parsers/{parser_id}")
async def get_parser(
    parser_id: int,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'READONLY']))
):
    """Get parser template details including config"""
    with get_master_db() as db:
        p = db.fetchone("""
            SELECT id, name, description, vendor_name, vendor_contact,
                   format_type, parsing_config, version, cloned_from_id,
                   test_sample_data, last_test_result, last_tested_at,
                   is_active, created_at, updated_at
            FROM cad_parser_templates WHERE id = %s
        """, (parser_id,))

        if not p:
            raise HTTPException(status_code=404, detail="Parser template not found")

        return {
            'parser': {
                'id': p[0], 'name': p[1], 'description': p[2],
                'vendor_name': p[3], 'vendor_contact': p[4],
                'format_type': p[5], 'parsing_config': p[6] or {},
                'version': p[7], 'cloned_from_id': p[8],
                'test_sample_data': p[9], 'last_test_result': p[10] or {},
                'last_tested_at': iso(p[11]), 'is_active': p[12],
                'created_at': iso(p[13]), 'updated_at': iso(p[14]),
            }
        }


@router.post("/parsers")
async def create_parser(
    data: ParserTemplateCreate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Create a new parser template, optionally cloned from an existing one"""
    if data.format_type not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"format_type must be one of: {VALID_FORMATS}")

    with get_master_db() as db:
        parsing_config = data.parsing_config

        if data.clone_from_id:
            source = db.fetchone("""
                SELECT parsing_config, test_sample_data
                FROM cad_parser_templates WHERE id = %s
            """, (data.clone_from_id,))
            if not source:
                raise HTTPException(status_code=404, detail="Clone source not found")
            if not parsing_config:
                parsing_config = source[0] or {}
            if not data.test_sample_data:
                data.test_sample_data = source[1]

        db.execute("""
            INSERT INTO cad_parser_templates
            (name, description, vendor_name, vendor_contact, format_type,
             parsing_config, version, cloned_from_id, test_sample_data,
             is_active, created_by)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, 1, %s, %s, TRUE, %s)
        """, (
            data.name, data.description, data.vendor_name, data.vendor_contact,
            data.format_type, json.dumps(parsing_config),
            data.clone_from_id, data.test_sample_data, admin['id']
        ))
        db.commit()

        new_id = db.fetchone(
            "SELECT id FROM cad_parser_templates WHERE name = %s ORDER BY id DESC LIMIT 1",
            (data.name,))[0]

        log_audit(db, admin['id'], admin['email'], 'CREATE_PARSER_TEMPLATE',
                  'PARSER', new_id, data.name,
                  {'format': data.format_type, 'cloned_from': data.clone_from_id},
                  get_client_ip(request))

        return {'status': 'ok', 'id': new_id, 'name': data.name}


@router.put("/parsers/{parser_id}")
async def update_parser(
    parser_id: int,
    data: ParserTemplateUpdate,
    request: Request,
    admin: dict = Depends(require_role(['SUPER_ADMIN', 'ADMIN']))
):
    """Update parser template. Bumps version if parsing_config changes."""
    with get_master_db() as db:
        existing = db.fetchone(
            "SELECT name FROM cad_parser_templates WHERE id = %s", (parser_id,))
        if not existing:
            raise HTTPException(status_code=404, detail="Parser template not found")

        if data.format_type and data.format_type not in VALID_FORMATS:
            raise HTTPException(status_code=400, detail=f"format_type must be one of: {VALID_FORMATS}")

        set_clause, values = build_update(data, [
            'name', 'description', 'vendor_name', 'vendor_contact',
            'format_type', 'parsing_config', 'test_sample_data', 'is_active'
        ])

        if set_clause:
            if data.parsing_config is not None:
                set_clause += ", version = version + 1"

            values.append(parser_id)
            db.execute(
                f"UPDATE cad_parser_templates SET {set_clause}, updated_at = NOW() WHERE id = %s",
                tuple(values))
            db.commit()

        log_audit(db, admin['id'], admin['email'], 'UPDATE_PARSER_TEMPLATE',
                  'PARSER', parser_id, existing[0], ip_address=get_client_ip(request))

        return {'status': 'ok'}
