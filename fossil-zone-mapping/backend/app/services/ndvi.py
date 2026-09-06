"""NDVI de Sentinel-2 vía la Process API de Copernicus Data Space Ecosystem."""
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject

from app.config import settings
from app.services.http_utils import request_with_retry

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"

TIME_WINDOW_DAYS = 90
MAX_CLOUD_COVERAGE = 30

# El índice se codifica en el rango [-1, 1] -> [0, 255] al pedirlo a la Process API.
NDVI_SCALE_OFFSET = 1.0
NDVI_SCALE_FACTOR = 127.5

# Umbrales pensados para el objetivo del proyecto: NDVI bajo = suelo/roca
# expuesta (señal positiva de fosilización), NDVI alto = vegetación densa
# que oculta el terreno. Mismo código de color (rojo = interés) que la
# capa de pendiente, para mantener un lenguaje visual consistente.
NDVI_CLASSES = [
    {"min": -1.0, "max": 0.1, "color": (220, 38, 38, 190), "label": "Suelo desnudo / roca expuesta (NDVI < 0.1)"},
    {"min": 0.1, "max": 0.3, "color": (249, 115, 22, 160), "label": "Vegetación escasa (0.1-0.3)"},
    {"min": 0.3, "max": 0.5, "color": (250, 204, 21, 120), "label": "Vegetación moderada (0.3-0.5)"},
    {"min": 0.5, "max": 1.01, "color": (34, 197, 94, 90), "label": "Vegetación densa (>0.5)"},
]

EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: { bands: 2, sampleType: "UINT8" }
  };
}
function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-6);
  let scaled = Math.max(0, Math.min(255, Math.round((ndvi + 1) * 127.5)));
  return [scaled, sample.dataMask * 255];
}
"""

_token_cache = {"access_token": None, "expires_at": 0.0}


def _cache_dir() -> Path:
    path = Path(settings.cache_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _region_slug() -> str:
    return settings.region_name.lower().replace(" ", "-")


def _get_access_token() -> str:
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    if not settings.copernicus_client_id or not settings.copernicus_client_secret:
        raise RuntimeError(
            "Faltan FZM_COPERNICUS_CLIENT_ID / FZM_COPERNICUS_CLIENT_SECRET en backend/.env"
        )

    response = request_with_retry(
        "POST",
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": settings.copernicus_client_id,
            "client_secret": settings.copernicus_client_secret,
        },
        timeout=20,
    )
    payload = response.json()
    _token_cache["access_token"] = payload["access_token"]
    _token_cache["expires_at"] = time.time() + payload["expires_in"]
    return _token_cache["access_token"]


def fetch_ndvi_geotiff() -> Path:
    """Pide (o reutiliza de caché) el NDVI de Sentinel-2 para la bbox configurada."""
    cache_file = _cache_dir() / f"ndvi_{_region_slug()}.tif"
    if cache_file.exists():
        return cache_file

    token = _get_access_token()
    now = datetime.now(timezone.utc)
    time_from = now - timedelta(days=TIME_WINDOW_DAYS)
    min_lon, min_lat, max_lon, max_lat = settings.region_bbox

    body = {
        "input": {
            "bounds": {
                "bbox": [min_lon, min_lat, max_lon, max_lat],
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {
                            "from": time_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "to": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        },
                        "maxCloudCoverage": MAX_CLOUD_COVERAGE,
                    },
                    "mosaickingOrder": "leastCC",
                }
            ],
        },
        "output": {
            "width": 1024,
            "height": 674,
            "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}],
        },
        "evalscript": EVALSCRIPT,
    }

    response = request_with_retry(
        "POST",
        PROCESS_URL,
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=60,
    )
    cache_file.write_bytes(response.content)
    return cache_file


def _colorize_ndvi(ndvi: np.ndarray, valid: np.ndarray) -> np.ndarray:
    height, width = ndvi.shape
    rgba = np.zeros((4, height, width), dtype="uint8")
    for ndvi_class in NDVI_CLASSES:
        mask = valid & (ndvi >= ndvi_class["min"]) & (ndvi < ndvi_class["max"])
        for band, value in enumerate(ndvi_class["color"]):
            rgba[band][mask] = value
    return rgba


def get_ndvi_on_grid(dst_transform: rasterio.Affine, dst_shape: tuple, dst_crs) -> np.ndarray:
    """Reproyecta el NDVI real (-1..1, NaN donde no hay dato válido) sobre la rejilla dada."""
    tif_path = fetch_ndvi_geotiff()
    with rasterio.open(tif_path) as dataset:
        scaled = dataset.read(1).astype("float64")
        data_mask = dataset.read(2)
        src_transform = dataset.transform
        src_crs = dataset.crs

    ndvi_real = scaled / NDVI_SCALE_FACTOR - NDVI_SCALE_OFFSET
    ndvi_real[data_mask == 0] = np.nan

    destination = np.full(dst_shape, np.nan, dtype="float64")
    reproject(
        source=ndvi_real,
        destination=destination,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs=dst_crs,
        resampling=Resampling.bilinear,
    )
    return destination


def get_ndvi_overlay() -> dict:
    """Genera (o reutiliza de caché) el overlay PNG de NDVI y sus metadatos."""
    slug = _region_slug()
    png_path = _cache_dir() / f"ndvi_{slug}.png"
    meta_path = _cache_dir() / f"ndvi_{slug}.json"

    if png_path.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        meta["png_path"] = str(png_path)
        return meta

    tif_path = fetch_ndvi_geotiff()
    with rasterio.open(tif_path) as dataset:
        scaled = dataset.read(1).astype("float64")
        data_mask = dataset.read(2)
        transform = dataset.transform
        west, south, east, north = dataset.bounds

    ndvi = scaled / NDVI_SCALE_FACTOR - NDVI_SCALE_OFFSET
    valid = data_mask > 0

    rgba = _colorize_ndvi(ndvi, valid)
    height, width = ndvi.shape
    with rasterio.open(
        png_path, "w", driver="PNG", height=height, width=width, count=4, dtype="uint8"
    ) as dst:
        dst.write(rgba)

    meta = {
        "bounds": [[south, west], [north, east]],
        "time_window_days": TIME_WINDOW_DAYS,
        "legend": [
            {
                "label": c["label"],
                "color": f"rgba({c['color'][0]},{c['color'][1]},{c['color'][2]},{c['color'][3] / 255:.2f})",
            }
            for c in NDVI_CLASSES
        ],
        "source": "Sentinel-2 L2A (Copernicus Data Space Ecosystem) - NDVI",
    }
    meta_path.write_text(json.dumps(meta))
    meta["png_path"] = str(png_path)
    return meta
