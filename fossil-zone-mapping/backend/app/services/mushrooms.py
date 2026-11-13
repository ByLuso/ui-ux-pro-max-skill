"""Probabilidad de fructificación de setas por especie y día.

Cruza el perfil ecológico de cada especie (`mushroom_species.py`) con capas del territorio sobre
la misma rejilla de análisis que el resto de la app (la del MDT del IGN, 200 m, EPSG:25830):

  CAPA 01 · Clima      Lluvia acumulada y temperatura media diaria de Open-Meteo: últimos 30 días
                       (reanálisis/observación) + previsión a 16 días. Sin API key.
  CAPA 02 · Arbolado   Cobertura del suelo de Corine Land Cover 2018 (EEA/Copernicus): coníferas,
                       frondosas, mixto, encinar/esclerófilo, pastizal, brezal, dehesa...
  CAPA 03 · Suelo      pH del suelo a 0-5 cm de SoilGrids (ISRIC), altitud y pendiente del MDT
                       del IGN y, para especies de ribera, distancia a cauces.

Para un día objetivo t (0 = hoy, hasta +15):
  - lluvia útil  = lluvia acumulada en [t-21, t-4] (las setas salen 1-3 semanas tras la lluvia)
  - temperatura  = media de la temperatura diaria en [t-7, t], corregida por altitud con el
                   gradiente estándar (-6,5 °C/km) entre la celda de Open-Meteo y el MDT real.
  - score 0-100  = 100 · hospedador · temporada · media geométrica(altitud, pH, lluvia, temp[, agua])

Si Open-Meteo no responde, el score se calcula solo con hábitat y temporada, y la respuesta lo
indica con `weather_available: false` (así el frontend puede avisar en vez de mentir).
"""
import json
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform as warp_transform
from scipy.interpolate import RegularGridInterpolator

from app.config import Region, settings
from app.services import dem, hydrography
from app.services.http_utils import request_with_retry
from app.services.mushroom_species import SPECIES, SPECIES_BY_ID
from app.services.scoring import pick_peaks

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
CORINE_EXPORT_URL = "https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/export"
SOILGRIDS_WCS_URL = "https://maps.isric.org/mapserv"

PAST_DAYS = 30
FORECAST_DAYS = 16
WEATHER_GRID_POINTS = 5  # rejilla de 5x5 puntos de Open-Meteo sobre la bbox de la región
RAIN_WINDOW = (21, 4)  # días antes del día objetivo: desde t-21 hasta t-4
TEMP_WINDOW_DAYS = 7
LAPSE_RATE_C_PER_M = -0.0065
WATER_SATURATION_M = 800.0

# Corine Land Cover: colores oficiales de la leyenda CLC (el servicio de la EEA los pinta tal
# cual, sin suavizado, así que el color del píxel identifica la clase sin ambigüedad).
FOREST_CLASSES = [
    {"key": "conifer", "label": "Coníferas (pinares, abetales)", "clc": [(0, 166, 0)], "color": (34, 120, 60)},
    {"key": "broadleaf", "label": "Frondosas (hayedo, robledal, castañar)", "clc": [(128, 255, 0)], "color": (122, 178, 64)},
    {"key": "mixed", "label": "Bosque mixto", "clc": [(77, 255, 0)], "color": (86, 150, 70)},
    {"key": "sclerophyllous", "label": "Encinar / esclerófilo", "clc": [(166, 230, 77)], "color": (150, 140, 60)},
    {"key": "woodland_shrub", "label": "Matorral boscoso", "clc": [(166, 242, 0)], "color": (170, 175, 90)},
    {"key": "dehesa", "label": "Dehesa / agroforestal", "clc": [(242, 204, 166)], "color": (205, 165, 110)},
    {"key": "grassland", "label": "Pastizal y prado", "clc": [(204, 242, 77), (230, 230, 77)], "color": (200, 205, 120)},
    {"key": "moors", "label": "Brezal y landa", "clc": [(166, 255, 128)], "color": (170, 120, 150)},
    {"key": "agri_natural", "label": "Mosaico agrícola con vegetación", "clc": [(230, 204, 77)], "color": (210, 190, 120)},
]
FOREST_KEYS = [c["key"] for c in FOREST_CLASSES]  # índice 0 = "sin hábitat", 1.. = esta lista

# Rampa del mapa de calor de setas: pensada para fondo oscuro (transparente -> verde musgo ->
# amarillo -> ámbar -> coral), distinta de la rampa de fósiles para que no se confundan.
HEATMAP_STOPS = [
    (0, (20, 40, 30, 0)),
    (20, (45, 160, 120, 0)),
    (35, (45, 170, 125, 110)),
    (55, (170, 215, 90, 160)),
    (75, (245, 190, 60, 200)),
    (100, (240, 95, 70, 235)),
]

HOTSPOT_MIN_SCORE = 40.0

_habitat_cache: dict[str, dict] = {}
_weather_cache: dict[str, dict] = {}
_weather_failed_until: dict[str, float] = {}
WEATHER_RETRY_AFTER_S = 600


def _cache_dir() -> Path:
    path = Path(settings.cache_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


# ---------------------------------------------------------------------------------------------
# Utilidades numéricas
# ---------------------------------------------------------------------------------------------

def trapezoid(value, lo, opt_lo, opt_hi, hi, floor: float = 0.0):
    """1 dentro de [opt_lo, opt_hi], 0 (o `floor`) fuera de [lo, hi], lineal entre medias."""
    value = np.asarray(value, dtype="float64")
    rising = np.clip((value - lo) / max(opt_lo - lo, 1e-9), 0, 1)
    falling = np.clip((hi - value) / max(hi - opt_hi, 1e-9), 0, 1)
    result = np.minimum(rising, falling)
    return np.maximum(result, floor)


def season_factor(months: list[int], month: int) -> float:
    """1 en temporada, 0,45 en el mes justo antes/después (años adelantados o tardíos), 0,05 fuera."""
    if month in months:
        return 1.0
    prev_month = 12 if month == 1 else month - 1
    next_month = 1 if month == 12 else month + 1
    if prev_month in months or next_month in months:
        return 0.45
    return 0.05


# ---------------------------------------------------------------------------------------------
# CAPA 02 · Arbolado (Corine) y CAPA 03 · Suelo (SoilGrids + MDT)
# ---------------------------------------------------------------------------------------------

def _fetch_corine_png(region: Region) -> tuple[Path, tuple[float, float, float, float]]:
    """Exporta Corine 2018 de la bbox de la región como PNG (EPSG:4326) y guarda su extensión real
    (el servidor ArcGIS ajusta la bbox a la proporción de la imagen, así que no se asume)."""
    png_path = _cache_dir() / f"corine_{region.slug}.png"
    meta_path = _cache_dir() / f"corine_{region.slug}.json"
    if png_path.exists() and meta_path.exists():
        extent = json.loads(meta_path.read_text())["extent"]
        return png_path, tuple(extent)

    min_lon, min_lat, max_lon, max_lat = region.bbox
    # ~100 m por píxel (Corine tiene MMU de 25 ha; más resolución no aporta nada)
    width = int(min(2000, max(200, (max_lon - min_lon) * 820)))
    height = int(min(2000, max(200, (max_lat - min_lat) * 1110)))
    response = request_with_retry(
        "GET",
        CORINE_EXPORT_URL,
        params={
            "bbox": f"{min_lon},{min_lat},{max_lon},{max_lat}",
            "bboxSR": 4326,
            "imageSR": 4326,
            "size": f"{width},{height}",
            "format": "png",
            "transparent": "true",
            "f": "json",
        },
        timeout=90,
    )
    info = response.json()
    image = request_with_retry("GET", info["href"], timeout=90)
    png_path.write_bytes(image.content)
    ext = info["extent"]
    extent = (ext["xmin"], ext["ymin"], ext["xmax"], ext["ymax"])
    meta_path.write_text(json.dumps({"extent": extent}))
    return png_path, extent


def _corine_classes_on_grid(region: Region, transform, shape, crs) -> np.ndarray:
    png_path, (west, south, east, north) = _fetch_corine_png(region)
    with rasterio.open(png_path) as src:
        bands = src.read()
        if src.count == 1:
            # PNG con paleta (lo habitual en este servicio): se expande a RGBA con su tabla de color
            palette = np.zeros((256, 4), dtype="uint8")
            for index, color in src.colormap(1).items():
                palette[index] = color
            bands = np.moveaxis(palette[bands[0]], -1, 0)
    rgb = bands[:3].astype("int32")
    alpha = bands[3] if bands.shape[0] == 4 else np.full(rgb.shape[1:], 255)

    classes = np.zeros(rgb.shape[1:], dtype="uint8")
    for index, forest_class in enumerate(FOREST_CLASSES, start=1):
        for r, g, b in forest_class["clc"]:
            match = (rgb[0] == r) & (rgb[1] == g) & (rgb[2] == b) & (alpha > 0)
            classes[match] = index

    src_transform = from_bounds(west, south, east, north, classes.shape[1], classes.shape[0])
    out = np.zeros(shape, dtype="uint8")
    reproject(
        source=classes,
        destination=out,
        src_transform=src_transform,
        src_crs="EPSG:4326",
        dst_transform=transform,
        dst_crs=crs,
        resampling=Resampling.mode,
    )
    return out


def _fetch_soil_ph_tif(region: Region) -> Path:
    cache_file = _cache_dir() / f"soilgrids_ph_{region.slug}.tif"
    if cache_file.exists():
        return cache_file
    min_lon, min_lat, max_lon, max_lat = region.bbox
    epsg4326 = "http://www.opengis.net/def/crs/EPSG/0/4326"
    response = request_with_retry(
        "GET",
        SOILGRIDS_WCS_URL,
        params=[
            ("map", "/map/phh2o.map"),  # va en params: httpx sustituye la query de la URL base
            ("SERVICE", "WCS"),
            ("VERSION", "2.0.1"),
            ("REQUEST", "GetCoverage"),
            ("COVERAGEID", "phh2o_0-5cm_mean"),
            ("FORMAT", "image/tiff"),
            ("SUBSET", f"long({min_lon},{max_lon})"),
            ("SUBSET", f"lat({min_lat},{max_lat})"),
            ("SUBSETTINGCRS", epsg4326),
            ("OUTPUTCRS", epsg4326),
        ],
        timeout=120,
    )
    if not response.headers.get("content-type", "").startswith("image/tiff"):
        raise RuntimeError("SoilGrids no devolvió un GeoTIFF")
    cache_file.write_bytes(response.content)
    return cache_file


def _soil_ph_on_grid(region: Region, transform, shape, crs) -> np.ndarray:
    with rasterio.open(_fetch_soil_ph_tif(region)) as src:
        raw = src.read(1).astype("float64")
        raw[raw <= 0] = np.nan  # 0 = sin dato (agua, urbano)
        out = np.full(shape, np.nan)
        reproject(
            source=raw / 10.0,  # SoilGrids codifica el pH ×10
            destination=out,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=transform,
            dst_crs=crs,
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
    return out


def _get_habitat(region: Region) -> dict:
    """Capas estáticas (no dependen del día) sobre la rejilla del MDT, una vez por región."""
    if region.slug in _habitat_cache:
        return _habitat_cache[region.slug]

    transform, shape, crs = dem.get_grid(region)
    dem_path = dem.fetch_dem_geotiff(region)
    with rasterio.open(dem_path) as src:
        elevation = src.read(1).astype("float64")
        if src.nodata is not None:
            elevation[elevation == src.nodata] = np.nan
    slope_deg, _, _ = dem.compute_slope_degrees(dem_path)

    sources = {"forest": True, "ph": True, "water": True}
    try:
        forest = _corine_classes_on_grid(region, transform, shape, crs)
    except Exception as error:  # red caída, servicio de la EEA en mantenimiento...
        print(f"AVISO: Corine no disponible para '{region.slug}' ({error}).")
        forest = np.zeros(shape, dtype="uint8")
        sources["forest"] = False
    try:
        ph = _soil_ph_on_grid(region, transform, shape, crs)
    except Exception as error:
        print(f"AVISO: pH de SoilGrids no disponible para '{region.slug}' ({error}); se usa neutro.")
        ph = np.full(shape, np.nan)
        sources["ph"] = False
    try:
        water_distance_m, _, _ = hydrography.compute_distance_raster(region)
    except Exception as error:
        print(f"AVISO: hidrografía no disponible para '{region.slug}' ({error}).")
        water_distance_m = np.full(shape, np.nan)
        sources["water"] = False

    # Coordenadas WGS84 del centro de cada celda, para interpolar la meteo sobre la rejilla.
    rows, cols = np.mgrid[0 : shape[0], 0 : shape[1]]
    xs, ys = rasterio.transform.xy(transform, rows.ravel(), cols.ravel())
    lons, lats = warp_transform(crs, "EPSG:4326", xs, ys)

    _habitat_cache[region.slug] = {
        "transform": transform,
        "shape": shape,
        "crs": crs,
        "elevation": elevation,
        "slope_deg": slope_deg,
        "forest": forest,
        "ph": ph,
        "water_distance_m": water_distance_m,
        "lats": np.asarray(lats).reshape(shape),
        "lons": np.asarray(lons).reshape(shape),
        "sources": sources,
    }
    return _habitat_cache[region.slug]


# ---------------------------------------------------------------------------------------------
# CAPA 01 · Clima (Open-Meteo)
# ---------------------------------------------------------------------------------------------

def _weather_points(region: Region) -> tuple[np.ndarray, np.ndarray]:
    min_lon, min_lat, max_lon, max_lat = region.bbox
    lats = np.linspace(min_lat, max_lat, WEATHER_GRID_POINTS)
    lons = np.linspace(min_lon, max_lon, WEATHER_GRID_POINTS)
    return lats, lons


def get_weather(region: Region) -> dict | None:
    """Serie diaria (30 días pasados + 16 de previsión) en una rejilla 5x5 sobre la región.
    Cacheada por región y día natural (en disco y en memoria). None si Open-Meteo falla."""
    today = date.today().isoformat()
    key = f"{region.slug}:{today}"
    if key in _weather_cache:
        return _weather_cache[key]

    cache_file = _cache_dir() / f"weather_{region.slug}_{today}.json"
    if not cache_file.exists() and time.time() < _weather_failed_until.get(key, 0):
        return None  # falló hace poco: no martillear Open-Meteo en cada petición del mapa
    if cache_file.exists():
        data = json.loads(cache_file.read_text())
    else:
        lats, lons = _weather_points(region)
        grid_lat, grid_lon = np.meshgrid(lats, lons, indexing="ij")
        try:
            response = request_with_retry(
                "GET",
                OPEN_METEO_URL,
                params={
                    "latitude": ",".join(f"{v:.4f}" for v in grid_lat.ravel()),
                    "longitude": ",".join(f"{v:.4f}" for v in grid_lon.ravel()),
                    "daily": "precipitation_sum,temperature_2m_mean",
                    "past_days": PAST_DAYS,
                    "forecast_days": FORECAST_DAYS,
                    "timezone": "Europe/Madrid",
                },
                timeout=60,
            )
        except Exception as error:
            print(f"AVISO: Open-Meteo no disponible ({error}); setas sin componente meteorológico.")
            _weather_failed_until[key] = time.time() + WEATHER_RETRY_AFTER_S
            return None
        payload = response.json()
        if isinstance(payload, dict):
            payload = [payload]
        n = WEATHER_GRID_POINTS
        data = {
            "dates": payload[0]["daily"]["time"],
            "rain": [[p if p is not None else 0.0 for p in loc["daily"]["precipitation_sum"]] for loc in payload],
            "temp": [[t if t is not None else np.nan for t in loc["daily"]["temperature_2m_mean"]] for loc in payload],
            "elevation": [loc.get("elevation", 0.0) for loc in payload],
            "grid": [n, n],
        }
        cache_file.write_text(json.dumps(data, allow_nan=True))

    n_lat, n_lon = data["grid"]
    weather = {
        "dates": data["dates"],
        "rain": np.asarray(data["rain"], dtype="float64").reshape(n_lat, n_lon, -1),
        "temp": np.asarray(data["temp"], dtype="float64").reshape(n_lat, n_lon, -1),
        "elevation": np.asarray(data["elevation"], dtype="float64").reshape(n_lat, n_lon),
        "today_index": data["dates"].index(today) if today in data["dates"] else PAST_DAYS,
    }
    _weather_cache[key] = weather
    return weather


def _weather_on_grid(region: Region, day_offset: int) -> dict | None:
    """Lluvia útil y temperatura media del día objetivo, interpoladas a la rejilla del MDT."""
    weather = get_weather(region)
    if weather is None:
        return None
    habitat = _get_habitat(region)
    t = weather["today_index"] + day_offset
    rain_start = max(0, t - RAIN_WINDOW[0])
    rain_end = max(rain_start + 1, t - RAIN_WINDOW[1] + 1)
    rain_pts = weather["rain"][:, :, rain_start:rain_end].sum(axis=2)
    temp_pts = np.nanmean(weather["temp"][:, :, max(0, t - TEMP_WINDOW_DAYS) : t + 1], axis=2)

    lats, lons = _weather_points(region)
    points = np.column_stack([habitat["lats"].ravel(), habitat["lons"].ravel()])

    def interp(values):
        f = RegularGridInterpolator((lats, lons), values, bounds_error=False, fill_value=None)
        return f(points).reshape(habitat["shape"])

    rain = np.clip(interp(rain_pts), 0, None)
    temp = interp(temp_pts)
    meteo_elev = interp(weather["elevation"])
    elevation = np.where(np.isnan(habitat["elevation"]), meteo_elev, habitat["elevation"])
    temp = temp + LAPSE_RATE_C_PER_M * (elevation - meteo_elev)
    return {"rain_mm": rain, "temp_c": temp}


def weather_summary(region: Region) -> dict | None:
    """Media regional diaria de lluvia y temperatura, para la tira de "clima" del panel."""
    weather = get_weather(region)
    if weather is None:
        return None
    rain = weather["rain"].mean(axis=(0, 1))
    temp = np.nanmean(weather["temp"], axis=(0, 1))
    return {
        "dates": weather["dates"],
        "today_index": weather["today_index"],
        "rain_mm": [round(float(v), 1) for v in rain],
        "temp_c": [round(float(v), 1) if np.isfinite(v) else None for v in temp],
    }


# ---------------------------------------------------------------------------------------------
# Score por especie
# ---------------------------------------------------------------------------------------------

def target_date(day_offset: int) -> date:
    return date.today() + timedelta(days=day_offset)


def _factors(
    species: dict, forest_idx, elevation, ph, water_distance_m, rain_mm, temp_c, month: int, forest_known: bool = True
) -> dict:
    """Factores 0-1 de una especie. Funciona igual con arrays (mapa) que con escalares (punto).
    Sin capa de arbolado (Corine caído) el hospedador vale 0,5 en todas partes: neutro, en vez de
    un 0 que apagaría el mapa entero por una fuente que falta."""
    host_lookup = np.array([0.0] + [species["hosts"].get(k, 0.0) for k in FOREST_KEYS])
    host = host_lookup[np.asarray(forest_idx, dtype="int64")] if forest_known else np.full(np.shape(forest_idx), 0.5)
    factors = {
        "host": host,
        "season": season_factor(species["months"], month),
        "elevation": trapezoid(np.nan_to_num(elevation, nan=species["elevation"][1]), *species["elevation"], floor=0.05),
        # pH de SoilGrids a 250 m es orientativo: suelo mínimo 0,3 para no descartar zonas por él solo
        "ph": trapezoid(np.nan_to_num(ph, nan=species["ph"][1]), *species["ph"], floor=0.3),
    }
    if rain_mm is not None:
        lo, opt = species["rain_mm"]
        factors["rain"] = trapezoid(rain_mm, lo * 0.4, opt, 1e9, 1e10, floor=0.05)
        factors["temp"] = trapezoid(np.nan_to_num(temp_c, nan=species["temp_c"][1]), *species["temp_c"], floor=0.05)
    if species.get("water_affinity"):
        water = np.clip(1 - np.nan_to_num(water_distance_m, nan=WATER_SATURATION_M) / WATER_SATURATION_M, 0, 1)
        factors["water"] = 0.4 + 0.6 * water
    return factors


def _combine(factors: dict):
    modifiers = [factors[k] for k in ("elevation", "ph", "rain", "temp", "water") if k in factors]
    geometric_mean = np.prod(np.stack(np.broadcast_arrays(*modifiers)), axis=0) ** (1 / len(modifiers))
    return np.clip(100 * factors["host"] * factors["season"] * geometric_mean, 0, 100)


def compute_score(region: Region, species_id: str, day_offset: int) -> tuple[np.ndarray, bool]:
    species = SPECIES_BY_ID[species_id]
    habitat = _get_habitat(region)
    meteo = _weather_on_grid(region, day_offset)
    factors = _factors(
        species,
        habitat["forest"],
        habitat["elevation"],
        habitat["ph"],
        habitat["water_distance_m"],
        meteo["rain_mm"] if meteo else None,
        meteo["temp_c"] if meteo else None,
        target_date(day_offset).month,
        habitat["sources"]["forest"],
    )
    return _combine(factors), meteo is not None


def daily_outlook(region: Region, species_id: str) -> list[dict]:
    """Para cada día 0..15: score del percentil 98 de la región (la "mejor zona" del día).
    Sirve para responder "¿cuándo ir?" con una sola tira de barras."""
    outlook = []
    for offset in range(FORECAST_DAYS):
        score, _ = compute_score(region, species_id, offset)
        valid = score[np.isfinite(score)]
        outlook.append(
            {
                "day": offset,
                "date": target_date(offset).isoformat(),
                "top_score": round(float(np.percentile(valid, 98)) if valid.size else 0.0, 1),
            }
        )
    return outlook


# ---------------------------------------------------------------------------------------------
# Salida para el frontend (PNG, chinchetas, desglose)
# ---------------------------------------------------------------------------------------------

def _grid_to_4326(region: Region):
    habitat = _get_habitat(region)
    src_bounds = rasterio.transform.array_bounds(*habitat["shape"], habitat["transform"])
    dst_transform, width, height = calculate_default_transform(
        habitat["crs"], "EPSG:4326", habitat["shape"][1], habitat["shape"][0], *src_bounds
    )
    west, south, east, north = rasterio.transform.array_bounds(height, width, dst_transform)
    return dst_transform, width, height, [[south, west], [north, east]]


def _rgba_to_png(region: Region, rgba: np.ndarray, resampling=Resampling.bilinear) -> bytes:
    habitat = _get_habitat(region)
    dst_transform, width, height, _ = _grid_to_4326(region)
    dst = np.zeros((4, height, width), dtype="uint8")
    for band in range(4):
        reproject(
            source=rgba[band],
            destination=dst[band],
            src_transform=habitat["transform"],
            src_crs=habitat["crs"],
            dst_transform=dst_transform,
            dst_crs="EPSG:4326",
            resampling=resampling,
        )
    with MemoryFile() as memfile:
        with memfile.open(driver="PNG", height=height, width=width, count=4, dtype="uint8") as out:
            out.write(dst)
        return memfile.read()


def render_heatmap_png(region: Region, species_id: str, day_offset: int) -> bytes:
    score, _ = compute_score(region, species_id, day_offset)
    score = np.nan_to_num(score, nan=0.0)
    stops = [s for s, _ in HEATMAP_STOPS]
    rgba = np.zeros((4,) + score.shape, dtype="uint8")
    for band in range(4):
        rgba[band] = np.interp(score, stops, [c[band] for _, c in HEATMAP_STOPS]).astype("uint8")
    return _rgba_to_png(region, rgba)


def render_forest_png(region: Region) -> bytes:
    forest = _get_habitat(region)["forest"]
    rgba = np.zeros((4,) + forest.shape, dtype="uint8")
    for index, forest_class in enumerate(FOREST_CLASSES, start=1):
        mask = forest == index
        for band, value in enumerate(forest_class["color"]):
            rgba[band][mask] = value
        rgba[3][mask] = 170
    return _rgba_to_png(region, rgba, resampling=Resampling.nearest)


def forest_meta(region: Region) -> dict:
    _, _, _, bounds = _grid_to_4326(region)
    return {
        "bounds": bounds,
        "legend": [
            {"label": c["label"], "color": "rgb({},{},{})".format(*c["color"])} for c in FOREST_CLASSES
        ],
        "source": "Corine Land Cover 2018 (EEA / Copernicus)",
        "available": _get_habitat(region)["sources"]["forest"],
    }


def get_meta(region: Region) -> dict:
    _, _, _, bounds = _grid_to_4326(region)
    habitat = _get_habitat(region)
    return {
        "bounds": bounds,
        "gradient": [
            {"score": s, "color": f"rgba({c[0]},{c[1]},{c[2]},{max(c[3], 60) / 255:.2f})"}
            for s, c in HEATMAP_STOPS
            if s >= 35 or s == 0
        ],
        "today": date.today().isoformat(),
        "forecast_days": FORECAST_DAYS,
        "weather": weather_summary(region),
        "sources": {**habitat["sources"], "weather": get_weather(region) is not None},
    }


def find_hotspots(region: Region, species_id: str, day_offset: int) -> list[dict]:
    habitat = _get_habitat(region)
    score, _ = compute_score(region, species_id, day_offset)
    rows, cols = pick_peaks(np.nan_to_num(score, nan=0.0), HOTSPOT_MIN_SCORE, separation_px=5, max_count=12)
    if not rows:
        return []
    xs, ys = rasterio.transform.xy(habitat["transform"], rows, cols)
    lons, lats = warp_transform(habitat["crs"], "EPSG:4326", xs, ys)
    return [
        {"lat": float(lat), "lon": float(lon), "score": float(score[r, c])}
        for lat, lon, r, c in zip(lats, lons, rows, cols)
    ]


def _point_values(region: Region, lon: float, lat: float, day_offset: int) -> dict | None:
    habitat = _get_habitat(region)
    xs, ys = warp_transform("EPSG:4326", habitat["crs"], [lon], [lat])
    row, col = rasterio.transform.rowcol(habitat["transform"], xs[0], ys[0])
    height, width = habitat["shape"]
    if not (0 <= row < height and 0 <= col < width):
        return None
    meteo = _weather_on_grid(region, day_offset)
    forest_idx = int(habitat["forest"][row, col])
    return {
        "forest_idx": forest_idx,
        "forest_known": habitat["sources"]["forest"],
        "forest_label": FOREST_CLASSES[forest_idx - 1]["label"] if forest_idx else "Sin arbolado ni pasto (cultivo, urbano, roca…)",
        "elevation": float(habitat["elevation"][row, col]),
        "slope_deg": float(habitat["slope_deg"][row, col]),
        "ph": float(habitat["ph"][row, col]),
        "water_distance_m": float(habitat["water_distance_m"][row, col]),
        "rain_mm": float(meteo["rain_mm"][row, col]) if meteo else None,
        "temp_c": float(meteo["temp_c"][row, col]) if meteo else None,
    }


def _finite(value):
    return value if value is not None and np.isfinite(value) else None


def get_breakdown(region: Region, lon: float, lat: float, species_id: str, day_offset: int) -> dict | None:
    """Por qué este punto tiene esta puntuación para la especie elegida + ranking de las demás
    especies en el mismo punto y día (la "búsqueda inversa": ¿qué puedo encontrar aquí?)."""
    values = _point_values(region, lon, lat, day_offset)
    if values is None:
        return None
    month = target_date(day_offset).month

    def score_for(species):
        factors = _factors(
            species,
            values["forest_idx"],
            values["elevation"],
            values["ph"],
            values["water_distance_m"],
            values["rain_mm"],
            values["temp_c"],
            month,
            values["forest_known"],
        )
        return float(_combine(factors)), {k: round(float(v), 2) for k, v in factors.items()}

    selected_score, selected_factors = score_for(SPECIES_BY_ID[species_id])
    ranking = sorted(
        ({"id": s["id"], "name": s["name"], "edibility": s["edibility"], "score": round(score_for(s)[0], 1)} for s in SPECIES),
        key=lambda item: -item["score"],
    )
    return {
        "lat": lat,
        "lon": lon,
        "date": target_date(day_offset).isoformat(),
        "species_id": species_id,
        "score": round(selected_score, 1),
        "factors": selected_factors,
        "values": {
            "forest": values["forest_label"],
            "elevation_m": _finite(values["elevation"]),
            "slope_deg": _finite(values["slope_deg"]),
            "ph": _finite(values["ph"]),
            "water_distance_m": _finite(values["water_distance_m"]),
            "rain_mm": _finite(values["rain_mm"]),
            "temp_c": _finite(values["temp_c"]),
        },
        "ranking": ranking[:5],
    }


def species_catalog() -> list[dict]:
    month = datetime.now().month
    return [
        {
            **{k: v for k, v in s.items() if k not in ("hosts",)},
            "hosts": [
                {"key": c["key"], "label": c["label"], "weight": s["hosts"][c["key"]]}
                for c in FOREST_CLASSES
                if c["key"] in s["hosts"]
            ],
            "in_season": season_factor(s["months"], month) >= 1.0,
        }
        for s in SPECIES
    ]
