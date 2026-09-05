# Fossil Zone Mapping

Aplicación web para identificar zonas geográficas con alta probabilidad de contener fósiles,
cruzando datos geológicos, topográficos, de cobertura vegetal e hidrográficos. Foco inicial:
La Rioja (España), extensible a otras regiones.

Este proyecto es independiente del skill UI/UX Pro Max del resto del repositorio; vive en su
propia carpeta (`fossil-zone-mapping/`) y no comparte código con `src/` ni `cli/`.

## Estado actual: Fase 1 — Esqueleto

- Backend FastAPI con endpoints `/health` y `/config` (región + pesos de scoring por defecto).
- Frontend con mapa Leaflet centrado en La Rioja y el bounding box de la región dibujado.
- Sin base de datos ni capas geoespaciales todavía (llegan en las fases 2-7).

## Cómo levantarlo

### Backend

```bash
cd fossil-zone-mapping/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Esto sirve tanto la API (`/health`, `/config`) como el frontend estático en `http://localhost:8000/`.

### Frontend (alternativa sin backend)

El frontend también puede abrirse directamente (`frontend/index.html`) o servirse con cualquier
servidor estático; si el backend no está disponible, cae a una configuración por defecto embebida.

## Variables de entorno

Ver `backend/.env.example`. Ninguna es obligatoria para la fase 1; `FZM_COPERNICUS_CLIENT_ID` /
`FZM_COPERNICUS_CLIENT_SECRET` se necesitarán a partir de la fase 4 (NDVI vía Sentinel-2).

## Roadmap

1. ~~Esqueleto backend + frontend~~ (actual)
2. Capa de litología (IGME) sobre el mapa
3. Cálculo de pendiente a partir del MDT (IGN)
4. NDVI / cobertura vegetal (Sentinel-2, Copernicus)
5. Hidrografía y distancia a cauces (IGN)
6. Función de scoring combinando capas con pesos ajustables (sliders)
7. Capa de yacimientos paleontológicos conocidos
8. Pulido: leyenda, exportar GeoJSON, guardar configuraciones de pesos
