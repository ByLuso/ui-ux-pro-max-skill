"""Endpoints del modo "Setas": catálogo de especies, mapa de probabilidad por especie y día,
chinchetas de mejores zonas, desglose por punto y capa de arbolado (Corine)."""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.config import Region
from app.dependencies import region_param
from app.services import mushrooms
from app.services.mushroom_species import GOLDEN_RULES, SPECIES_BY_ID

router = APIRouter(prefix="/mushrooms", tags=["mushrooms"])

DayParam = Query(default=0, ge=0, le=mushrooms.FORECAST_DAYS - 1, description="0 = hoy, hasta +15 días")


def species_param(species: str = Query(...)) -> str:
    if species not in SPECIES_BY_ID:
        raise HTTPException(status_code=404, detail=f"Especie desconocida: {species}")
    return species


def _upstream_error(error: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail=f"No se pudieron preparar las capas de setas: {error}")


@router.get("/species")
def list_species(q: str | None = Query(default=None, description="Filtro por nombre, nombre científico o hábitat")) -> dict:
    catalog = mushrooms.species_catalog()
    if q:
        needle = q.strip().lower()
        catalog = [
            s
            for s in catalog
            if needle in s["name"].lower() or needle in s["scientific"].lower() or needle in s["habitat"].lower()
        ]
    return {"species": catalog, "golden_rules": GOLDEN_RULES}


@router.get("/meta")
def meta(region: Region = Depends(region_param)) -> dict:
    try:
        return mushrooms.get_meta(region)
    except httpx.HTTPError as error:
        raise _upstream_error(error) from error


@router.get("/outlook")
def outlook(region: Region = Depends(region_param), species: str = Depends(species_param)) -> dict:
    """Mejor score de la región para cada uno de los próximos 16 días: ¿cuándo ir?"""
    try:
        return {"species": species, "days": mushrooms.daily_outlook(region, species)}
    except httpx.HTTPError as error:
        raise _upstream_error(error) from error


@router.get("/heatmap.png")
def heatmap_png(
    region: Region = Depends(region_param), species: str = Depends(species_param), day: int = DayParam
) -> Response:
    try:
        png = mushrooms.render_heatmap_png(region, species, day)
    except httpx.HTTPError as error:
        raise _upstream_error(error) from error
    return Response(content=png, media_type="image/png", headers={"Cache-Control": "max-age=3600"})


@router.get("/hotspots")
def hotspots(region: Region = Depends(region_param), species: str = Depends(species_param), day: int = DayParam) -> dict:
    try:
        return {"hotspots": mushrooms.find_hotspots(region, species, day)}
    except httpx.HTTPError as error:
        raise _upstream_error(error) from error


@router.get("/breakdown")
def breakdown(
    lat: float = Query(...),
    lon: float = Query(...),
    region: Region = Depends(region_param),
    species: str = Depends(species_param),
    day: int = DayParam,
) -> dict:
    try:
        result = mushrooms.get_breakdown(region, lon, lat, species, day)
    except httpx.HTTPError as error:
        raise _upstream_error(error) from error
    if result is None:
        raise HTTPException(status_code=404, detail="El punto está fuera de la región analizada")
    return result


@router.get("/forest")
def forest_meta(region: Region = Depends(region_param)) -> dict:
    return mushrooms.forest_meta(region)


@router.get("/forest.png")
def forest_png(region: Region = Depends(region_param)) -> Response:
    return Response(content=mushrooms.render_forest_png(region), media_type="image/png")
