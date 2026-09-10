from fastapi import APIRouter, Depends

from app.config import REGIONS, Region, settings
from app.dependencies import region_param

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}


@router.get("/regions")
def list_regions() -> dict:
    """Regiones de análisis disponibles, para el selector del frontend."""
    return {
        "regions": [
            {
                "slug": region.slug,
                "name": region.name,
                "bbox": region.bbox,
                "center": region.center,
                "default_zoom": region.default_zoom,
            }
            for region in REGIONS.values()
        ]
    }


@router.get("/config")
def region_config(region: Region = Depends(region_param)) -> dict:
    """Configuración de la región seleccionada y pesos de scoring por defecto."""
    return {
        "region_slug": region.slug,
        "region_name": region.name,
        "region_bbox": region.bbox,
        "region_center": region.center,
        "region_default_zoom": region.default_zoom,
        "weights": {
            "lithology": settings.weight_lithology,
            "slope": settings.weight_slope,
            "vegetation": settings.weight_vegetation,
            "water_proximity": settings.weight_water_proximity,
            "known_sites": settings.weight_known_sites,
        },
    }
