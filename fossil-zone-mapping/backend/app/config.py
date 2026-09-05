"""Configuración central de la app: región de interés, pesos de scoring y settings vía entorno."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Fossil Zone Mapping API"
    environment: str = "development"

    # Bounding box de La Rioja (España) en WGS84: [min_lon, min_lat, max_lon, max_lat]
    region_name: str = "La Rioja"
    region_bbox: tuple[float, float, float, float] = (-3.15, 41.95, -1.70, 42.65)
    region_center: tuple[float, float] = (42.28, -2.45)  # [lat, lon]
    region_default_zoom: int = 9

    # Pesos por defecto del scoring (fase 6), ajustables desde el frontend
    weight_lithology: float = 0.30
    weight_slope: float = 0.20
    weight_vegetation: float = 0.20
    weight_water_proximity: float = 0.15
    weight_known_sites: float = 0.15

    # Credenciales externas (se completan en fases posteriores)
    copernicus_client_id: str | None = None
    copernicus_client_secret: str | None = None

    cache_dir: str = "data/cache"
    known_sites_dir: str = "data/known_sites"

    class Config:
        env_file = ".env"
        env_prefix = "FZM_"


settings = Settings()
