# Fossil Zone Mapping

Aplicación web para identificar zonas geográficas con alta probabilidad de contener fósiles,
cruzando datos geológicos, topográficos, de cobertura vegetal e hidrográficos. Foco inicial:
La Rioja (España), extensible a otras regiones.

Este proyecto es independiente del skill UI/UX Pro Max del resto del repositorio; vive en su
propia carpeta (`fossil-zone-mapping/`) y no comparte código con `src/` ni `cli/`.

## Estado actual: Fase 7 + multi-región + hillshade LiDAR + relieve LiDAR propio

- Backend FastAPI con endpoints `/health`, `/regions`, `/config`, `/pmtiles/zones`,
  `/terrain/slope(.png)`, `/terrain/hillshade.png`, `/vegetation/ndvi(.png)`,
  `/hydrography/distance(.png)`, `/scoring/{meta,heatmap.png,breakdown}` y
  `/known-sites/sites.geojson`. Sirve además los `.pmtiles` de relieve LiDAR propio (ver más
  abajo) en `/pmtiles/files/<archivo>`, con soporte de HTTP range requests.
- Frontend con selector de región en la cabecera (La Rioja / Bizkaia (Pagasarri)); cambiar de
  región recarga el mapa entero para esa bbox. Tres capas base intercambiables (OSM, ortofoto
  PNOA y relieve MDT del IGN, cobertura nacional) más el resto de capas como overlays.
- Nueve capas superpuestas: litología (IGME, WMS), pendiente (MDT del IGN), NDVI (Sentinel-2,
  Copernicus), ríos y arroyos (IGN, WMS), distancia a cauces, **relieve LiDAR de alta resolución
  propio** (por zona, ver más abajo), el **score combinado** (heatmap, activo por defecto), las
  **zonas de mayor interés** (chinchetas sobre los máximos locales del score, también activas por
  defecto) y los **yacimientos paleontológicos conocidos** (IELIG, también activos por defecto),
  cada una con su control de capas y su sección de leyenda.
- Panel de sliders (5 variables) para ajustar en vivo el peso de cada componente del score, y clic
  en el mapa (o en una chincheta) para ver el desglose de por qué una zona tiene esa puntuación.
  Las chinchetas se recalculan junto con el heatmap al mover cualquier slider.
- Herramienta **"🔍 Revelar relieve oculto (LiDAR)"**: al activarla, un clic en el mapa muestra el
  hillshade LiDAR (interpolado a una rejilla fina, ver más abajo) de un cuadrado de 1 km centrado
  en ese punto — revela relieve fino (barrancos, cortes, posibles estructuras) que la vegetación
  oculta en la imagen óptica normal, ya que el LiDAR atraviesa el dosel forestal y el resto de
  capas no. Un botón "✕" pegado a la esquina de la imagen la quita sin desactivar la herramienta,
  para poder tocar otro punto y comparar zonas distintas.
- Sin base de datos todavía; el procesamiento geoespacial usa caché en disco (`backend/data/cache/`),
  con archivos separados por región (`dem_bizkaia_200m.tif`, `dem_la-rioja_200m.tif`, etc.).

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

### Litología con score numérico (fase 6, previo al scoring)

Las fases 2 y 5 mostraban capas del IGME/IGN como imágenes (WMS) — suficiente para visualizar,
pero un WMS no da valores por celda, y el score los necesita. Para litología en concreto, el
`MapServer` del IGME sí expone una operación **`query`** de ArcGIS REST (no un WFS estándar, que
este servicio no tiene habilitado) que devuelve las ~195 geometrías de la región con su atributo
`Litologia` en texto libre (p. ej. *"Calizas detríticas, calcarenitas, margas, arcillas y
calizas"*).

`backend/app/services/lithology.py` clasifica cada descripción con una heurística simple y
**extensible a otras regiones** (no una tabla fija por comunidad autónoma): cuenta cuántas
palabras clave de roca sedimentaria favorable aparecen (caliza, arenisca, arcilla, marga, lutita,
conglomerado, dolomía, yeso, evaporita...) frente a palabras clave de roca metamórfica/ígnea o
depósitos recientes sin consolidar (pizarra, cuarcita, esquisto, granito, grava, arena, limo...),
y el score 0-100 es la proporción de coincidencias positivas. Sin coincidencias, score neutro (50).

### Scoring combinado (fase 6)

`backend/app/services/scoring.py` combina las 4 capas anteriores en un único score 0-100 por celda:

1. Cada capa se lleva a la misma rejilla de análisis (la del MDT, ya usada por pendiente e
   hidrografía) y se normaliza a 0-100, saturando en el punto que ya se usaba como umbral de
   "interés" en su propia capa: pendiente ≥30° → 100, NDVI ≤0 → 100 (y ≥0.5 → 0, cuanta menos
   vegetación mejor), distancia a cauce = 0 m → 100 (y ≥600 m → 0). La litología ya viene en 0-100.
2. El score final es la media ponderada de las 4, **normalizada por la suma de los pesos activos**
   — así los sliders no necesitan sumar 100% y poner uno a 0 simplemente lo excluye del cálculo.
3. Se colorea con un degradado continuo (azul transparente → verde → amarillo → naranja → rojo)
   en vez de clases discretas, para que se vea como un mapa de calor real.

Endpoints:
- `GET /scoring/meta` — bounds, degradado de color y pesos por defecto (para inicializar los sliders).
- `GET /scoring/heatmap.png?w_lithology=&w_slope=&w_vegetation=&w_water=&w_known_sites=` — el
  heatmap PNG, recalculado en cada petición con los pesos dados (barato: las 5 sub-capas ya están
  cacheadas en memoria/disco, solo cambia la combinación).
- `GET /scoring/breakdown?lat=&lon=&w_...` — al hacer clic en el mapa, devuelve el score final y,
  por variable, su sub-score **y el dato crudo** (descripción litológica real, grados de pendiente,
  valor de NDVI, metros al cauce más cercano, yacimiento conocido más próximo y su distancia) para
  explicar por qué una zona puntúa como puntúa.

En el frontend, el panel "Pesos del score" (arriba a la izquierda) tiene un slider por variable;
al mover uno, tras un pequeño debounce, se pide un nuevo heatmap con `imageOverlay.setUrl(...)`
sin recrear la capa. Un clic en cualquier punto del mapa abre un popup con el desglose.

#### Zonas de mayor interés (chinchetas)

Petición explícita del usuario: en vez de tener que rastrear el heatmap a ojo buscando las zonas
más rojas, `scoring.find_hotspots()` marca automáticamente los **máximos locales** del score
combinado por encima de un umbral (`HOTSPOT_MIN_SCORE = 65`) con una chincheta (el marcador
clásico de Leaflet — los assets ya estaban vendorizados desde el principio, no hubo que añadir
nada nuevo). Detalles:

- Usa `scipy.ndimage.maximum_filter` sobre la rejilla del score para encontrar píxeles que son el
  máximo de su entorno (`HOTSPOT_MIN_SEPARATION_PX = 4` píxeles de radio, ~800 m en la rejilla de
  200 m del MDT).
- Una meseta plana puede tener varios píxeles vecinos empatados al mismo valor — sin más, saldrían
  varias chinchetas pegadas dentro de la misma mancha. Se aplica una supresión de no-máximos
  simple: se recorren los candidatos de mayor a menor score y se descarta cualquiera demasiado
  cerca (en píxeles) de uno ya elegido.
- Tope de 15 chinchetas (las de mayor score), para no saturar el mapa.

Endpoint: `GET /scoring/hotspots?w_...` (mismos pesos que el heatmap/breakdown) — devuelve
`{lat, lon, score}` por punto. En el frontend, tocar una chincheta pide `/scoring/breakdown` para
ese punto y muestra el mismo popup de desglose que un clic normal en el mapa. Las chinchetas se
recalculan junto con el heatmap cada vez que cambia algún peso (mismo callback `onChange` del
panel de sliders) y al cambiar de región.

### Yacimientos paleontológicos conocidos (fase 7)

Se investigó primero el catálogo abierto de La Rioja (IDErioja): existe una capa
"Yacimientos paleontológicos" (`https://ogc.larioja.org/wfs/yacpal/...`, en colaboración con la
UPV/EHU), pero su WMS/WFS está detrás de un challenge anti-bot de Cloudflare que bloquea cualquier
cliente automatizado (no solo curl con distintos user-agents; es un bloqueo real, no un capricho
de configuración) — intentar sortearlo no es apropiado para un backend de producción.

En su lugar se usa el **IELIG** (Inventario Español de Lugares de Interés Geológico) del IGME, que
usa el mismo patrón de ArcGIS REST que ya funcionaba para la litología (fase 6) y sí es accesible:

```
https://mapas.igme.es/gis/rest/services/BasesDatos/IGME_IELIG/MapServer/0/query
```

De los 112 geosites que el IELIG cataloga en la bbox de La Rioja, `backend/app/services/known_sites.py`
filtra los que tienen `InteresPrincipal` = "Paleontológico" (42 resultados) — incluye toda la serie
de icnitas de dinosaurio del Weald de Cameros (yacimientos de Valdeté, Soto en Cameros, La Pellejera,
Virgen del Campo...) además de otros hallazgos (mamíferos del Cuaternario de Villarroya, tronco fósil
de Igea, etc.). Cada geosite (polígono) se reduce a su centroide como "punto de referencia".

Dos usos de estos puntos:
1. **Visual**: `GET /known-sites/sites.geojson` sirve los puntos con nombre; el frontend los dibuja
   como círculos blancos con borde oscuro y popup al hacer clic. Activados por defecto — sirven
   para comprobar a simple vista si el heatmap de score "acierta" cerca de yacimientos reales.
2. **Scoring**: igual que la distancia a cauces (fase 5), se rasteriza la posición de los 42 puntos
   sobre la rejilla del MDT y se aplica una transformada de distancia euclídea, saturando a 2 km
   (más permisivo que los 600 m del agua, porque son pocos puntos y dispersos). Este componente
   pesa un 15% por defecto y es, como pide el objetivo del proyecto, **señal de refuerzo, no filtro
   excluyente**: se puede bajar a 0% con su slider sin que desaparezca ninguna otra capa.

### Soporte multi-región — Bizkaia (Pagasarri)

El objetivo original ("extensible a otras regiones") se activó a raíz de un hallazgo real: fósiles
encontrados en el Pagasarri (Bilbao). Antes de tocar código se comprobó con peticiones reales que
las 4 fuentes externas (MDT del IGN, litología e IELIG del IGME, hidrografía del IGN) tienen datos
para esa zona — incluyendo, en el IELIG, **2 yacimientos paleontológicos ya catalogados cerca de
Pagasarri** ("Peces fósiles de Zeanuri" y "Ammonites y corales de San Roque"), lo que corrobora el
hallazgo. En las coordenadas del propio Pagasarri (43.233, -2.95) el score combinado da **73/100**
con los pesos por defecto: litología 100 (dolomías/calizas/margas), NDVI 99 (roca casi desnuda en
la cumbre), pendiente 52, agua 67, yacimientos conocidos 19 — una validación de campo poco habitual
para un modelo que hasta ahora solo se había probado contra datos ya catalogados.

Cambios para soportarlo (`backend/app/config.py`):
- Los datos de región (antes fijos en `Settings`) pasaron a un registro `REGIONS: dict[str, Region]`
  (`la-rioja`, `bizkaia`), cada una con su propio slug, nombre, bbox, centro y zoom.
- **Todas** las funciones de los servicios (`dem.py`, `ndvi.py`, `hydrography.py`, `lithology.py`,
  `known_sites.py`, `scoring.py`) reciben ahora un `Region` explícito en vez de leer una bbox global
  — así cada capa cachea en disco por región (`data/cache/dem_bizkaia_200m.tif` vs.
  `dem_la-rioja_200m.tif`, etc.) y el score de `scoring.py` cachea sus 5 sub-capas en memoria por
  `region.slug`, no en una única variable global.
- Cada router acepta `region: Region = Depends(region_param)` (`app/dependencies.py`), que resuelve
  `?region=<slug>` contra el registro y responde 404 si no existe. Nuevo endpoint `GET /regions`
  para que el frontend construya el selector.
- Frontend: `<select id="region-select">` en la cabecera, poblado desde `/regions`. Cambiar de
  región llama a `initMap(slug)` de nuevo, que destruye el mapa Leaflet anterior
  (`activeMap.remove()`) y lo reconstruye desde cero para la bbox nueva. Un contador de
  "generación" evita que las peticiones aún en vuelo de la región anterior toquen los controles
  del mapa nuevo (o de uno ya eliminado) si el usuario cambia de región mientras algo seguía cargando.

### Revelar relieve oculto con LiDAR (hillshade de 5 m interpolado)

Petición explícita del usuario: quería algo parecido a apps de urbex (p. ej. las que muestran un
"hillshade" LiDAR en escala de grises para localizar ruinas bajo bosque) pero aplicado a la
búsqueda de fósiles — un rasgo geológico expuesto puede quedar oculto para el NDVI/óptico normal
si hay vegetación encima, mientras que el LiDAR (pulsos láser) sí consigue pasar por huecos del
dosel forestal y medir el terreno real debajo.

**Historial de rediseños** (por si se retoma alguno de estos enfoques): la v1 original era clic →
parche fijo de 1 km², sin forma de quitarlo salvo recargar. Se cambió a un v2 de comparación tipo
"swipe" (slider arrastrable, LiDAR a la izquierda / mapa a la derecha) que seguía el viewport del
mapa — pero en Chrome de Android el `<input type="range">` en el que se apoyaba se renderiza con
el widget nativo del sistema (ignorando nuestro CSS) y su arrastre táctil real no se comportaba
igual que con ratón en escritorio, por más que se ajustara altura/`pointer-events`/z-index: el
problema de fondo era depender de un control de formulario nativo del SO. Tras verificar eso en
un dispositivo real, se volvió al **enfoque v1 (clic → parche fijo)**, pero con dos mejoras que
sí faltaban en el original: un botón "✕" para quitar la zona revelada sin desactivar la
herramienta, y una interpolación del LiDAR para que se vea nítido en vez de "a bloques".

**Por qué esta capa no funciona como las demás (por región completa):** el resto de capas usan el
MDT a 200 m; a esa resolución toda la bbox de una región son ~600×400 píxeles, manejable. El mismo
servicio WCS del IGN también ofrece `Elevacion25830_5` (LiDAR real, 5 m) — pero a esa resolución,
la bbox completa de una región serían decenas de miles de píxeles por lado (varios GB). Por eso
esta herramienta pide bajo demanda solo un recorte fijo de 1 km² (500 m a cada lado del punto
tocado) en vez de toda la región, con un tope duro (`MAX_SIDE_M = 3000` m de lado, muy por encima
de lo que pide un clic) como red de seguridad ante cualquier uso futuro con bboxes mayores.

Flujo (`backend/app/services/hillshade.py`):
1. Convierte el punto tocado en una bbox de 1 km² y la pasa a EPSG:25830; si su lado superase
   `MAX_SIDE_M`, lanzaría `AreaTooLargeError` (→ 400 en el router). Pide al WCS del IGN el recorte
   de 5 m de esa bbox.
2. **Interpola la rejilla a una más fina** (`_supersample`, spline cúbica ×3 con `scipy.ndimage.zoom`,
   tras rellenar huecos sin dato con el valor válido más cercano para que no corrompan la spline):
   no añade detalle real por debajo de los 5 m nativos del LiDAR, pero da curvas de relieve suaves
   en vez del aspecto "a bloques" de simplemente estirar en el navegador una imagen con pocos
   píxeles — esto es lo que arregla la queja de mala calidad de imagen.
3. Calcula un **hillshade multidireccional** sobre la rejilla ya interpolada: en vez de iluminar
   desde un único azimut (lo habitual deja invisible cualquier rasgo alineado con esa dirección de
   luz), se promedian 4 azimuts (315°, 45°, 135°, 225°) a 45° de altitud solar.
4. Aplica un estiramiento de contraste por percentiles (2-98): promediar 4 direcciones aplana el
   contraste, y sin este paso el relieve fino —justo lo que se quiere revelar— casi no se aprecia.
5. Devuelve un PNG en escala de grises; los bounds WGS84 reales del recorte (calculados sobre la
   rejilla ORIGINAL sin interpolar, ya que interpolar no cambia el área cubierta sobre el terreno)
   van en la cabecera HTTP `X-Bounds` (no en el cuerpo, para no tener que pedir el recorte dos veces).

Endpoint: `GET /terrain/hillshade.png?min_lat=&min_lon=&max_lat=&max_lon=` (bbox alrededor del
punto tocado). No depende de `?region=`: el LiDAR del IGN es de cobertura nacional, así que
funciona en cualquier punto de España, esté o no dentro de la bbox de una región configurada.

En el frontend, el botón "🔍 Revelar relieve oculto (LiDAR)" (arriba a la izquierda) activa el modo
de clic: tocar el mapa pide el hillshade de un cuadrado de 1 km centrado ahí y hace zoom para
encajarlo (`map.fitBounds`). Un botón "✕" (elemento DOM propio, no un control fijo de Leaflet: su
posición en pantalla se recalcula en cada `move`/`zoom` para seguir pegado a la esquina superior
derecha del recuadro) permite quitar la imagen sin desactivar la herramienta, para poder tocar
otro punto y comparar zonas distintas. Mientras la herramienta está activa, el clic en el mapa no
abre el desglose del score; se restaura al desactivarla con el mismo botón, que también limpia
cualquier imagen y botón "✕" que quedara.

### Relieve LiDAR propio de máxima calidad (pipeline + PMTiles)

Petición explícita del usuario, distinta de la herramienta anterior: en vez de pedir el hillshade
al vuelo (limitado a los 5 m de resolución del WCS público del IGN y a un área pequeña por
petición), esto es una **capa de mapa normal**, pre-generada localmente a partir de las hojas
MDT02/MDT01 del CNIG (o de nubes `.laz` PNOA-LiDAR, opcionalmente a 0,5-1 m con PDAL), combinando
hillshade multidireccional + Sky-View Factor, teselada de antemano y servida como un único
archivo `.pmtiles` — sin límite de área por petición ni recorte en caliente, y con la resolución
real de los datos de origen en vez de una interpolación.

**Por qué es un pipeline aparte y no un endpoint del backend:** generar tiles hasta zoom 20 de un
MDT reproyectado necesita GDAL, RVT y (opcionalmente) PDAL — herramientas pesadas, con
instalación delicada en Windows, y datos de entrada que el usuario descarga él mismo (no hay API
pública para las hojas MDT02 en bruto). Por eso vive en `./pipeline/` como scripts independientes
que se ejecutan **en el ordenador de quien genera las zonas**, no en el servidor de la app — el
backend solo sirve el `.pmtiles` ya generado. Ver `pipeline/README.md` para instalación (Windows,
vía conda-forge) y uso paso a paso.

Resumen del pipeline (detalle completo en `pipeline/README.md`):
1. (Opcional) `.laz` → MDT propio con PDAL (filtra clase suelo, malla TIN/IDW).
2. `gdalbuildvrt` de todas las hojas de la zona en un VRT sin costuras.
3. Tres productos desde el VRT: hillshade multidireccional (`gdaldem hillshade -multidirectional`),
   Sky-View Factor y Simple Local Relief Model (estos dos con RVT — rvt-py).
4. Combina hillshade × SVF, estira contraste por percentiles 2-98, GeoTIFF RGB de 8 bits (el LRM
   se guarda aparte, es el mejor de los tres para muros/ruinas pero no entra en esta mezcla).
5. `gdalwarp -r cubic` a EPSG:3857.
6. `.pmtiles` final con `rio-pmtiles` (mismo resultado que `pmtiles convert`, pero instalable con
   pip — sin depender de un binario Go aparte, más simple de instalar en Windows).
7. Parametrizable por zona (`pipeline/zones/<nombre>.yaml`): bbox o patrón de hojas de entrada,
   z-factor del hillshade, radio del LRM, rango de zoom — añadir una zona nueva no obliga a
   rehacer las demás.

**Integración en el frontend:** el selector de capas base ahora tiene tres opciones mutuamente
excluyentes — **OSM**, **ortofoto PNOA** (`OI.OrthoimageCoverage`, IGN) y **relieve MDT** (IGN,
`EL.ElevationGridCoverage`, cobertura nacional — de respaldo fuera de las zonas con `.pmtiles`
propio; no encontramos un WMS de sombreado/hillshade dedicado del IGN con cobertura nacional
accesible, así que esta capa pinta el MDT como rampa de color de elevación, no como hillshade
gris — cambiar la URL/capa en `frontend/js/config.js` si se localiza uno mejor). Cada zona con
`.pmtiles` propio aparece como un overlay independiente ("Relieve LiDAR de alta resolución
(\<zona\>)"), cargado con
[pmtiles.js](https://github.com/protomaps/PMTiles) (vendorizado en `frontend/vendor/pmtiles/`,
el build global oficial del paquete npm `pmtiles`, con su helper `leafletRasterLayer` — no hace
falta `protomaps-leaflet`, que es para tiles *vectoriales*; los nuestros son PNG raster). La capa
lleva `bounds` a la bbox de su zona: Leaflet no pide ningún tile fuera de ese rectángulo (lo
comprueba `GridLayer._isValidTile`), así que fuera de la zona el relieve WMS del IGN sigue siendo
lo que se ve. Un control de opacidad (slider normal, igual que los de "Pesos del score" — sin los
problemas de arrastre táctil que sí tuvo el slider de comparación "swipe" descartado antes, que
usaba un truco distinto con un `<input type="range">` invisible) permite superponerla a la
ortofoto ajustando cuánto se ve de cada una. Nota de Leaflet: el checkbox de cada zona en el
selector de capas aparece deshabilitado si el zoom actual del mapa está fuera del
`min_zoom`/`max_zoom` de esa zona — es el comportamiento nativo de `L.Control.Layers`, no un bug;
hay que acercar el zoom a la zona antes de poder activarla.

Atribución: todas las capas de origen IGN/CNIG (ortofoto, relieve WMS, y cada zona PMTiles)
llevan `© IGN / CNIG` en su atribución, visible en la esquina inferior del mapa.

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
5. ~~Hidrografía y distancia a cauces (IGN)~~
6. ~~Función de scoring combinando capas con pesos ajustables (sliders)~~
7. ~~Capa de yacimientos paleontológicos conocidos~~ (actual)
8. Pulido: leyenda, exportar GeoJSON, guardar configuraciones de pesos
