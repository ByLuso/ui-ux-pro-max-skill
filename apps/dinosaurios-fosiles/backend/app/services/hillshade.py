"""Hillshade LiDAR de alta resolución (5 m) para revelar relieve bajo vegetación.

A diferencia del resto de capas (calculadas una vez para toda la bbox de la región a 200 m),
esta funciona sobre la bbox visible del mapa (para el modo "comparar con LiDAR" del frontend):
a 5 m de resolución, una región entera pesaría gigabytes, así que se limita el área máxima por
petición y se pide acercar el zoom si el usuario está demasiado lejos. El LiDAR del IGN es de
cobertura nacional, así que esta herramienta no depende de la región activa — funciona en
cualquier punto de España.
"""
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import transform_bounds
from scipy.ndimage import distance_transform_edt, zoom

from app.services.http_utils import request_with_retry

IGN_WCS_URL = "https://servicios.idee.es/wcs-inspire/mdt"
LIDAR_NATIVE_CRS = "EPSG:25830"
LIDAR_COVERAGE_ID = "Elevacion25830_5"

# Por encima de esto (lado de la bbox, en metros) la petición al WCS a 5 m sería demasiado
# grande/lenta para un uso interactivo — se le pide al usuario que acerque el zoom.
MAX_SIDE_M = 3000

# El LiDAR del IGN viene a 5 m/píxel; sin más, estirar eso al zoom del mapa se ve a bloques o
# borroso según cómo lo escale el navegador. Antes de calcular el hillshade se interpola la
# rejilla a una más fina (spline cúbica) — no añade detalle real por debajo de 5 m, pero da
# curvas de relieve suaves en vez de escalones cuadrados.
SUPERSAMPLE_FACTOR = 3

# Hillshade multidireccional: promedia el sombreado desde varios azimuts para no ocultar
# relieve que casualmente esté alineado con una única dirección de luz (la limitación clásica
# de un hillshade de una sola pasada).
HILLSHADE_AZIMUTHS_DEG = [315, 45, 135, 225]
HILLSHADE_ALTITUDE_DEG = 45


class AreaTooLargeError(ValueError):
    """La bbox pedida supera MAX_SIDE_M; hay que acercar el zoom."""


def _fetch_lidar_bbox(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float
) -> tuple[np.ndarray, rasterio.Affine, rasterio.CRS]:
    minx, miny, maxx, maxy = transform_bounds("EPSG:4326", LIDAR_NATIVE_CRS, min_lon, min_lat, max_lon, max_lat)

    if (maxx - minx) > MAX_SIDE_M or (maxy - miny) > MAX_SIDE_M:
        raise AreaTooLargeError(
            f"El área visible es demasiado grande para el LiDAR de 5 m (máx. {MAX_SIDE_M} m de lado)."
        )

    response = request_with_retry(
        "GET",
        IGN_WCS_URL,
        params=[
            ("service", "WCS"),
            ("version", "2.0.1"),
            ("request", "GetCoverage"),
            ("coverageId", LIDAR_COVERAGE_ID),
            ("subset", f"x({minx},{maxx})"),
            ("subset", f"y({miny},{maxy})"),
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


def _fill_nodata_nearest(elevation: np.ndarray) -> np.ndarray:
    """Rellena huecos sin dato (bordes del recorte) con el valor válido más cercano: un NaN
    "contamina" sus vecinos al interpolar con spline cúbica, así que hay que quitarlos antes
    de supersamplear."""
    nan_mask = np.isnan(elevation)
    if not nan_mask.any():
        return elevation
    _, indices = distance_transform_edt(nan_mask, return_indices=True)
    return elevation[tuple(indices)]


def _supersample(elevation: np.ndarray, pixel_size: float) -> tuple[np.ndarray, float]:
    """Interpola la rejilla LiDAR a una más fina (spline cúbica) antes de calcular el
    hillshade. No añade detalle real por debajo de la resolución nativa del LiDAR (5 m), pero
    da curvas de relieve suaves en vez del aspecto "a bloques" de escalar en el navegador una
    imagen con pocos píxeles."""
    if SUPERSAMPLE_FACTOR <= 1:
        return elevation, pixel_size
    filled = _fill_nodata_nearest(elevation)
    upsampled = zoom(filled, SUPERSAMPLE_FACTOR, order=3)
    return upsampled, pixel_size / SUPERSAMPLE_FACTOR


def get_hillshade_png_and_bounds(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> tuple[bytes, list]:
    """Hillshade LiDAR de la bbox dada, como PNG en escala de grises + bounds WGS84 reales del
    recorte devuelto (pueden no coincidir exactamente con los pedidos por redondeo de píxel)."""
    elevation, transform, crs = _fetch_lidar_bbox(min_lon, min_lat, max_lon, max_lat)

    # Los bounds geográficos se calculan sobre la rejilla ORIGINAL (5 m): el área cubierta
    # sobre el terreno no cambia al supersamplear, solo la densidad de píxeles.
    native_bounds = rasterio.transform.array_bounds(elevation.shape[0], elevation.shape[1], transform)
    west, south, east, north = transform_bounds(crs, "EPSG:4326", *native_bounds)

    elevation, pixel_size = _supersample(elevation, transform.a)
    shaded = _multidirectional_hillshade(elevation, pixel_size)
    shaded = _stretch_contrast(shaded)
    img_uint8 = (np.nan_to_num(shaded, nan=0.0) * 255).astype("uint8")

    height, width = img_uint8.shape
    with MemoryFile() as memfile:
        with memfile.open(driver="PNG", height=height, width=width, count=1, dtype="uint8") as dst:
            dst.write(img_uint8, 1)
        png_bytes = memfile.read()

    return png_bytes, [[south, west], [north, east]]
