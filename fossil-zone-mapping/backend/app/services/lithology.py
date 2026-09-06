"""Litología del IGME (ArcGIS REST) y clasificación heurística por palabras clave."""
import re
from pathlib import Path

import geopandas as gpd
import httpx
import numpy as np
import rasterio
import rasterio.features
from shapely.geometry import Point

from app.config import settings

IGME_QUERY_URL = (
    "https://mapas.igme.es/gis/rest/services/Cartografia_Geologica/"
    "IGME_Litologias_1M/MapServer/0/query"
)

# Heurística simple y extensible a otras regiones: se buscan términos de roca
# sedimentaria (favorable para la fosilización y el hallazgo de fósiles
# expuestos) frente a términos de roca metamórfica/ígnea o depósitos
# recientes sin consolidar (menos favorables). El score de cada polígono es
# la proporción de coincidencias positivas sobre el total de coincidencias.
POSITIVE_KEYWORDS = [
    "caliza", "dolomía", "dolomia", "marga", "arcilla", "lutita", "limolita",
    "arenisca", "conglomerado", "yeso", "evaporita", "calcarenita",
]
NEGATIVE_KEYWORDS = [
    "pizarra", "cuarcita", "grauwac", "grauvac", "esquisto", "gneis",
    "granito", "basalto", "grava", "arena", "limo",
]
DEFAULT_SCORE = 50.0


def _cache_dir() -> Path:
    path = Path(settings.cache_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _region_slug() -> str:
    return settings.region_name.lower().replace(" ", "-")


def score_from_description(description: str | None) -> float:
    if not isinstance(description, str) or not description:
        return DEFAULT_SCORE
    text = description.lower()
    positive_hits = sum(1 for kw in POSITIVE_KEYWORDS if re.search(rf"\b{kw}", text))
    negative_hits = sum(1 for kw in NEGATIVE_KEYWORDS if re.search(rf"\b{kw}", text))
    total_hits = positive_hits + negative_hits
    if total_hits == 0:
        return DEFAULT_SCORE
    return 100 * positive_hits / total_hits


def fetch_lithology_polygons() -> Path:
    """Descarga (o reutiliza de caché) los polígonos de litología del IGME con su score."""
    cache_file = _cache_dir() / f"lithology_{_region_slug()}.gpkg"
    if cache_file.exists():
        return cache_file

    min_lon, min_lat, max_lon, max_lat = settings.region_bbox
    response = httpx.get(
        IGME_QUERY_URL,
        params={
            "geometry": f"{min_lon},{min_lat},{max_lon},{max_lat}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "Litologia",
            "returnGeometry": "true",
            "f": "geojson",
        },
        timeout=60,
    )
    response.raise_for_status()
    geojson = response.json()

    gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs="EPSG:4326")
    gdf["litologia"] = gdf["Litologia"]
    gdf["score"] = gdf["litologia"].apply(score_from_description)
    gdf[["litologia", "score", "geometry"]].to_file(cache_file, driver="GPKG")
    return cache_file


def get_lithology_score_on_grid(transform: rasterio.Affine, shape: tuple, crs) -> np.ndarray:
    """Rasteriza el score de litología (0-100) sobre la rejilla (transform/shape/crs) dada."""
    gdf = gpd.read_file(fetch_lithology_polygons()).to_crs(crs)
    shapes = list(zip(gdf.geometry, gdf["score"]))
    return rasterio.features.rasterize(
        shapes, out_shape=shape, transform=transform, fill=DEFAULT_SCORE, dtype="float64"
    )


def get_lithology_at_point(lon: float, lat: float) -> dict | None:
    """Busca la descripción litológica y el score en el punto (lon, lat) WGS84."""
    gdf = gpd.read_file(fetch_lithology_polygons())
    point = Point(lon, lat)
    matches = gdf[gdf.contains(point)]
    if matches.empty:
        return None
    row = matches.iloc[0]
    return {"description": row["litologia"], "score": float(row["score"])}
