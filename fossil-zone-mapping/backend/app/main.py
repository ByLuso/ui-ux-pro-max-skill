import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import PMTILES_DIR, settings
from app.routers import health, hydrography, known_sites, scoring, terrain, vegetation

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Bounds"],
)

app.include_router(health.router, tags=["health"])
app.include_router(terrain.router)
app.include_router(vegetation.router)
app.include_router(hydrography.router)
app.include_router(scoring.router)
app.include_router(known_sites.router)

# StaticFiles soporta cabeceras Range de serie (Starlette): pmtiles.js las necesita para leer
# solo los trozos del .pmtiles que hacen falta en cada momento, en vez de todo el archivo.
os.makedirs(PMTILES_DIR, exist_ok=True)
app.mount("/pmtiles/files", StaticFiles(directory=PMTILES_DIR), name="pmtiles-files")

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
