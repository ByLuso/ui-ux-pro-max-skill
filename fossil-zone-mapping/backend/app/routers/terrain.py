import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.config import Region
from app.dependencies import region_param
from app.services import dem, hillshade

router = APIRouter(prefix="/terrain", tags=["terrain"])


@router.get("/slope")
def slope_meta(region: Region = Depends(region_param)) -> dict:
    """Metadatos del overlay de pendiente: bounds geográficos, leyenda y fuente."""
    try:
        overlay = dem.get_slope_overlay(region)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener el MDT del IGN: {error}") from error
    return {k: v for k, v in overlay.items() if k != "png_path"}


@router.get("/slope.png")
def slope_png(region: Region = Depends(region_param)) -> FileResponse:
    """Imagen PNG (EPSG:4326) con la pendiente clasificada por colores, para superponer en Leaflet."""
    try:
        overlay = dem.get_slope_overlay(region)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener el MDT del IGN: {error}") from error
    return FileResponse(overlay["png_path"], media_type="image/png")


@router.get("/hillshade.png")
def hillshade_png(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: float = Query(default=500, ge=100, le=1500),
) -> Response:
    """Hillshade LiDAR de alta resolución (5 m) alrededor de un punto, para revelar relieve
    oculto bajo vegetación (no depende de la región activa: el LiDAR del IGN es nacional).
    Los bounds WGS84 del recorte van en la cabecera X-Bounds."""
    try:
        png_bytes, bounds = hillshade.get_hillshade_png_and_bounds(lon, lat, radius_m)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener el LiDAR del IGN: {error}") from error
    response = Response(content=png_bytes, media_type="image/png")
    response.headers["X-Bounds"] = json.dumps(bounds)
    return response
