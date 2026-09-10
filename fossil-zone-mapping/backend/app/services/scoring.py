"""Combina litología, pendiente, NDVI, distancia a cauces y yacimientos conocidos en un score 0-100."""
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform as warp_transform

from app.config import Region, settings
from app.services import dem, hydrography, known_sites, lithology, ndvi

# Valores a partir de los cuales cada variable satura su contribución al
# score (0-100). Elegidos para que coincidan con los rangos "de interés" ya
# usados en las capas individuales (pendiente >30°, NDVI <~0, agua <600m).
# Los yacimientos conocidos saturan a una distancia mayor (2 km): son pocos
# y dispersos, y sirven de refuerzo ("misma zona con hallazgos previos"),
# no de filtro exigente como la cercanía a un cauce.
SLOPE_SATURATION_DEG = 30.0
NDVI_SATURATION = 0.5
WATER_SATURATION_M = 600.0
KNOWN_SITES_SATURATION_M = 2000.0

LAYER_KEYS = ("lithology", "slope", "vegetation", "water", "known_sites")

# Rampa continua de color para el heatmap de score (0 = sin interés/transparente,
# 100 = máximo interés). Mismo lenguaje de color (rojo = interés) que las
# capas individuales, pero como degradado continuo en vez de clases.
HEATMAP_STOPS = [
    (0, (37, 99, 235, 0)),
    (25, (34, 197, 94, 90)),
    (50, (250, 204, 21, 140)),
    (75, (249, 115, 22, 190)),
    (100, (220, 38, 38, 225)),
]

# Cachea las capas ya calculadas por región (region.slug -> dict), para no
# recomputar todo si la app sirve varias regiones en el mismo proceso.
_layers_cache: dict[str, dict] = {}


def default_weights() -> dict:
    return {
        "lithology": settings.weight_lithology,
        "slope": settings.weight_slope,
        "vegetation": settings.weight_vegetation,
        "water": settings.weight_water_proximity,
        "known_sites": settings.weight_known_sites,
    }


def _get_layers(region: Region) -> dict:
    """Calcula (una vez por región, en memoria) los 5 sub-scores 0-100 sobre la rejilla del MDT."""
    if region.slug in _layers_cache:
        return _layers_cache[region.slug]

    transform, shape, crs = dem.get_grid(region)

    slope_deg, _, _ = dem.compute_slope_degrees(dem.fetch_dem_geotiff(region))
    distance_m, _, _ = hydrography.compute_distance_raster(region)
    ndvi_arr = ndvi.get_ndvi_on_grid(region, transform, shape, crs)
    lithology_score = lithology.get_lithology_score_on_grid(region, transform, shape, crs)
    known_sites_distance_m, _, _ = known_sites.compute_proximity_raster(region)

    slope_score = np.clip(slope_deg / SLOPE_SATURATION_DEG, 0, 1) * 100
    water_score = np.clip(1 - distance_m / WATER_SATURATION_M, 0, 1) * 100
    vegetation_score = np.clip((NDVI_SATURATION - ndvi_arr) / NDVI_SATURATION, 0, 1) * 100
    vegetation_score = np.nan_to_num(vegetation_score, nan=50.0)
    known_sites_score = np.clip(1 - known_sites_distance_m / KNOWN_SITES_SATURATION_M, 0, 1) * 100

    _layers_cache[region.slug] = {
        "transform": transform,
        "shape": shape,
        "crs": crs,
        "raw": {
            "slope_deg": slope_deg,
            "distance_m": distance_m,
            "ndvi": ndvi_arr,
            "known_sites_distance_m": known_sites_distance_m,
        },
        "scores": {
            "lithology": lithology_score,
            "slope": slope_score,
            "vegetation": vegetation_score,
            "water": water_score,
            "known_sites": known_sites_score,
        },
    }
    return _layers_cache[region.slug]


def compute_score(region: Region, weights: dict) -> np.ndarray:
    layers = _get_layers(region)
    total_weight = sum(max(weights.get(k, 0), 0) for k in LAYER_KEYS)
    if total_weight <= 0:
        return np.full(layers["shape"], 50.0)
    combined = sum(max(weights.get(k, 0), 0) * layers["scores"][k] for k in LAYER_KEYS) / total_weight
    return np.clip(combined, 0, 100)


def _colorize_score(score: np.ndarray) -> np.ndarray:
    height, width = score.shape
    rgba = np.zeros((4, height, width), dtype="uint8")
    stop_scores = [s[0] for s in HEATMAP_STOPS]
    for band in range(4):
        stop_values = [s[1][band] for s in HEATMAP_STOPS]
        rgba[band] = np.interp(score, stop_scores, stop_values).astype("uint8")
    return rgba


def _grid_bounds_4326(region: Region) -> tuple[rasterio.Affine, int, int, list]:
    layers = _get_layers(region)
    src_bounds = rasterio.transform.array_bounds(*layers["shape"], layers["transform"])
    dst_transform, width, height = calculate_default_transform(
        layers["crs"], "EPSG:4326", layers["shape"][1], layers["shape"][0], *src_bounds
    )
    west, south, east, north = rasterio.transform.array_bounds(height, width, dst_transform)
    return dst_transform, width, height, [[south, west], [north, east]]


def get_meta(region: Region) -> dict:
    _, _, _, bounds = _grid_bounds_4326(region)
    return {
        "bounds": bounds,
        "gradient": [
            {"score": s, "color": f"rgba({c[0]},{c[1]},{c[2]},{c[3] / 255:.2f})"} for s, c in HEATMAP_STOPS
        ],
        "default_weights": default_weights(),
    }


def render_heatmap_png(region: Region, weights: dict) -> bytes:
    layers = _get_layers(region)
    score = compute_score(region, weights)
    rgba = _colorize_score(score)

    dst_transform, width, height, _ = _grid_bounds_4326(region)
    dst_rgba = np.zeros((4, height, width), dtype="uint8")
    for band in range(4):
        reproject(
            source=rgba[band],
            destination=dst_rgba[band],
            src_transform=layers["transform"],
            src_crs=layers["crs"],
            dst_transform=dst_transform,
            dst_crs="EPSG:4326",
            resampling=Resampling.bilinear,
        )

    with MemoryFile() as memfile:
        with memfile.open(driver="PNG", height=height, width=width, count=4, dtype="uint8") as dst:
            dst.write(dst_rgba)
        return memfile.read()


def get_breakdown(region: Region, lon: float, lat: float, weights: dict) -> dict | None:
    """Desglose del score en el punto (lon, lat) WGS84: por qué tiene esa puntuación."""
    layers = _get_layers(region)
    xs, ys = warp_transform("EPSG:4326", layers["crs"], [lon], [lat])
    row, col = rasterio.transform.rowcol(layers["transform"], xs[0], ys[0])
    height, width = layers["shape"]
    if not (0 <= row < height and 0 <= col < width):
        return None

    litho_info = lithology.get_lithology_at_point(region, lon, lat)
    nearest_site = known_sites.get_nearest_site(region, lon, lat)
    score = float(compute_score(region, weights)[row, col])

    return {
        "lat": lat,
        "lon": lon,
        "score": score,
        "components": {
            "lithology": {
                "score": float(layers["scores"]["lithology"][row, col]),
                "description": litho_info["description"] if litho_info else None,
            },
            "slope": {
                "score": float(layers["scores"]["slope"][row, col]),
                "degrees": float(layers["raw"]["slope_deg"][row, col]),
            },
            "vegetation": {
                "score": float(layers["scores"]["vegetation"][row, col]),
                "ndvi": float(layers["raw"]["ndvi"][row, col]),
            },
            "water": {
                "score": float(layers["scores"]["water"][row, col]),
                "distance_m": float(layers["raw"]["distance_m"][row, col]),
            },
            "known_sites": {
                "score": float(layers["scores"]["known_sites"][row, col]),
                "distance_m": float(layers["raw"]["known_sites_distance_m"][row, col]),
                "nearest_name": nearest_site["name"] if nearest_site else None,
            },
        },
    }
