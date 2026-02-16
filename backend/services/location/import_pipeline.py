"""
GIS Import Pipeline — Shared import logic

Bulk import GeoJSON features into map_features table.
Used by both ArcGIS REST import and file upload import.

Usage:
    from services.location.import_pipeline import import_features_to_layer
"""

import json
import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


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

    source_fields: field metadata [{name, alias, type, esri_type}]
        If provided, auto-generates property_schema on the layer.

    Returns: { imported, updated, skipped, errors }
    """
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

            geojson_str = json.dumps(geom)

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
                        "properties": json.dumps(all_properties),
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
                        "properties": json.dumps(all_properties),
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
    Auto-generate property_schema on the layer from source field metadata.
    Overwrites the existing schema so it matches what was actually imported.
    """
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
            {"schema": json.dumps(schema), "id": layer_id},
        )
        db.commit()
        logger.info(f"Auto-generated property_schema for layer {layer_id} with {len(schema)} fields")
    except Exception as e:
        logger.error(f"Failed to update property_schema for layer {layer_id}: {e}")
