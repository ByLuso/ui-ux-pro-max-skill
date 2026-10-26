"""Descarga el MDT del IGN (WCS) para una región y calcula la pendiente."""
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform_bounds

from app.config import Region, settings
from app.services.http_utils import request_with_retry

IGN_WCS_URL = "https://servicios.idee.es/wcs-inspire/mdt"
DEM_NATIVE_CRS = "EPSG:25830"
DEM_RESOLUTION_M = 200

# Clasificación de pendiente pensada para el caso de uso: taludes, cortes de
# carretera/cantera y acantilados son las zonas de interés (>15°).
SLOPE_CLASSES = [
    {"min_deg": 0, "max_deg": 5, "color": (34, 197, 94, 60), "label": "Llana (0-5°)"},
    {"min_deg": 5, "max_deg": 15, "color": (250, 204, 21, 130), "label": "Moderada (5-15°)"},
    {"min_deg": 15, "max_deg": 30, "color": (249, 115, 22, 180), "label": "Pronunciada (15-30°)"},
    {"min_deg": 30, "max_deg": 91, "color": (220, 38, 38, 210), "label": "Muy pronunciada / acantilado (>30°)"},
]


def _cache_dir() -> Path:
    path = Path(settings.cache_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def fetch_dem_geotiff(region: Region) -> Path:
    """Descarga (o reutiliza de caché) el MDT del IGN para la bbox de la región, en EPSG:25830."""
    cache_file = _cache_dir() / f"dem_{region.slug}_{DEM_RESOLUTION_M}m.tif"
    if cache_file.exists():
        return cache_file

    min_lon, min_lat, max_lon, max_lat = region.bbox
    minx, miny, maxx, maxy = transform_bounds(
        "EPSG:4326", DEM_NATIVE_CRS, min_lon, min_lat, max_lon, max_lat
    )

    response = request_with_retry(
        "GET",
        IGN_WCS_URL,
        params=[
            ("service", "WCS"),
            ("version", "2.0.1"),
            ("request", "GetCoverage"),
            ("coverageId", f"Elevacion25830_{DEM_RESOLUTION_M}"),
            ("subset", f"x({minx},{maxx})"),
            ("subset", f"y({miny},{maxy})"),
            ("format", "image/tiff"),
        ],
        timeout=60,
    )
    cache_file.write_bytes(response.content)
    return cache_file


def get_grid(region: Region) -> tuple[rasterio.Affine, tuple, rasterio.CRS]:
    """Transform/shape/CRS de la rejilla de análisis (la del MDT), reutilizada por otras capas."""
    with rasterio.open(fetch_dem_geotiff(region)) as dataset:
        return dataset.transform, dataset.shape, dataset.crs


def compute_slope_degrees(dem_path: Path) -> tuple[np.ndarray, rasterio.Affine, rasterio.CRS]:
    with rasterio.open(dem_path) as dataset:
        elevation = dataset.read(1).astype("float64")
        transform = dataset.transform
        crs = dataset.crs
        if dataset.nodata is not None:
            elevation[elevation == dataset.nodata] = np.nan

    pixel_size_x = transform.a
    pixel_size_y = -transform.e  # e es negativo en rasters "north-up"
    dzdrow, dzdcol = np.gradient(elevation, pixel_size_y, pixel_size_x)
    slope_deg = np.degrees(np.arctan(np.hypot(dzdcol, dzdrow)))
    return slope_deg, transform, crs


def _colorize_slope(slope_deg: np.ndarray) -> np.ndarray:
    height, width = slope_deg.shape
    rgba = np.zeros((4, height, width), dtype="uint8")
    valid = ~np.isnan(slope_deg)
    for slope_class in SLOPE_CLASSES:
        mask = valid & (slope_deg >= slope_class["min_deg"]) & (slope_deg < slope_class["max_deg"])
        for band, value in enumerate(slope_class["color"]):
            rgba[band][mask] = value
    return rgba


def get_slope_overlay(region: Region) -> dict:
    """Genera (o reutiliza de caché) el overlay PNG de pendiente y sus metadatos."""
    png_path = _cache_dir() / f"slope_{region.slug}_{DEM_RESOLUTION_M}m.png"
    meta_path = _cache_dir() / f"slope_{region.slug}_{DEM_RESOLUTION_M}m.json"

    if png_path.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        meta["png_path"] = str(png_path)
        return meta

    dem_path = fetch_dem_geotiff(region)
    slope_deg, src_transform, src_crs = compute_slope_degrees(dem_path)

    dst_crs = "EPSG:4326"
    src_bounds = rasterio.transform.array_bounds(*slope_deg.shape, src_transform)
    dst_transform, width, height = calculate_default_transform(
        src_crs, dst_crs, slope_deg.shape[1], slope_deg.shape[0], *src_bounds
    )

    reprojected = np.full((height, width), np.nan, dtype="float64")
    reproject(
        source=slope_deg,
        destination=reprojected,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs=dst_crs,
        resampling=Resampling.bilinear,
    )

    rgba = _colorize_slope(reprojected)
    with rasterio.open(
        png_path, "w", driver="PNG", height=height, width=width, count=4, dtype="uint8"
    ) as dst:
        dst.write(rgba)

    west, south, east, north = rasterio.transform.array_bounds(height, width, dst_transform)
    meta = {
        "bounds": [[south, west], [north, east]],
        "resolution_m": DEM_RESOLUTION_M,
        "legend": [
            {"label": c["label"], "color": f"rgba({c['color'][0]},{c['color'][1]},{c['color'][2]},{c['color'][3] / 255:.2f})"}
            for c in SLOPE_CLASSES
        ],
        "source": "IGN - Modelo Digital del Terreno (WCS, MDT200)",
    }
    meta_path.write_text(json.dumps(meta))
    meta["png_path"] = str(png_path)
    return meta
