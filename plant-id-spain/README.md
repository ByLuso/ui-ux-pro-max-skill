# 🌿 FloraDex España

App móvil (Expo / React Native) para fotografiar e identificar plantas, guardarlas en tu
biblioteca personal con fecha, hora y ubicación, y desbloquear progresivamente la flora de
las comunidades autónomas de España en un Pokédex botánico.

Inspirada en apps como PictureThis / Xingse, pero local-first (sin cuenta, sin nube) y
centrada en la flora española.

## Funcionalidades

- **📷 Cámara + identificación**: fotografía una planta y se identifica automáticamente con
  la API de [PlantNet](https://plantnet.org/) (especializada en flora de Europa occidental).
- **📔 Biblioteca**: cada foto guardada registra especie, fecha y hora exactas, y coordenadas
  GPS (con reverse-geocoding a la comunidad autónoma correspondiente).
- **🌿 Pokédex de flora**: las 17 comunidades autónomas + Ceuta y Melilla, cada una con su
  propio catálogo de especies. Las especies empiezan bloqueadas (silueta oculta) y se
  desbloquean automáticamente la primera vez que identificas esa especie en esa región.
- **📍 Ficha de especie**: al desbloquear una especie ves su información (familia, rareza,
  descripción, dónde se encuentra en España) y el historial de tus propios avistamientos.
- **100% local**: sin registro ni backend. Todo se guarda en SQLite en el propio dispositivo.

## Requisitos previos

1. **Node.js 18+** y npm.
2. **App Expo Go** en tu móvil (iOS/Android), actualizada a la última versión — o Xcode/Android
   Studio para simuladores.
3. **API key gratuita de PlantNet**: regístrate en https://my.plantnet.org/, crea una app y
   copia tu clave. Se introduce dentro de la app, en la pestaña **Ajustes** (se guarda de
   forma segura en el dispositivo con `expo-secure-store`, nunca se sube a ningún sitio).

> **Nota sobre la versión de Expo SDK**: el proyecto usa Expo SDK 54 (no la última disponible
> en npm) porque distintas versiones de la app Expo Go instalada desde la tienda solo soportan
> el SDK con el que fueron publicadas — Expo Go **no soporta cualquier SDK**, solo el que trae
> integrado esa versión concreta de la app. Si al abrir el proyecto ves "Project is incompatible
> with this version of Expo Go", comprueba qué SDK soporta tu Expo Go (suele indicarlo el propio
> error o la pantalla de inicio de la app) y alinea el proyecto a esa versión con:
> ```bash
> npm config set legacy-peer-deps true
> npx expo install expo@<versión SDK> --fix
> ```
> Por ejemplo, para SDK 55: `npx expo install expo@^55.0.0 --fix`. Después de cualquier cambio
> de SDK, borra `node_modules` y reinstala (`rm -rf node_modules && npm install --legacy-peer-deps`).
>
> Si desarrollas sobre Termux (Android) en el mismo teléfono donde corre Expo Go: usa
> `npx expo start` (modo LAN) en vez de `--tunnel`, ya que el túnel basado en ngrok no
> funciona en ese entorno. Copia la URL `exp://<ip-local>:8081` que se muestra en la terminal
> y pégala en Expo Go usando la opción "Enter URL manually".

## Puesta en marcha

```bash
cd plant-id-spain
npm install
npx expo start
```

Escanea el QR con la app **Expo Go** (Android) o la cámara (iOS) para abrir la app en tu
móvil. Necesitarás un dispositivo físico (o simulador con cámara) para probar el flujo de
captura de fotos.

## Estructura del proyecto

```
app/
  (tabs)/
    index.tsx          # Cámara: captura, identificación PlantNet, guardado
    library.tsx         # Biblioteca / diario de avistamientos
    pokedex/
      index.tsx          # Lista de comunidades autónomas con progreso
      [regionId].tsx      # Grid de especies bloqueadas/desbloqueadas por región
    settings.tsx         # API key de PlantNet
  species/[speciesId].tsx  # Ficha de especie + tus avistamientos
data/
  regions.ts             # 17 CCAA + Ceuta/Melilla
  species.ts              # Catálogo de flora española (curado, ampliable)
lib/
  db.ts                   # SQLite: tabla `sightings`
  plantnet.ts              # Cliente de la API de PlantNet
  location.ts               # GPS + reverse geocoding a comunidad autónoma
  settings.ts                # Guardado seguro de la API key
```

## Cómo funciona el desbloqueo del Pokédex

1. Al identificar una foto, PlantNet devuelve un nombre científico.
2. Se compara contra `data/species.ts` (catálogo curado de flora española por región).
3. Si hay coincidencia, el avistamiento queda vinculado a esa especie (`speciesId`) y se
   guarda en SQLite junto con foto, fecha/hora y ubicación.
4. El Pokédex calcula, para cada comunidad autónoma, qué especies de su catálogo tienen ya
   al menos un avistamiento del usuario → esas se muestran desbloqueadas (con tu propia foto
   como miniatura); el resto aparece bloqueada con un candado.
5. Si PlantNet no encuentra coincidencia en el catálogo, el avistamiento se guarda igualmente
   en la Biblioteca (sin vincular a ninguna especie del Pokédex).

## Ampliar el catálogo de flora

`data/species.ts` es un punto de partida curado con ~90 especies repartidas por las 19
regiones (varias son comunes a más de una). **La Rioja** (20 especies: hayedos y melojares de
la Sierra de la Demanda/Cebollera, ribera del Ebro, viñedos) y **Castilla-La Mancha** (37
especies: dehesas, pinares de la Serranía de Cuenca y Montes de Toledo, matorral gipsófilo y
estepario de La Mancha, humedales como las Tablas de Daimiel, y el viñedo manchego) están
especialmente desarrolladas. Para ampliar cualquier otra región:

- Añade nuevas entradas al array `SPECIES` siguiendo el mismo formato (id, nombre científico,
  nombre común, familia, `regions` con los ids de `data/regions.ts`, descripción y rareza).
- El emparejamiento con PlantNet se hace por nombre científico (género + especie), así que
  usa el nombre binomial exacto que PlantNet suele devolver.
- Fuentes recomendadas para ampliar con datos reales: [GBIF](https://www.gbif.org/),
  [Flora Ibérica](http://www.floraiberica.es/), o los inventarios de flora de cada comunidad
  autónoma.

## Notas y limitaciones conocidas

- La detección de comunidad autónoma usa el reverse-geocoding nativo del dispositivo
  (`expo-location`); su precisión depende del proveedor de mapas del sistema operativo.
- El proyecto PlantNet usado es `weurope` (Europa occidental); para flora canaria muy
  específica la precisión puede ser menor — se podría cambiar el proyecto o usar reglas
  específicas para Canarias en `lib/plantnet.ts`.
- La API gratuita de PlantNet tiene un límite diario de identificaciones por API key.
