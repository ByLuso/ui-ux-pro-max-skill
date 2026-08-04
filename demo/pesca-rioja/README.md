# Pesca Rioja — prototipo interactivo

Prototipo frontend (sin backend) de la app de pesca deportiva en La Rioja descrita en el
prompt maestro. Mapa interactivo (Leaflet + OpenStreetMap/Esri/OpenTopoMap) con ríos y
tramos de ejemplo, fichas de tramo y de especie, filtros, búsqueda, geolocalización,
calendario de vedas, predictor de "buen día de pesca", cuaderno de capturas y ajustes de
accesibilidad (alto contraste, tamaño de texto, offline).

**Todos los datos son ilustrativos** (coordenadas, cupos, precios, caudales). No sustituyen
la Orden Anual de Pesca del Gobierno de La Rioja ni ninguna fuente oficial.

## Ejecutar en local

No requiere build ni dependencias. Sirve la carpeta con cualquier servidor estático:

```bash
cd demo/pesca-rioja
python3 -m http.server 8080
# abre http://localhost:8080
```

## Estructura

```
index.html          Estructura de la app (header, mapa, paneles, fichas)
css/style.css        Tema "outdoor premium" (Outfit + Work Sans), claro/oscuro, responsive
js/data.js            Datos mock: ríos/tramos, especies, POIs, vedas, i18n (ES/EU/EN/FR)
js/app.js             Lógica: mapa, filtros, búsqueda, fichas, herramientas
vendor/leaflet/        Leaflet vendorizado localmente (sin dependencia de CDN en runtime)
sw.js                  Service worker mínimo para el modo offline (app shell)
```

## Qué es real y qué es simulado

- **Real:** interacción de mapa, filtros, búsqueda (con normalización de tildes),
  geolocalización del navegador, fichas completas de tramo/especie, reseñas y cuaderno de
  capturas (persistidos en `localStorage`), export a PDF vía impresión del navegador, modo
  offline vía Service Worker (cachea el app shell).
- **Simulado:** caudal/temperatura del agua, predicción de "buen día de pesca" (combina fase
  lunar real con presión/caudal aleatorios deterministas por día), aviso de crecida. Estos
  puntos están marcados en la UI como integraciones pendientes con SAIH Ebro / AEMET.

## Siguiente paso hacia producción

Sustituir `js/data.js` por llamadas a un backend (Supabase/PostGIS sugerido en el prompt
original) con los tramos reales georreferenciados y las integraciones oficiales (Gobierno de
La Rioja, CHE/SAIH Ebro, AEMET, Federación Riojana de Pesca).
