# Pipeline de relieve LiDAR de alta resolución

Genera un archivo `.pmtiles` (tiles de imagen en un único archivo, servido por el propio backend
de la app con HTTP range requests — sin servidor de teselas aparte) a partir de hojas MDT02/MDT01
del CNIG, combinando **hillshade multidireccional** + **Sky-View Factor** (ambos de mejor calidad
que un hillshade simple para detectar relieve fino bajo vegetación: muros, terrazas, cortes) en
una imagen de 8 bits con buen contraste, reproyectada y teselada hasta el zoom que se pida.

Se ejecuta **en tu ordenador** (no en una sesión cloud): tú descargas los MDT del CNIG, el
pipeline los procesa localmente, y copias el `.pmtiles` resultante a la app.

## 1. Instalación (Windows)

La forma más sencilla en Windows es con **conda/miniconda** + **conda-forge**: instala GDAL con
sus bindings de Python ya emparejados correctamente (con pip a secas en Windows esto suele dar
problemas de versión, como nos pasó a nosotros al montar esto).

1. Instala [Miniconda](https://docs.conda.io/en/latest/miniconda.html) si no lo tienes.
2. Abre "Anaconda Prompt" (o PowerShell si ya tienes conda en el PATH) y crea un entorno:
   ```
   conda create -n fzm-pipeline -c conda-forge python=3.11 gdal
   conda activate fzm-pipeline
   ```
3. Instala el resto de dependencias (puras de pip, sin líos de compilación) desde esta carpeta:
   ```
   cd fossil-zone-mapping\pipeline
   pip install -r requirements.txt
   ```
   (Si `pip install rvt-py` se queja de la versión de GDAL, es porque `pip` intentó instalar unos
   bindings de GDAL más nuevos que los de conda — abre `requirements.txt` y comenta la línea
   `GDAL==...` si la has descomentado; con conda ya tienes los bindings correctos y no hace falta
   que pip toque nada de GDAL.)
4. Comprueba que todo está en el PATH del entorno conda:
   ```
   gdalinfo --version
   gdal2tiles.py --help
   rio pmtiles --help
   ```

**Alternativa sin conda:** [OSGeo4W](https://trac.osgeo.org/osgeo4w/) instala GDAL y sus
herramientas de línea de comandos en Windows; después, desde el "OSGeo4W Shell", `pip install
rvt-py rio-pmtiles pyyaml` (sin la línea `GDAL==` de requirements.txt, ya la trae OSGeo4W). Es más
manual de emparejar versiones que conda, úsalo solo si ya usas OSGeo4W por otra razón.

### PDAL (opcional, solo si vas a usar nubes de puntos `.laz`)

PDAL no tiene paquete oficial en PyPI ni en el canal principal de conda para todas las
plataformas de forma trivial — instálalo con:
```
conda install -c conda-forge pdal
```
en el mismo entorno `fzm-pipeline`. Si no tienes archivos `.laz` (solo hojas MDT02/MDT01 en
GeoTIFF/ASC), no hace falta instalar esto — el pipeline salta ese paso automáticamente si
`lidar_source: mdt` en el `.yaml` de la zona (es el valor por defecto).

## 2. Descarga los MDT del CNIG

Del [Centro de Descargas del CNIG](https://centrodedescargas.cnig.es/CentroDescargas/) (o del
[PNOA-LiDAR](https://pnoa.ign.es/pnoa-lidar) si vas a usar `.laz`), descarga las hojas MDT02 (o
MDT01 si hay más resolución disponible para tu zona) que cubran el área que te interesa, en
GeoTIFF o ASC, en EPSG:25830.

Ponlas en `pipeline/data/mdt/<nombre-de-tu-zona>/` (crea la carpeta si no existe). Puedes meter
varias hojas — el paso 1 las combina en un único VRT sin costuras.

## 3. Define la zona

Copia `zones/example.yaml` a `zones/<nombre>.yaml` y ajusta al menos `name` (debe coincidir con
el nombre de la carpeta de `data/mdt/`). Los comentarios del propio archivo explican cada campo
(bbox opcional para recortar, z-factor del hillshade, radio del LRM, rango de zoom de los tiles).

## 4. Ejecuta el pipeline

```
cd fossil-zone-mapping\pipeline\scripts
python run_pipeline.py --zone <nombre>
```

Esto corre los 5 pasos en orden (6 si `lidar_source: laz`) y deja todo en
`pipeline/output/<nombre>/`, incluido el `.pmtiles` final. Cada paso también se puede correr
suelto (`python 02_generate_relief.py --zone <nombre>`) si solo hace falta repetir uno tras
cambiar un parámetro — por ejemplo, si solo cambias `zoom_max`, no hace falta rehacer el VRT ni
los productos de relieve, basta con `python run_pipeline.py --zone <nombre> --from-step 4`
(reproyección + tiles).

### Qué hace cada paso

| Script | Qué hace |
|---|---|
| `00_laz_to_dem.py` | (Opcional) genera un MDT desde `.laz` con PDAL — filtra clase 2 (suelo) y malla por TIN/IDW a la resolución que pongas en el `.yaml`. |
| `01_build_vrt.py` | `gdalbuildvrt` de todas las hojas de la zona en un único VRT sin costuras. |
| `02_generate_relief.py` | Genera los 3 productos: hillshade multidireccional (`gdaldem hillshade -multidirectional`), Sky-View Factor y Simple Local Relief Model (ambos con RVT — rvt-py). |
| `03_combine.py` | Combina hillshade × SVF, estira el contraste por percentiles 2-98, y lo guarda como GeoTIFF RGB de 8 bits (el LRM se queda como producto aparte, no entra en esta mezcla — ver nota abajo). |
| `04_reproject.py` | `gdalwarp -r cubic` a EPSG:3857 (el CRS que usan los tiles web). |
| `05_generate_pmtiles.py` | Genera el `.pmtiles` final con `rio pmtiles` (equivalente a `pmtiles convert`, pero instalable con pip — no hace falta el binario Go aparte). |

**Sobre el LRM:** se genera (`<zona>_lrm.tif` en `output/<zona>/`) porque es el mejor de los tres
productos para resaltar muros/ruinas/microrrelieve, pero el paso 4 solo combina hillshade+SVF
(así lo pidió la especificación original). Si más adelante quieres una capa LRM propia en la app,
es cuestión de teselarla también con `rio pmtiles` y darle su propia `PmtilesZone` — el archivo ya
está generado, solo falta ese paso.

## 5. Integrarlo en la app

1. Copia el `.pmtiles` generado a `fossil-zone-mapping/backend/data/pmtiles/`:
   ```
   copy output\<nombre>\<nombre>.pmtiles ..\backend\data\pmtiles\
   ```
2. Añade la zona en `backend/app/config.py`, en la lista `PMTILES_ZONES`:
   ```python
   PmtilesZone(
       name="<nombre>",
       file="<nombre>.pmtiles",
       bbox=(oeste, sur, este, norte),  # WGS84 — sale en la cabecera X-Bounds o con `pmtiles show`
       min_zoom=14,   # el zoom_min que pusiste en el .yaml de la zona
       max_zoom=20,   # el zoom_max que pusiste
   ),
   ```
   El bbox exacto del `.pmtiles` se puede consultar con `rio pmtiles show <archivo>` (viene con
   rio-pmtiles) si no lo tienes ya del `.yaml` de la zona.
3. Reinicia el backend. La nueva capa aparece en el selector como "Relieve LiDAR de alta
   resolución (\<nombre\>)", solo activable (checkbox habilitado) cuando el mapa está dentro del
   rango de zoom de esa zona, y solo pide tiles dentro de su bbox — fuera de ella, la capa base
   "Relieve MDT (IGN, toda España)" sigue disponible como respaldo para el resto del mapa.

## Notas

- **Zoom 20 pesa.** Cuanto más alto `zoom_max`, exponencialmente más tiles (y más tiempo de
  proceso). Para una primera prueba, usa `zoom_max: 18` — solo sube a 20 si de verdad hace falta
  tanto detalle y tienes tiempo/disco de sobra.
- **`hillshade_z_factor`** por encima de 1 exagera el relieve verticalmente — útil en zonas
  llanas donde un muro de 30 cm apenas se nota a z-factor 1, a costa de que el relieve de montaña
  se vea "más dramático" de lo real. Ajusta y mira el resultado (`output/<zona>/<zona>_combined_rgb.tif`
  se puede abrir en QGIS antes de tesela lo, para no tener que rehacer todo el pipeline si no
  convence a la primera).
- **Varias zonas a la vez:** cada una es independiente (su propio `.yaml`, su propia carpeta en
  `data/mdt/`, su propio `.pmtiles`) — el frontend las muestra todas como overlays separados en el
  selector de capas.
