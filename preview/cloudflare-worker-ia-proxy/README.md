# Proxy de IA para Taller 3D (Cloudflare Worker)

Reenvía las peticiones del dashboard `dashboard-impresion-3d.jsx` /
`dashboard-impresion-3d.html` a `https://api.anthropic.com/v1/messages`
guardando tu API key en el servidor, para que la ficha técnica y el chat
de edición 3D funcionen fuera de la vista previa de artefactos de Claude
(por ejemplo, abriendo el dashboard desde Termux o cualquier navegador).

## Requisitos

- Una cuenta gratuita de [Cloudflare](https://dash.cloudflare.com/sign-up).
- Una API key de Anthropic (https://console.anthropic.com/settings/keys).
- Node.js (para usar `npx wrangler`).

## Desplegar

```bash
cd preview/cloudflare-worker-ia-proxy

# 1. Inicia sesión con tu cuenta de Cloudflare (abre el navegador)
npx wrangler login

# 2. Guarda tu API key como secreto (no queda en el código ni en git)
npx wrangler secret put ANTHROPIC_API_KEY
# → pega la API key cuando te la pida y presiona Enter

# 3. Despliega el Worker
npx wrangler deploy
```

Al terminar, `wrangler` imprime una URL como:

```
https://taller3d-ia-proxy.<tu-subdominio>.workers.dev
```

## Conectarlo al dashboard

1. Abre el dashboard en el navegador.
2. Pulsa el icono de engranaje (⚙) en la cabecera → "Configuración de IA".
3. Pega ahí la URL del Worker y guarda.

A partir de ese momento, tanto "Generar ficha técnica" como el chat
"Modificar con IA" del visor 3D usarán ese proxy en vez de llamar
directamente a `api.anthropic.com`.

## Notas

- El Worker no valida el origen de las peticiones (`Access-Control-Allow-Origin: *`)
  para simplificar el despliegue; si lo vas a usar en producción con tráfico
  público, considera restringirlo a tu dominio.
- El plan gratuito de Cloudflare Workers incluye 100.000 peticiones/día, de
  sobra para uso personal.
