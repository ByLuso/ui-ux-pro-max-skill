import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.config import Region
from app.dependencies import region_param
from app.services import known_sites

router = APIRouter(prefix="/known-sites", tags=["known-sites"])


@router.get("/sites.geojson")
def sites_geojson(region: Region = Depends(region_param)) -> dict:
    """Yacimientos paleontológicos catalogados (IELIG, IGME) como puntos GeoJSON."""
    try:
        return known_sites.get_known_sites_geojson(region)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"No se pudieron obtener los yacimientos del IELIG: {error}") from error
