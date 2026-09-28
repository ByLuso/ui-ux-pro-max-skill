"""Hillshade LiDAR de alta resolución (5 m) para revelar relieve bajo vegetación en un punto.

A diferencia del resto de capas (calculadas una vez para toda la bbox de la región a 200 m),
esta funciona sobre un punto y un radio pequeño: a 5 m de resolución, una región entera pesaría
gigabytes. El LiDAR del IGN es de cobertura nacional, así que esta herramienta no depende de la
región activa — funciona en cualquier punto de España.
"""
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import transform as warp_transform, transform_bounds

from app.services.http_utils import request_with_retry

IGN_WCS_URL = "https://servicios.idee.es/wcs-inspire/mdt"
LIDAR_NATIVE_CRS = "EPSG:25830"
LIDAR_COVERAGE_ID = "Elevacion25830_5"

# Hillshade multidireccional: promedia el sombreado desde varios azimuts para no ocultar
# relieve que casualmente esté alineado con una única dirección de luz (la limitación clásica
# de un hillshade de una sola pasada).
HILLSHADE_AZIMUTHS_DEG = [315, 45, 135, 225]
HILLSHADE_ALTITUDE_DEG = 45


def _fetch_lidar_patch(lon: float, lat: float, radius_m: float) -> tuple[np.ndarray, rasterio.Affine, rasterio.CRS]:
    xs, ys = warp_transform("EPSG:4326", LIDAR_NATIVE_CRS, [lon], [lat])
    cx, cy = xs[0], ys[0]

    response = request_with_retry(
        "GET",
        IGN_WCS_URL,
        params=[
            ("service", "WCS"),
            ("version", "2.0.1"),
            ("request", "GetCoverage"),
            ("coverageId", LIDAR_COVERAGE_ID),
            ("subset", f"x({cx - radius_m},{cx + radius_m})"),
            ("subset", f"y({cy - radius_m},{cy + radius_m})"),
            ("format", "image/tiff"),
        ],
        timeout=30,
    )
    with MemoryFile(response.content) as memfile:
        with memfile.open() as dataset:
            elevation = dataset.read(1).astype("float64")
            transform = dataset.transform
            crs = dataset.crs
            if dataset.nodata is not None:
                elevation[elevation == dataset.nodata] = np.nan
    return elevation, transform, crs


def _multidirectional_hillshade(elevation: np.ndarray, pixel_size: float) -> np.ndarray:
    dzdy, dzdx = np.gradient(elevation, pixel_size, pixel_size)
    slope = np.pi / 2 - np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)

    altitude = np.radians(HILLSHADE_ALTITUDE_DEG)
    shaded_sum = np.zeros_like(elevation)
    for azimuth_deg in HILLSHADE_AZIMUTHS_DEG:
        azimuth = np.radians(360 - azimuth_deg + 90)
        shaded = np.sin(altitude) * np.sin(slope) + np.cos(altitude) * np.cos(slope) * np.cos(azimuth - aspect)
        shaded_sum += np.clip(shaded, 0, 1)
    return shaded_sum / len(HILLSHADE_AZIMUTHS_DEG)


def _stretch_contrast(shaded: np.ndarray) -> np.ndarray:
    """Estiramiento de percentiles (2-98): el promedio multidireccional aplana el contraste,
    y sin esto el relieve fino (justo lo que se busca revelar) queda casi invisible."""
    low, high = np.nanpercentile(shaded, [2, 98])
    if high <= low:
        return shaded
    return np.clip((shaded - low) / (high - low), 0, 1)


def get_hillshade_png_and_bounds(lon: float, lat: float, radius_m: float) -> tuple[bytes, list]:
    """Hillshade LiDAR (5 m) alrededor de (lon, lat), como PNG en escala de grises + bounds WGS84."""
    elevation, transform, crs = _fetch_lidar_patch(lon, lat, radius_m)
    shaded = _multidirectional_hillshade(elevation, transform.a)
    shaded = _stretch_contrast(shaded)
    img_uint8 = (np.nan_to_num(shaded, nan=0.0) * 255).astype("uint8")

    height, width = img_uint8.shape
    with MemoryFile() as memfile:
        with memfile.open(driver="PNG", height=height, width=width, count=1, dtype="uint8") as dst:
            dst.write(img_uint8, 1)
        png_bytes = memfile.read()

    native_bounds = rasterio.transform.array_bounds(height, width, transform)
    west, south, east, north = transform_bounds(crs, "EPSG:4326", *native_bounds)
    return png_bytes, [[south, west], [north, east]]
