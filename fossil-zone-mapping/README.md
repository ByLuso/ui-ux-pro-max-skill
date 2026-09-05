# Fossil Zone Mapping

Aplicación web para identificar zonas geográficas con alta probabilidad de contener fósiles,
cruzando datos geológicos, topográficos, de cobertura vegetal e hidrográficos. Foco inicial:
La Rioja (España), extensible a otras regiones.

Este proyecto es independiente del skill UI/UX Pro Max del resto del repositorio; vive en su
propia carpeta (`fossil-zone-mapping/`) y no comparte código con `src/` ni `cli/`.

## Estado actual: Fase 2 — Capa de litología (IGME)

- Backend FastAPI con endpoints `/health` y `/config` (región + pesos de scoring por defecto).
- Frontend con mapa Leaflet centrado en La Rioja y el bounding box de la región dibujado.
- Capa de litología del IGME pintada como overlay WMS (ver detalle abajo), con control de
  capas (on/off) y leyenda dinámica.
- Sin base de datos ni procesamiento geoespacial en backend todavía (llegan en las fases 3-7).

### Capa de litología (fase 2)

Se usa el servicio WMS público del IGME **`IGME_Litologias_1M`** (Mapa Litológico de España a
escala 1:1.000.000), añadido directamente en el frontend como `L.tileLayer.wms` sobre el mapa base:

```
https://mapas.igme.es/gis/services/Cartografia_Geologica/IGME_Litologias_1M/MapServer/WMSServer
```

**Por qué esta capa y no el Mapa Geológico 1:200.000:** el servicio `IGME_Geologico_200` (más
detallado) tiene huecos de digitalización por hoja — comprobado con peticiones `GetMap` reales,
el área de La Rioja devuelve un lienzo en blanco en ese servicio. `IGME_Litologias_1M` sí tiene
cobertura nacional completa y devuelve litología real sobre La Rioja, así que se usó como capa
de fase 2. Cuando se aborde el scoring por celda (fase 6) puede convenir buscar una fuente más
detallada a nivel de hoja (o vectorizar sheets del 1:200.000 donde existan) en vez de depender
solo del 1:1.000.000.

No requiere API key: es un servicio WMS público de acceso abierto. La leyenda se obtiene en
tiempo real vía `GetLegendGraphic` del mismo servicio.

Leaflet se sirve ahora vendorizado en `frontend/vendor/leaflet/` (en vez de CDN) para no depender
de una CDN externa al abrir la app — útil también para el caso de Termux.

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

1. ~~Esqueleto backend + frontend~~
2. ~~Capa de litología (IGME) sobre el mapa~~ (actual)
3. Cálculo de pendiente a partir del MDT (IGN)
4. NDVI / cobertura vegetal (Sentinel-2, Copernicus)
5. Hidrografía y distancia a cauces (IGN)
6. Función de scoring combinando capas con pesos ajustables (sliders)
7. Capa de yacimientos paleontológicos conocidos
8. Pulido: leyenda, exportar GeoJSON, guardar configuraciones de pesos
