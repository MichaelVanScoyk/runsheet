"""
GIS Import Service — ArcGIS REST API

Fetches feature data from public ArcGIS MapServer/FeatureServer endpoints.
Handles pagination (ArcGIS limits to 1000-2000 features per request).

For the shared import pipeline (import_features_to_layer), see import_pipeline.py.
For file upload parsing (GeoJSON, KML, Shapefile, CSV), see file_parser.py.

Usage:
    from services.location.gis_import import (
        fetch_arcgis_metadata,
        fetch_arcgis_features,
        fetch_arcgis_preview,
    )
    from services.location.import_pipeline import import_features_to_layer
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
    where: str = "1=1",
) -> dict:
    """
    Fetch a small sample of features for the import wizard preview.
    Returns metadata + sample features so admin can see field values.
    The where clause is applied to both the count and sample fetch so the
    feature_count returned matches what will actually be imported.
    """
    metadata = await fetch_arcgis_metadata(url)
    rest_url = metadata["url"]

    # Override the unfiltered count with the filtered count when a filter is active
    effective_where = (where or "1=1").strip()
    if effective_where and effective_where != "1=1":
        try:
            async with httpx.AsyncClient(timeout=ARCGIS_TIMEOUT) as client:
                count_resp = await client.get(
                    f"{rest_url}/query",
                    params={"where": effective_where, "returnCountOnly": "true", "f": "json"},
                )
                count_resp.raise_for_status()
                count_data = count_resp.json()
            metadata["feature_count"] = count_data.get("count", 0)
        except Exception:
            pass  # Fall back to unfiltered count from metadata

    # Fetch small sample using the same filter
    async with httpx.AsyncClient(timeout=ARCGIS_TIMEOUT) as client:
        resp = await client.get(
            f"{rest_url}/query",
            params={
                "where": effective_where,
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
