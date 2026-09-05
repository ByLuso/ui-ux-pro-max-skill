from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}


@router.get("/config")
def region_config() -> dict:
    """Configuración de la región de interés y pesos de scoring para el frontend."""
    return {
        "region_name": settings.region_name,
        "region_bbox": settings.region_bbox,
        "region_center": settings.region_center,
        "region_default_zoom": settings.region_default_zoom,
        "weights": {
            "lithology": settings.weight_lithology,
            "slope": settings.weight_slope,
            "vegetation": settings.weight_vegetation,
            "water_proximity": settings.weight_water_proximity,
            "known_sites": settings.weight_known_sites,
        },
    }
