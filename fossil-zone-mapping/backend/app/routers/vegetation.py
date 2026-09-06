import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services import ndvi

router = APIRouter(prefix="/vegetation", tags=["vegetation"])


@router.get("/ndvi")
def ndvi_meta() -> dict:
    """Metadatos del overlay de NDVI: bounds geográficos, leyenda y fuente."""
    try:
        overlay = ndvi.get_ndvi_overlay()
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener el NDVI de Copernicus: {error}") from error
    return {k: v for k, v in overlay.items() if k != "png_path"}


@router.get("/ndvi.png")
def ndvi_png() -> FileResponse:
    """Imagen PNG (EPSG:4326) con el NDVI clasificado por colores, para superponer en Leaflet."""
    try:
        overlay = ndvi.get_ndvi_overlay()
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo obtener el NDVI de Copernicus: {error}") from error
    return FileResponse(overlay["png_path"], media_type="image/png")
