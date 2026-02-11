"""
Shared helpers for CAD infrastructure routers.

Keeps each router file focused on its endpoints.
"""

import json
from pydantic import BaseModel

# Reuse auth helpers from master_admin (single source of truth)
from routers.master_admin import get_current_admin, require_role, get_client_ip, log_audit


def iso(dt):
    """Safely convert datetime to ISO string"""
    return dt.isoformat() if dt else None


def build_update(data: BaseModel, allowed_fields: list):
    """
    Build dynamic UPDATE SET clause from Pydantic model.
    Only includes fields that were explicitly provided (not None).
    Returns (set_clause, values_list) or (None, None) if nothing to update.
    """
    updates = []
    values = []
    for field in allowed_fields:
        val = getattr(data, field, None)
        if val is not None:
            if isinstance(val, dict):
                updates.append(f"{field} = %s::jsonb")
                values.append(json.dumps(val))
            else:
                updates.append(f"{field} = %s")
                values.append(val)
    if not updates:
        return None, None
    return ", ".join(updates), values
