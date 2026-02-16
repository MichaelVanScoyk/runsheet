"""
GIS File Parser — Upload file parsing for map imports

Parses uploaded GIS files into standardized GeoJSON features.
Supports: GeoJSON, KML, KMZ, Shapefile (.zip), CSV (with lat/lng columns).

All formats are handled through geopandas, which normalizes them into
a consistent GeoDataFrame that we convert to GeoJSON features.

For the shared import pipeline, see import_pipeline.py.
For ArcGIS REST imports, see gis_import.py.

Usage:
    from services.location.file_parser import parse_gis_file
"""

import json
import logging
import os
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Column name patterns for lat/lng detection in CSV files
LAT_PATTERNS = {'latitude', 'lat', 'y', 'lat_dd', 'point_y', 'ycoord', 'y_coord'}
LNG_PATTERNS = {'longitude', 'lng', 'lon', 'long', 'x', 'lng_dd', 'point_x', 'xcoord', 'x_coord'}

# Supported file extensions
SUPPORTED_EXTENSIONS = {'.geojson', '.json', '.kml', '.kmz', '.zip', '.csv', '.tsv'}

# Max file size: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024


def parse_gis_file(filepath: str, original_filename: str) -> dict:
    """
    Parse an uploaded GIS file into standardized GeoJSON features.

    Args:
        filepath: Path to the uploaded temp file on disk
        original_filename: Original filename from the upload (for extension detection)

    Returns:
        {
            "features": [GeoJSON Feature dicts],
            "fields": [{"name": str, "type": str}],
            "geometry_type": "point" | "polygon",
            "feature_count": int,
            "source_filename": str,
            "format": str,  # "geojson", "kml", "shapefile", "csv"
        }

    Raises:
        ValueError: If file format unsupported, parsing fails, or no geometry found
    """
    import geopandas as gpd

    ext = Path(original_filename).suffix.lower()

    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format: {ext}. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # Check file size
    file_size = os.path.getsize(filepath)
    if file_size > MAX_FILE_SIZE:
        raise ValueError(f"File too large ({file_size / 1024 / 1024:.1f}MB). Maximum is 50MB.")

    # --- CSV: needs special handling (no native geometry) ---
    if ext in ('.csv', '.tsv'):
        return _parse_csv(filepath, original_filename)

    # --- KMZ: extract KML from zip first ---
    read_path = filepath
    temp_dir = None
    detected_format = _detect_format(ext)

    if ext == '.kmz':
        temp_dir = tempfile.mkdtemp(prefix='cadreport_kmz_')
        read_path = _extract_kmz(filepath, temp_dir)
        detected_format = "kml"

    # --- Shapefile in .zip: extract and find .shp ---
    if ext == '.zip':
        temp_dir = tempfile.mkdtemp(prefix='cadreport_shp_')
        read_path = _extract_shapefile_zip(filepath, temp_dir)
        detected_format = "shapefile"

    try:
        # geopandas handles GeoJSON, KML, and Shapefile natively
        gdf = gpd.read_file(read_path)

        if gdf.empty:
            raise ValueError("File contains no features")

        if gdf.geometry.isna().all():
            raise ValueError("File contains no valid geometries")

        # Reproject to WGS84 if needed
        if gdf.crs and gdf.crs.to_epsg() != 4326:
            logger.info(f"Reprojecting from {gdf.crs} to EPSG:4326")
            gdf = gdf.to_crs(epsg=4326)

        return _geodataframe_to_result(gdf, original_filename, detected_format)

    finally:
        # Clean up extracted temp files
        if temp_dir:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)


def _parse_csv(filepath: str, original_filename: str) -> dict:
    """
    Parse a CSV/TSV file with lat/lng columns into GeoJSON features.
    Auto-detects latitude and longitude columns by name matching.
    """
    import geopandas as gpd
    import pandas as pd

    ext = Path(original_filename).suffix.lower()
    sep = '\t' if ext == '.tsv' else ','

    df = pd.read_csv(filepath, sep=sep)

    if df.empty:
        raise ValueError("CSV file is empty")

    # Normalize column names for matching (lowercase, stripped)
    col_lower = {col: col.lower().strip() for col in df.columns}

    lat_col = None
    lng_col = None

    for orig_name, lower_name in col_lower.items():
        if lower_name in LAT_PATTERNS and lat_col is None:
            lat_col = orig_name
        if lower_name in LNG_PATTERNS and lng_col is None:
            lng_col = orig_name

    if not lat_col or not lng_col:
        available = ', '.join(df.columns.tolist())
        raise ValueError(
            f"Could not detect latitude/longitude columns. "
            f"Available columns: {available}. "
            f"Expected column names like: latitude/lat/y, longitude/lng/lon/x"
        )

    # Drop rows without coordinates
    df = df.dropna(subset=[lat_col, lng_col])

    if df.empty:
        raise ValueError(f"No rows with valid coordinates in columns {lat_col}/{lng_col}")

    # Convert to numeric, coerce errors
    df[lat_col] = pd.to_numeric(df[lat_col], errors='coerce')
    df[lng_col] = pd.to_numeric(df[lng_col], errors='coerce')
    df = df.dropna(subset=[lat_col, lng_col])

    # Create GeoDataFrame from lat/lng
    gdf = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df[lng_col], df[lat_col]),
        crs="EPSG:4326",
    )

    # Drop the original lat/lng columns from properties (they're in geometry now)
    gdf = gdf.drop(columns=[lat_col, lng_col], errors='ignore')

    return _geodataframe_to_result(gdf, original_filename, "csv")


def _geodataframe_to_result(gdf, original_filename: str, detected_format: str) -> dict:
    """
    Convert a GeoDataFrame to our standardized result dict.
    Extracts GeoJSON features, field metadata, and geometry type.
    """
    # Drop geometry column from properties list
    property_cols = [c for c in gdf.columns if c != 'geometry']

    # Detect field types
    fields = []
    for col in property_cols:
        dtype = str(gdf[col].dtype)
        if 'int' in dtype or 'float' in dtype:
            field_type = 'number'
        elif 'datetime' in dtype:
            field_type = 'date'
        elif 'bool' in dtype:
            field_type = 'boolean'
        else:
            field_type = 'text'

        fields.append({"name": col, "type": field_type})

    # Detect dominant geometry type
    geom_types = gdf.geometry.geom_type.dropna().unique().tolist()
    has_polygon = any(g in ('Polygon', 'MultiPolygon') for g in geom_types)
    geometry_type = 'polygon' if has_polygon else 'point'

    # Convert to GeoJSON features
    features = []
    for idx, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue

        properties = {}
        for col in property_cols:
            val = row[col]
            # Convert numpy/pandas types to native Python
            if hasattr(val, 'item'):
                val = val.item()
            elif hasattr(val, 'isoformat'):
                val = val.isoformat()
            # NaN → None
            if isinstance(val, float) and val != val:
                val = None
            properties[col] = val

        features.append({
            "type": "Feature",
            "geometry": _geometry_to_geojson(geom),
            "properties": properties,
        })

    logger.info(
        f"Parsed {len(features)} features from {original_filename} "
        f"({detected_format}, {geometry_type}, {len(fields)} fields)"
    )

    return {
        "features": features,
        "fields": fields,
        "geometry_type": geometry_type,
        "feature_count": len(features),
        "source_filename": original_filename,
        "format": detected_format,
    }


def _geometry_to_geojson(geom) -> dict:
    """Convert a shapely geometry to a GeoJSON dict."""
    from shapely.geometry import mapping
    return mapping(geom)


def _extract_kmz(filepath: str, dest_dir: str) -> str:
    """Extract .kml from a .kmz file (which is just a zip)."""
    try:
        with zipfile.ZipFile(filepath, 'r') as z:
            kml_files = [f for f in z.namelist() if f.lower().endswith('.kml')]
            if not kml_files:
                raise ValueError("KMZ file contains no .kml files")
            z.extract(kml_files[0], dest_dir)
            return os.path.join(dest_dir, kml_files[0])
    except zipfile.BadZipFile:
        raise ValueError("Invalid KMZ file (not a valid zip archive)")


def _extract_shapefile_zip(filepath: str, dest_dir: str) -> str:
    """Extract a zipped shapefile and return path to the .shp file."""
    try:
        with zipfile.ZipFile(filepath, 'r') as z:
            z.extractall(dest_dir)
            # Find .shp file (might be nested in a subdirectory)
            for root, dirs, files in os.walk(dest_dir):
                for f in files:
                    if f.lower().endswith('.shp'):
                        return os.path.join(root, f)
            raise ValueError(
                "ZIP file contains no .shp file. "
                "Shapefile uploads must be zipped with .shp, .dbf, and .prj files."
            )
    except zipfile.BadZipFile:
        raise ValueError("Invalid ZIP file")


def _detect_format(ext: str) -> str:
    """Map file extension to format name."""
    format_map = {
        '.geojson': 'geojson',
        '.json': 'geojson',
        '.kml': 'kml',
        '.kmz': 'kml',
        '.zip': 'shapefile',
    }
    return format_map.get(ext, 'unknown')
