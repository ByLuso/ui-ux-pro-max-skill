# Fossil Zone Mapping

Aplicación web para identificar zonas geográficas con alta probabilidad de contener fósiles,
cruzando datos geológicos, topográficos, de cobertura vegetal e hidrográficos. Foco inicial:
La Rioja (España), extensible a otras regiones.

Este proyecto es independiente del skill UI/UX Pro Max del resto del repositorio; vive en su
propia carpeta (`fossil-zone-mapping/`) y no comparte código con `src/` ni `cli/`.

## Estado actual: Fase 3 — Pendiente a partir del MDT (IGN)

- Backend FastAPI con endpoints `/health`, `/config`, `/terrain/slope` y `/terrain/slope.png`.
- Frontend con mapa Leaflet centrado en La Rioja y el bounding box de la región dibujado.
- Capa de litología del IGME pintada como overlay WMS, con control de capas y leyenda dinámica.
- Capa de pendiente calculada por el backend a partir del MDT del IGN (ver detalle abajo),
  también con control de capas y leyenda.
- Sin base de datos todavía; el procesamiento geoespacial usa caché en disco (`backend/data/cache/`).

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

### Pendiente a partir del MDT (fase 3)

El backend descarga el Modelo Digital del Terreno del IGN vía su servicio **WCS** (no WMS: WCS
devuelve los valores de elevación reales, necesarios para calcular pendiente; WMS solo da una
imagen ya renderizada):

```
https://servicios.idee.es/wcs-inspire/mdt  (coverage: Elevacion25830_200, resolución 200 m)
```

Flujo (`backend/app/services/dem.py`):
1. Convierte la bbox de la región (WGS84) a EPSG:25830 y pide ese recorte al WCS → GeoTIFF de
   elevación real (cacheado en `data/cache/dem_<región>_200m.tif`).
2. Calcula la pendiente en grados con `numpy.gradient` sobre la elevación.
3. Reproyecta la pendiente a EPSG:4326 y la clasifica en 4 rangos (0-5°, 5-15°, 15-30°, >30°)
   pensados para el caso de uso (>15° = taludes/cortes/acantiladas, zonas de interés).
4. Escribe un PNG en color (`data/cache/slope_<región>_200m.png`) y sus metadatos
   (bounds geográficos + leyenda) en un `.json` junto a él.

El frontend pide `/terrain/slope` (bounds + leyenda) y superpone `/terrain/slope.png` con
`L.imageOverlay`, alineado exactamente sobre la bbox de La Rioja. Capa apagada por defecto para
no solapar visualmente con la litología; se activa desde el control de capas.

Tampoco requiere API key — el WCS del IGN es de acceso público. La resolución de 200 m es la
usada para esta vista regional; si en el scoring por celda (fase 6) hace falta más detalle, el
mismo servicio ofrece coverages a 25 m y 5 m (`Elevacion25830_25` / `_5`), más pesados de
descargar y procesar.

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
2. ~~Capa de litología (IGME) sobre el mapa~~
3. ~~Cálculo de pendiente a partir del MDT (IGN)~~ (actual)
4. NDVI / cobertura vegetal (Sentinel-2, Copernicus)
5. Hidrografía y distancia a cauces (IGN)
6. Función de scoring combinando capas con pesos ajustables (sliders)
7. Capa de yacimientos paleontológicos conocidos
8. Pulido: leyenda, exportar GeoJSON, guardar configuraciones de pesos
