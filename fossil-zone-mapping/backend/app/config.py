"""Configuración central de la app: regiones de análisis, pesos de scoring y settings vía entorno."""
from dataclasses import dataclass

from pydantic_settings import BaseSettings


@dataclass(frozen=True)
class Region:
    slug: str
    name: str
    bbox: tuple[float, float, float, float]  # [min_lon, min_lat, max_lon, max_lat] WGS84
    center: tuple[float, float]  # [lat, lon]
    default_zoom: int


REGIONS: dict[str, Region] = {
    "la-rioja": Region(
        slug="la-rioja",
        name="La Rioja",
        bbox=(-3.15, 41.95, -1.70, 42.65),
        center=(42.28, -2.45),
        default_zoom=9,
    ),
    "bizkaia": Region(
        slug="bizkaia",
        name="Bizkaia (Pagasarri)",
        bbox=(-3.05, 43.10, -2.70, 43.35),
        center=(43.23, -2.875),
        default_zoom=11,
    ),
}
DEFAULT_REGION = "la-rioja"


def get_region(slug: str) -> Region | None:
    return REGIONS.get(slug)


class Settings(BaseSettings):
    app_name: str = "Fossil Zone Mapping API"
    environment: str = "development"

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
