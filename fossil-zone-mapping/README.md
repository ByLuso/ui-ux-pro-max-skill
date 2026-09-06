# Fossil Zone Mapping

Aplicación web para identificar zonas geográficas con alta probabilidad de contener fósiles,
cruzando datos geológicos, topográficos, de cobertura vegetal e hidrográficos. Foco inicial:
La Rioja (España), extensible a otras regiones.

Este proyecto es independiente del skill UI/UX Pro Max del resto del repositorio; vive en su
propia carpeta (`fossil-zone-mapping/`) y no comparte código con `src/` ni `cli/`.

## Estado actual: Fase 5 — Hidrografía y distancia a cauces (IGN)

- Backend FastAPI con endpoints `/health`, `/config`, `/terrain/slope(.png)`, `/vegetation/ndvi(.png)`
  y `/hydrography/distance(.png)`.
- Frontend con mapa Leaflet centrado en La Rioja y el bounding box de la región dibujado.
- Cinco capas superpuestas, cada una con su control de capas y su sección de leyenda (cuando aplica):
  litología (IGME, WMS), pendiente (MDT del IGN), NDVI (Sentinel-2, Copernicus), ríos y arroyos
  (IGN, WMS) y distancia a cauces (calculada en el backend).
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

### NDVI / cobertura vegetal (fase 4)

Usa la **Process API** de Sentinel Hub dentro del Copernicus Data Space Ecosystem (CDSE), que
calcula el NDVI directamente en la nube a partir de Sentinel-2 L2A y devuelve ya el resultado
recortado a la bbox de la región — evita descargar escenas completas (~1 GB) y hacer el álgebra
de bandas nosotros mismos:

```
Token OAuth2: https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
Process API:  https://sh.dataspace.copernicus.eu/api/v1/process
```

Flujo (`backend/app/services/ndvi.py`):
1. Se autentica con `client_credentials` usando `FZM_COPERNICUS_CLIENT_ID` / `FZM_COPERNICUS_CLIENT_SECRET`
   (un "OAuth client" del dashboard de Sentinel Hub, no el usuario/contraseña de la cuenta —
   así el secreto es revocable de forma aislada). El token se cachea en memoria hasta que expira.
2. Pide a la Process API el NDVI de los últimos 90 días (mosaico de menor nubosidad,
   `maxCloudCoverage: 30`) evaluado con un evalscript propio, ya en EPSG:4326 y recortado a la bbox
   — la API devuelve directamente un GeoTIFF de 2 bandas (NDVI escalado 0-255 + máscara de validez).
3. Clasifica el NDVI en 4 rangos pensados para el objetivo del proyecto: **NDVI bajo = suelo/roca
   expuesta** (señal positiva de fosilización, en rojo) y NDVI alto = vegetación densa que oculta
   el terreno (en verde) — mismo código de color que la capa de pendiente (rojo = interés) para
   mantener consistencia visual entre capas.
4. Cachea el GeoTIFF crudo, el PNG coloreado y sus metadatos (bounds + leyenda) en disco.

Igual que la pendiente: capa apagada por defecto, con su propia sección de leyenda que aparece
al activarla desde el control de capas.

**Credenciales:** rellena `FZM_COPERNICUS_CLIENT_ID` y `FZM_COPERNICUS_CLIENT_SECRET` en
`backend/.env` (nunca se commitea) con un OAuth client creado en
https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings → *OAuth clients* → *Create*.

### Hidrografía y distancia a cauces (fase 5)

Dos fuentes distintas para dos necesidades distintas:

- **Visualización** (ríos con nombre, para contexto): WMS INSPIRE público del IGN, capa
  `HY.Network`, añadido directamente en el frontend igual que la litología (sin pasar por el
  backend):
  ```
  https://servicios.idee.es/wms-inspire/hidrografia
  ```
- **Cálculo de distancia** (la señal que de verdad alimentará el scoring en fase 6): el WMS solo
  da una imagen renderizada, no sirve para calcular distancias. Se usa en su lugar el **WFS**
  INSPIRE del mismo servicio (`hy-p:Watercourse`), que devuelve la geometría real de ríos y
  arroyos — para La Rioja son **~18.300 tramos**, descargados paginados (5000 por página) y
  cacheados en `data/cache/hydrography_<región>.gpkg`.

Flujo (`backend/app/services/hydrography.py`):
1. Descarga (o reutiliza de caché) la red completa de cursos de agua vía WFS.
2. Reproyecta esos tramos a la misma rejilla que ya usa la capa de pendiente (reutiliza el MDT
   cacheado en fase 3 para que ambas capas queden pixel-alineadas de cara al scoring).
3. "Rasteriza" los tramos (`rasterio.features.rasterize`) y aplica una transformada de distancia
   euclídea (`scipy.ndimage.distance_transform_edt`) para obtener, en cada celda, la distancia en
   metros al cauce más cercano — la técnica estándar en SIG para este tipo de mapa de proximidad,
   mucho más rápida que calcular distancia punto-a-línea contra 18.300 geometrías una a una.
4. Clasifica la distancia en 4 rangos (<100 m, 100-300 m, 300-600 m, >600 m) — cerca de un cauce
   es señal positiva (erosión activa/reciente), mismo código de color rojo=interés que pendiente y NDVI.
5. Reproyecta a EPSG:4326 y cachea PNG + metadatos, igual que las otras capas calculadas.

Primer cálculo: ~2 minutos (descarga WFS paginada + rasterizado); las siguientes peticiones son
instantáneas gracias a la caché en disco.

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

Copia `backend/.env.example` a `backend/.env` (gitignored) y rellena:

```
FZM_COPERNICUS_CLIENT_ID=...
FZM_COPERNICUS_CLIENT_SECRET=...
```

Necesarias desde la fase 4 (capa NDVI). Sin ellas, `/vegetation/ndvi` responde 500 pero el resto
de la app sigue funcionando con normalidad.

## Roadmap

1. ~~Esqueleto backend + frontend~~
2. ~~Capa de litología (IGME) sobre el mapa~~
3. ~~Cálculo de pendiente a partir del MDT (IGN)~~
4. ~~NDVI / cobertura vegetal (Sentinel-2, Copernicus)~~
5. ~~Hidrografía y distancia a cauces (IGN)~~ (actual)
6. Función de scoring combinando capas con pesos ajustables (sliders)
7. Capa de yacimientos paleontológicos conocidos
8. Pulido: leyenda, exportar GeoJSON, guardar configuraciones de pesos
