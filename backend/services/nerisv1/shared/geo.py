"""
nerisv1 shared: GeoPoint and HighPrecisionGeoMultipolygon builders

Source: Used by IncidentBasePayload, DispatchPayload, DispatchUnitResponsePayload,
        ExposurePayload, IncidentUnitResponsePayload
Schema: api-test.neris.fsri.org/v1/openapi.json v1.4.38

GeoPoint:
  - crs: integer|string (default 4326)
  - geometry: GeoJsonPoint (required)
    - type: string (default "Point")
    - coordinates: array (required) — [longitude, latitude]

HighPrecisionGeoMultipolygon:
  - crs: integer|string (default 4326)
  - geometry: HighPrecisionGeoJsonMultiPolygon (required)
    - type: string (default "MultiPolygon")
    - coordinates: array (required)
"""


def build_geo_point(data: dict) -> dict | None:
    """
    Build NERIS GeoPoint from a dict with NERIS-native field names.
    Expects data with 'crs' and 'geometry' keys, or None.
    Returns None if data is None/empty.
    """
    if not data:
        return None

    payload = {}

    # crs: integer|string — defaults to 4326
    payload["crs"] = data.get("crs", 4326)

    # geometry: GeoJsonPoint (required)
    geometry = data.get("geometry")
    if not geometry:
        return None

    payload["geometry"] = {
        "type": geometry.get("type", "Point"),
        "coordinates": geometry["coordinates"],
    }

    return payload


def build_high_precision_geo_multipolygon(data: dict) -> dict | None:
    """
    Build NERIS HighPrecisionGeoMultipolygon from a dict with NERIS-native field names.
    Expects data with 'crs' and 'geometry' keys, or None.
    Returns None if data is None/empty.
    """
    if not data:
        return None

    payload = {}

    # crs: integer|string — defaults to 4326
    payload["crs"] = data.get("crs", 4326)

    # geometry: HighPrecisionGeoJsonMultiPolygon (required)
    geometry = data.get("geometry")
    if not geometry:
        return None

    payload["geometry"] = {
        "type": geometry.get("type", "MultiPolygon"),
        "coordinates": geometry["coordinates"],
    }

    return payload
