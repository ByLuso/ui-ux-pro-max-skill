import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import Region
from app.dependencies import region_param
from app.services import hydrography

router = APIRouter(prefix="/hydrography", tags=["hydrography"])


@router.get("/distance")
def distance_meta(region: Region = Depends(region_param)) -> dict:
    """Metadatos del overlay de distancia a cauces: bounds geográficos, leyenda y fuente."""
    try:
        overlay = hydrography.get_hydrography_overlay(region)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener la hidrografía del IGN: {error}") from error
    return {k: v for k, v in overlay.items() if k != "png_path"}


@router.get("/distance.png")
def distance_png(region: Region = Depends(region_param)) -> FileResponse:
    """Imagen PNG (EPSG:4326) con la distancia a cauces clasificada por colores."""
    try:
        overlay = hydrography.get_hydrography_overlay(region)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener la hidrografía del IGN: {error}") from error
    return FileResponse(overlay["png_path"], media_type="image/png")
