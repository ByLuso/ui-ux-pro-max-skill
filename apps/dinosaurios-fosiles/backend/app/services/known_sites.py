"""Yacimientos paleontológicos conocidos (IELIG, IGME) — señal de refuerzo, no filtro excluyente."""
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import rasterio.features
from scipy.ndimage import distance_transform_edt

from app.config import Region, settings
from app.services import dem
from app.services.http_utils import request_with_retry

IELIG_QUERY_URL = "https://mapas.igme.es/gis/rest/services/BasesDatos/IGME_IELIG/MapServer/0/query"


def _cache_dir() -> Path:
    path = Path(settings.cache_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def fetch_known_sites(region: Region) -> Path:
    """Descarga (o reutiliza de caché) los yacimientos paleontológicos del IELIG para la bbox
    de la región, como puntos (centroide de cada geosite)."""
    cache_file = _cache_dir() / f"known_sites_{region.slug}.gpkg"
    if cache_file.exists():
        return cache_file

    min_lon, min_lat, max_lon, max_lat = region.bbox
    response = request_with_retry(
        "GET",
        IELIG_QUERY_URL,
        params={
            "geometry": f"{min_lon},{min_lat},{max_lon},{max_lat}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "CODIGO,Denominacion,InteresPrincipal",
            "returnGeometry": "true",
            "f": "geojson",
        },
        timeout=60,
    )
    geojson = response.json()

    gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs="EPSG:4326")
    # El IELIG cataloga todo tipo de lugares de interés geológico; nos quedamos con los
    # de interés paleontológico (incluye las icnitas de dinosaurio y demás yacimientos fósiles).
    gdf = gdf[gdf["InteresPrincipal"].str.contains("aleontol", case=False, na=False)]
    gdf["code"] = gdf["CODIGO"]
    gdf["name"] = gdf["Denominacion"]
    if not gdf.empty:
        metric_crs = gdf.estimate_utm_crs()
        gdf["geometry"] = gdf.geometry.to_crs(metric_crs).centroid.to_crs("EPSG:4326")
    gdf[["code", "name", "geometry"]].to_file(cache_file, driver="GPKG")
    return cache_file


def get_known_sites_geojson(region: Region) -> dict:
    """GeoJSON (WGS84) de los puntos, para dibujarlos en el frontend."""
    gdf = gpd.read_file(fetch_known_sites(region))
    return json.loads(gdf.to_json())


def compute_proximity_raster(region: Region) -> tuple[np.ndarray, rasterio.Affine, rasterio.CRS]:
    """Distancia (en metros) de cada celda de la malla del MDT al yacimiento conocido más cercano."""
    transform, shape, crs = dem.get_grid(region)

    sites = gpd.read_file(fetch_known_sites(region)).to_crs(crs)
    if sites.empty:
        # Sin yacimientos catalogados en la región: no hay señal, distancia "infinita"
        # (el score de este componente será 0 en toda la rejilla).
        return np.full(shape, np.inf), transform, crs

    site_mask = rasterio.features.rasterize(
        sites.geometry, out_shape=shape, transform=transform, fill=0, default_value=1
    ).astype(bool)

    pixel_size_m = transform.a
    distance_m = distance_transform_edt(~site_mask) * pixel_size_m
    return distance_m, transform, crs


def get_nearest_site(region: Region, lon: float, lat: float) -> dict | None:
    """Nombre y distancia (m) al yacimiento conocido más cercano al punto (lon, lat) WGS84."""
    gdf = gpd.read_file(fetch_known_sites(region))
    if gdf.empty:
        return None

    metric_crs = gdf.estimate_utm_crs()
    sites_metric = gdf.to_crs(metric_crs)
    point_metric = gpd.GeoSeries(gpd.points_from_xy([lon], [lat]), crs="EPSG:4326").to_crs(metric_crs).iloc[0]

    distances = sites_metric.geometry.distance(point_metric)
    nearest_idx = distances.idxmin()
    return {"name": gdf.loc[nearest_idx, "name"], "distance_m": float(distances.loc[nearest_idx])}
