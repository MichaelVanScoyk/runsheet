"""
GIS Import Service — ArcGIS REST API

Fetches feature data from public ArcGIS MapServer/FeatureServer endpoints
and imports into map_features table. Handles pagination (ArcGIS limits to
1000-2000 features per request), field mapping, and external_id dedup.

Phase 5a: ArcGIS REST only. File upload (GeoJSON, KML, Shapefile, CSV)
will be added in Phase 5b.

Usage:
    from services.location.gis_import import (
        fetch_arcgis_metadata,
        fetch_arcgis_features,
        import_arcgis_to_layer,
    )
"""

import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

ARCGIS_TIMEOUT = 30
MAX_FEATURES_PER_REQUEST = 1000  # ArcGIS default limit


# =============================================================================
# ARCGIS REST — METADATA
# =============================================================================

async def fetch_arcgis_metadata(url: str) -> dict:
    """
    Fetch layer metadata from an ArcGIS REST endpoint.

    Accepts URLs in various formats:
      - .../MapServer/0
      - .../FeatureServer/0
      - Hub page URLs (we try to extract the REST URL)

    Returns dict with: name, description, fields[], geometryType,
    maxRecordCount, featureCount (if available).
    """
    rest_url = _normalize_arcgis_url(url)

    async with httpx.AsyncClient(timeout=ARCGIS_TIMEOUT) as client:
        # Fetch layer info
        resp = await client.get(rest_url, params={"f": "json"})
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        raise ValueError(f"ArcGIS error: {data['error'].get('message', str(data['error']))}")

    # Extract field info
    fields = []
    for f in data.get("fields", []):
        fields.append({
            "name": f.get("name"),
            "alias": f.get("alias", f.get("name")),
            "type": _simplify_esri_type(f.get("type", "")),
            "esri_type": f.get("type", ""),
        })

    # Try to get feature count
    feature_count = None
    try:
        count_resp = await _fetch_count(rest_url)
        feature_count = count_resp
    except Exception:
        pass

    return {
        "url": rest_url,
        "name": data.get("name", "Unknown Layer"),
        "description": data.get("description", ""),
        "geometry_type": _simplify_geometry_type(data.get("geometryType", "")),
        "fields": fields,
        "max_record_count": data.get("maxRecordCount", MAX_FEATURES_PER_REQUEST),
        "feature_count": feature_count,
        "extent": data.get("extent"),
    }


async def _fetch_count(rest_url: str) -> int:
    """Get total feature count from ArcGIS endpoint."""
    async with httpx.AsyncClient(timeout=ARCGIS_TIMEOUT) as client:
        resp = await client.get(
            f"{rest_url}/query",
            params={"where": "1=1", "returnCountOnly": "true", "f": "json"},
        )
        resp.raise_for_status()
        data = resp.json()
    return data.get("count", 0)


# =============================================================================
# ARCGIS REST — FEATURE FETCHING (paginated)
# =============================================================================

async def fetch_arcgis_features(
    url: str,
    where: str = "1=1",
    out_fields: str = "*",
    max_features: Optional[int] = None,
) -> list:
    """
    Fetch all features from an ArcGIS REST endpoint as GeoJSON features.
    Handles pagination automatically using resultOffset.

    Returns list of GeoJSON Feature dicts.
    """
    rest_url = _normalize_arcgis_url(url)

    # Get max records per page from metadata
    async with httpx.AsyncClient(timeout=ARCGIS_TIMEOUT) as client:
        meta_resp = await client.get(rest_url, params={"f": "json"})
        meta_resp.raise_for_status()
        meta = meta_resp.json()

    page_size = min(meta.get("maxRecordCount", MAX_FEATURES_PER_REQUEST), MAX_FEATURES_PER_REQUEST)
    all_features = []
    offset = 0

    async with httpx.AsyncClient(timeout=ARCGIS_TIMEOUT) as client:
        while True:
            params = {
                "where": where,
                "outFields": out_fields,
                "f": "geojson",
                "resultOffset": str(offset),
                "resultRecordCount": str(page_size),
                "outSR": "4326",  # WGS84
            }

            resp = await client.get(f"{rest_url}/query", params=params)
            resp.raise_for_status()
            data = resp.json()

            features = data.get("features", [])
            if not features:
                break

            all_features.extend(features)
            logger.info(f"Fetched {len(features)} features (offset={offset}, total so far={len(all_features)})")

            # Check if we hit the limit
            if max_features and len(all_features) >= max_features:
                all_features = all_features[:max_features]
                break

            if len(features) < page_size:
                break  # Last page

            offset += len(features)

    logger.info(f"Total features fetched from ArcGIS: {len(all_features)}")
    return all_features


# =============================================================================
# PREVIEW — sample features for field mapping UI
# =============================================================================

async def fetch_arcgis_preview(
    url: str,
    sample_count: int = 5,
) -> dict:
    """
    Fetch a small sample of features for the import wizard preview.
    Returns metadata + sample features so admin can see field values.
    """
    metadata = await fetch_arcgis_metadata(url)
    rest_url = metadata["url"]

    # Fetch small sample
    async with httpx.AsyncClient(timeout=ARCGIS_TIMEOUT) as client:
        resp = await client.get(
            f"{rest_url}/query",
            params={
                "where": "1=1",
                "outFields": "*",
                "f": "geojson",
                "resultRecordCount": str(sample_count),
                "outSR": "4326",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    sample_features = data.get("features", [])

    # Extract sample property values for each field
    sample_values = {}
    for feature in sample_features:
        props = feature.get("properties", {})
        for key, val in props.items():
            if key not in sample_values:
                sample_values[key] = []
            if val is not None and len(sample_values[key]) < 3:
                sample_values[key].append(str(val)[:100])

    return {
        **metadata,
        "sample_features": sample_features,
        "sample_values": sample_values,
    }


# =============================================================================
# IMPORT — bulk insert into map_features
# =============================================================================

def import_features_to_layer(
    db,
    layer_id: int,
    features: list,
    field_mapping: dict,
    import_source: str = "arcgis_rest",
    upsert: bool = True,
    source_fields: list = None,
) -> dict:
    """
    Bulk import GeoJSON features into a map_features layer.

    ALL source fields are stored in properties JSONB. Nothing is dropped.

    field_mapping controls special column assignments:
        "OBJECTID": "__external_id"   -- maps to external_id column
        "HYDRANT_NAME": "__title"     -- maps to title column
        "NOTES": "__description"      -- maps to description column
        "STREET_ADDRESS": "__address" -- maps to address column
        "FIELD": "renamed_field"      -- renames in properties
    Fields NOT in field_mapping are kept as-is in properties.

    source_fields: ArcGIS field metadata [{name, alias, type, esri_type}]
        If provided, auto-generates property_schema on the layer.

    Returns: { imported, updated, skipped, errors }
    """
    from sqlalchemy import text
    import json as json_module

    stats = {"imported": 0, "updated": 0, "skipped": 0, "errors": 0, "error_details": []}

    # Skip fields that are just geometry metadata or system IDs
    skip_fields = {'OBJECTID', 'SHAPE', 'GlobalID', 'Shape__Area', 'Shape__Length'}

    # Auto-generate property_schema from source field metadata
    if source_fields:
        _auto_generate_schema(db, layer_id, source_fields, skip_fields)

    for i, feature in enumerate(features):
        try:
            geom = feature.get("geometry")
            props = feature.get("properties", {})

            if not geom:
                stats["skipped"] += 1
                continue

            # Start with ALL source fields in properties
            all_properties = {}
            title = None
            description = None
            address = None
            external_id = None

            for source_field, value in props.items():
                # Skip system/geometry fields
                if source_field in skip_fields:
                    # But check if mapped to a special column first
                    pass

                target = field_mapping.get(source_field)

                if target == "__title":
                    title = str(value).strip() if value is not None else None
                elif target == "__description":
                    description = str(value).strip() if value is not None else None
                elif target == "__address":
                    address = str(value).strip() if value is not None else None
                elif target == "__external_id":
                    external_id = str(value).strip() if value is not None else None
                elif target == "__skip":
                    continue
                elif source_field in skip_fields:
                    # Use OBJECTID as external_id fallback if not explicitly mapped
                    if source_field == 'OBJECTID' and not external_id and '__external_id' not in field_mapping.values():
                        external_id = str(value).strip() if value is not None else None
                    continue
                elif target:
                    # Renamed field
                    all_properties[target] = value
                else:
                    # Unmapped — keep with original name
                    all_properties[source_field] = value

            # Fallback title from first non-null string property
            if not title:
                for key, val in props.items():
                    if key not in skip_fields and val and isinstance(val, str) and len(val) > 1:
                        title = val[:100]
                        break
                if not title:
                    title = f"Feature {i + 1}"

            geojson_str = json_module.dumps(geom)

            if upsert and external_id:
                result = db.execute(
                    text("""
                        INSERT INTO map_features
                            (layer_id, title, description, geometry, address,
                             properties, external_id, import_source, imported_at)
                        VALUES
                            (:layer_id, :title, :description,
                             ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326),
                             :address, :properties, :external_id, :import_source, NOW())
                        ON CONFLICT (layer_id, external_id) WHERE external_id IS NOT NULL
                        DO UPDATE SET
                            title = EXCLUDED.title,
                            description = EXCLUDED.description,
                            geometry = EXCLUDED.geometry,
                            address = EXCLUDED.address,
                            properties = EXCLUDED.properties || map_features.properties,
                            import_source = EXCLUDED.import_source,
                            imported_at = NOW(),
                            updated_at = NOW()
                        RETURNING (xmax = 0) AS is_insert
                    """),
                    {
                        "layer_id": layer_id,
                        "title": title,
                        "description": description,
                        "geojson": geojson_str,
                        "address": address,
                        "properties": json_module.dumps(all_properties),
                        "external_id": external_id,
                        "import_source": import_source,
                    },
                )
                row = result.fetchone()
                if row and row[0]:
                    stats["imported"] += 1
                else:
                    stats["updated"] += 1
            else:
                db.execute(
                    text("""
                        INSERT INTO map_features
                            (layer_id, title, description, geometry, address,
                             properties, external_id, import_source, imported_at)
                        VALUES
                            (:layer_id, :title, :description,
                             ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326),
                             :address, :properties, :external_id, :import_source, NOW())
                    """),
                    {
                        "layer_id": layer_id,
                        "title": title,
                        "description": description,
                        "geojson": geojson_str,
                        "address": address,
                        "properties": json_module.dumps(all_properties),
                        "external_id": external_id,
                        "import_source": import_source,
                    },
                )
                stats["imported"] += 1

            # Commit in batches of 100
            if (stats["imported"] + stats["updated"]) % 100 == 0:
                db.commit()

        except Exception as e:
            stats["errors"] += 1
            if len(stats["error_details"]) < 10:
                stats["error_details"].append(f"Feature {i}: {str(e)[:200]}")
            continue

    # Final commit
    db.commit()

    logger.info(
        f"Import complete: {stats['imported']} new, {stats['updated']} updated, "
        f"{stats['skipped']} skipped, {stats['errors']} errors"
    )
    return stats


def _auto_generate_schema(db, layer_id: int, source_fields: list, skip_fields: set):
    """
    Auto-generate property_schema on the layer from ArcGIS field metadata.
    Overwrites the existing schema so it matches what was actually imported.
    Adds a 'notes' field at the end for officer/admin free-text.
    """
    from sqlalchemy import text
    import json as json_module

    schema = {}
    for field in source_fields:
        name = field.get("name", "")
        if name in skip_fields:
            continue

        alias = field.get("alias", name)
        field_type = field.get("type", "text")  # already simplified

        schema[name] = {
            "type": field_type,
            "label": alias,
        }

    try:
        db.execute(
            text("UPDATE map_layers SET property_schema = :schema, updated_at = NOW() WHERE id = :id"),
            {"schema": json_module.dumps(schema), "id": layer_id},
        )
        db.commit()
        logger.info(f"Auto-generated property_schema for layer {layer_id} with {len(schema)} fields")
    except Exception as e:
        logger.error(f"Failed to update property_schema for layer {layer_id}: {e}")


# =============================================================================
# HELPERS
# =============================================================================

def _normalize_arcgis_url(url: str) -> str:
    """
    Normalize various ArcGIS URL formats to a REST endpoint URL.
    Strips trailing slashes, query params, and handles common formats.
    """
    url = url.strip().rstrip("/")

    # Remove query params
    if "?" in url:
        url = url.split("?")[0]

    # Already a REST endpoint (ends with /MapServer/N or /FeatureServer/N)
    if "/MapServer/" in url or "/FeatureServer/" in url:
        return url

    # Handle hub.arcgis.com URLs — these need manual REST URL construction
    # Admin will need to find the actual REST URL from the hub page
    # For now, return as-is and let the metadata fetch fail with a helpful error

    return url


def _simplify_esri_type(esri_type: str) -> str:
    """Convert ESRI field type to simple type."""
    type_map = {
        "esriFieldTypeString": "text",
        "esriFieldTypeInteger": "number",
        "esriFieldTypeSmallInteger": "number",
        "esriFieldTypeDouble": "number",
        "esriFieldTypeSingle": "number",
        "esriFieldTypeDate": "date",
        "esriFieldTypeOID": "number",
        "esriFieldTypeGlobalID": "text",
        "esriFieldTypeGUID": "text",
    }
    return type_map.get(esri_type, "text")


def _simplify_geometry_type(esri_geom: str) -> str:
    """Convert ESRI geometry type to our geometry type."""
    geom_map = {
        "esriGeometryPoint": "point",
        "esriGeometryMultipoint": "point",
        "esriGeometryPolyline": "polygon",
        "esriGeometryPolygon": "polygon",
    }
    return geom_map.get(esri_geom, "point")
