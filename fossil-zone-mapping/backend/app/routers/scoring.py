import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from app.services import scoring

router = APIRouter(prefix="/scoring", tags=["scoring"])


def _weights(
    w_lithology: float, w_slope: float, w_vegetation: float, w_water: float, w_known_sites: float
) -> dict:
    return {
        "lithology": w_lithology,
        "slope": w_slope,
        "vegetation": w_vegetation,
        "water": w_water,
        "known_sites": w_known_sites,
    }


@router.get("/meta")
def meta() -> dict:
    """Bounds geográficos, degradado de color y pesos por defecto para los sliders."""
    try:
        return scoring.get_meta()
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudieron preparar las capas de scoring: {error}") from error


@router.get("/heatmap.png")
def heatmap_png(
    w_lithology: float = Query(default=0, ge=0, le=1),
    w_slope: float = Query(default=0, ge=0, le=1),
    w_vegetation: float = Query(default=0, ge=0, le=1),
    w_water: float = Query(default=0, ge=0, le=1),
    w_known_sites: float = Query(default=0, ge=0, le=1),
) -> Response:
    """PNG (EPSG:4326) del score combinado 0-100, recalculado con los pesos dados."""
    weights = _weights(w_lithology, w_slope, w_vegetation, w_water, w_known_sites)
    try:
        png_bytes = scoring.render_heatmap_png(weights)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo calcular el score: {error}") from error
    return Response(content=png_bytes, media_type="image/png")


@router.get("/breakdown")
def breakdown(
    lat: float = Query(...),
    lon: float = Query(...),
    w_lithology: float = Query(default=0, ge=0, le=1),
    w_slope: float = Query(default=0, ge=0, le=1),
    w_vegetation: float = Query(default=0, ge=0, le=1),
    w_water: float = Query(default=0, ge=0, le=1),
    w_known_sites: float = Query(default=0, ge=0, le=1),
) -> dict:
    """Desglose del score en un punto: litología, pendiente, NDVI, agua y yacimientos cercanos."""
    weights = _weights(w_lithology, w_slope, w_vegetation, w_water, w_known_sites)
    try:
        result = scoring.get_breakdown(lon, lat, weights)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo calcular el desglose: {error}") from error
    if result is None:
        raise HTTPException(status_code=404, detail="El punto está fuera de la región analizada")
    return result
