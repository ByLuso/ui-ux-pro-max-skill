"""Dependencias compartidas de FastAPI."""
from fastapi import HTTPException, Query

from app.config import DEFAULT_REGION, Region, get_region


def region_param(region: str = Query(default=DEFAULT_REGION)) -> Region:
    """Resuelve el parámetro `?region=` a su configuración, o 404 si no existe."""
    resolved = get_region(region)
    if resolved is None:
        raise HTTPException(status_code=404, detail=f"Región desconocida: {region}")
    return resolved
