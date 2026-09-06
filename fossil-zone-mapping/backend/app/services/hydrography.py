"""Hidrografía del IGN (WFS) y cálculo de distancia a cursos de agua."""
import json
import tempfile
from pathlib import Path

import geopandas as gpd
import httpx
import numpy as np
import pandas as pd
import rasterio
import rasterio.features
from rasterio.warp import Resampling, calculate_default_transform, reproject
from scipy.ndimage import distance_transform_edt

from app.config import settings
from app.services import dem

IGN_WFS_URL = "https://servicios.idee.es/wfs-inspire/hidrografia"
WATERCOURSE_TYPE = "hy-p:Watercourse"
PAGE_SIZE = 5000

# Umbrales pensados para el objetivo del proyecto: cercanía a cauces se
# asocia a erosión activa/reciente, así que "cerca" es señal positiva
# (rojo, mismo lenguaje de color que pendiente y NDVI).
DISTANCE_CLASSES = [
    {"max_m": 100, "color": (220, 38, 38, 190), "label": "Muy cerca de un cauce (<100 m)"},
    {"max_m": 300, "color": (249, 115, 22, 150), "label": "Cerca de un cauce (100-300 m)"},
    {"max_m": 600, "color": (250, 204, 21, 110), "label": "Distancia moderada (300-600 m)"},
    {"max_m": float("inf"), "color": (34, 197, 94, 60), "label": "Lejos de cualquier cauce (>600 m)"},
]


def _cache_dir() -> Path:
    path = Path(settings.cache_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _region_slug() -> str:
    return settings.region_name.lower().replace(" ", "-")


def fetch_watercourses() -> Path:
    """Descarga (o reutiliza de caché) la red de cursos de agua del IGN para la bbox configurada."""
    cache_file = _cache_dir() / f"hydrography_{_region_slug()}.gpkg"
    if cache_file.exists():
        return cache_file

    min_lon, min_lat, max_lon, max_lat = settings.region_bbox
    bbox_param = f"{min_lat},{min_lon},{max_lat},{max_lon},urn:ogc:def:crs:EPSG::4326"

    frames = []
    start_index = 0
    while True:
        response = httpx.get(
            IGN_WFS_URL,
            params={
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": WATERCOURSE_TYPE,
                "bbox": bbox_param,
                "count": PAGE_SIZE,
                "startIndex": start_index,
            },
            timeout=120,
        )
        response.raise_for_status()
        with tempfile.NamedTemporaryFile(suffix=".gml") as tmp:
            tmp.write(response.content)
            tmp.flush()
            page = gpd.read_file(tmp.name)
        if page.empty:
            break
        frames.append(page[["geometry"]])
        if len(page) < PAGE_SIZE:
            break
        start_index += PAGE_SIZE

    watercourses = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    watercourses.to_file(cache_file, driver="GPKG")
    return cache_file


def compute_distance_raster() -> tuple[np.ndarray, rasterio.Affine, rasterio.CRS]:
    """Distancia (en metros) de cada celda de la malla del MDT al curso de agua más cercano."""
    transform, shape, crs = dem.get_grid()

    watercourses = gpd.read_file(fetch_watercourses()).to_crs(crs)
    water_mask = rasterio.features.rasterize(
        watercourses.geometry, out_shape=shape, transform=transform, fill=0, default_value=1
    ).astype(bool)

    pixel_size_m = transform.a
    distance_m = distance_transform_edt(~water_mask) * pixel_size_m
    return distance_m, transform, crs


def _colorize_distance(distance_m: np.ndarray) -> np.ndarray:
    height, width = distance_m.shape
    rgba = np.zeros((4, height, width), dtype="uint8")
    lower = 0.0
    for distance_class in DISTANCE_CLASSES:
        mask = (distance_m >= lower) & (distance_m < distance_class["max_m"])
        for band, value in enumerate(distance_class["color"]):
            rgba[band][mask] = value
        lower = distance_class["max_m"]
    return rgba


def get_hydrography_overlay() -> dict:
    """Genera (o reutiliza de caché) el overlay PNG de distancia a cauces y sus metadatos."""
    slug = _region_slug()
    png_path = _cache_dir() / f"hydro_distance_{slug}.png"
    meta_path = _cache_dir() / f"hydro_distance_{slug}.json"

    if png_path.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        meta["png_path"] = str(png_path)
        return meta

    distance_m, transform, crs = compute_distance_raster()

    dst_crs = "EPSG:4326"
    src_bounds = rasterio.transform.array_bounds(*distance_m.shape, transform)
    dst_transform, width, height = calculate_default_transform(
        crs, dst_crs, distance_m.shape[1], distance_m.shape[0], *src_bounds
    )
    reprojected = np.full((height, width), np.inf, dtype="float64")
    reproject(
        source=distance_m,
        destination=reprojected,
        src_transform=transform,
        src_crs=crs,
        dst_transform=dst_transform,
        dst_crs=dst_crs,
        resampling=Resampling.bilinear,
    )

    rgba = _colorize_distance(reprojected)
    with rasterio.open(
        png_path, "w", driver="PNG", height=height, width=width, count=4, dtype="uint8"
    ) as dst:
        dst.write(rgba)

    west, south, east, north = rasterio.transform.array_bounds(height, width, dst_transform)
    meta = {
        "bounds": [[south, west], [north, east]],
        "legend": [
            {
                "label": c["label"],
                "color": f"rgba({c['color'][0]},{c['color'][1]},{c['color'][2]},{c['color'][3] / 255:.2f})",
            }
            for c in DISTANCE_CLASSES
        ],
        "source": "IGN - Red hidrográfica (WFS INSPIRE), distancia calculada en el backend",
    }
    meta_path.write_text(json.dumps(meta))
    meta["png_path"] = str(png_path)
    return meta
