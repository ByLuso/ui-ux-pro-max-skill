# 🚀 Mis Apps — Hub

Una "app de apps": todas las aplicaciones creadas en las ramas de este repo, reunidas aquí como carpetas y mostradas juntas en un único hub.

## Arrancar el hub

```bash
cd apps
python3 launch.py
```

Esto sirve la carpeta en `http://localhost:8000` y abre el hub. Desde ahí:

- Las apps **web** (🌐) se abren con el botón **Abrir**.
- Las apps **móvil / SPA / backend / infra** muestran su comando de arranque.

Otros comandos:

```bash
python3 launch.py list          # lista todas las apps
python3 launch.py run <slug>    # ejecuta el arranque de una app no-web
python3 launch.py --port 9000   # otro puerto
```

> También puedes abrir `apps/index.html` directamente en el navegador (los datos van embebidos), aunque algunos enlaces de apps con rutas relativas funcionan mejor servidos con `launch.py`.

## Apps incluidas

| App | Tipo | Carpeta |
|-----|------|---------|
| 🖨️ Dashboard Impresión 3D | Web | `dashboard-3d/` |
| 🦖 Mapa de Zonas Fósiles | Web + Python | `dinosaurios-fosiles/` |
| 💉 Servicios de Enfermería | Web | `enfermeria/` |
| 🐜 Vuelos Nupciales (Calendario) | Web | `hormigas-calendario/` |
| 🐜 Vuelos Nupciales (Logroño) | Web | `hormigas-logrono/` |
| 💪 Muscle Tracker | Web | `muscle-tracker/` |
| ☀️ Observatorio Solar | Web | `observatorio-solar/` |
| 🎣 Pesca en La Rioja | Web | `pesca-rioja/` |
| 📈 Trading Bot IA | Web + Python | `trading-bot-ia/` |
| 🧭 VoyageAI — Itinerarios | Web | `viajes-voyageai/` |
| 🌑 UmbraFinder (Eclipses) | SPA (Vite) | `umbrafinder-eclipses/` |
| 🌱 Identificador de Plantas | Móvil (Expo) | `plantas-espana/` |
| 📚 Conversor PDF·EPUB·Kindle | Backend (Python) + móvil | `conversor-ebooks/` |
| 🪙 Monitor de Coste Claude | Infra (Docker) | `monitor-coste-claude/` |

## Añadir una app nueva

Cada app vive en su subcarpeta. Para que aparezca en el hub, añádela en **dos sitios** (mantienen el mismo formato):

1. `apps/apps.json` — usado por `launch.py`.
2. El array `APPS` dentro de `apps/index.html` — usado por el hub (datos embebidos).

Campos: `slug`, `name`, `emoji`, `desc`, `type` (`static`|`spa`|`native`|`backend`|`infra`), `entry` (HTML de entrada para las web), `run` (comando de arranque), `tags`.
