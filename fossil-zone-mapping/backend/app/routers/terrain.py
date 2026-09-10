import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.config import Region
from app.dependencies import region_param
from app.services import dem

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
