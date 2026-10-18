# Saldo · versión web para iPhone

La misma app que `apps/saldo-android`, como web app para iPhone (y cualquier navegador).

- **Publicada en:** https://claude.ai/artifact/Ko5CiZKG62q9FW1ZG7Yehy (privada, solo para su propietario).
- **Instalar en iPhone:** abre el enlace en Safari → Compartir → *Añadir a pantalla de inicio*.

## Qué incluye

Inicio, Historial, Gráficas, Asesor (rueda doble, puntuación, vivienda, coche, consejos con
buscador) y Ajustes, con el mismo diseño minimalista y tranquilo que la app Android, en modo
claro u oscuro según el sistema y con la tipografía del propio dispositivo.
Los movimientos se añaden **importando el extracto PDF** del banco o a mano: en iOS ninguna
app puede leer las notificaciones de otras apps.

El lector de extractos, el asesor y los consejos son una traducción a JavaScript de
`StatementParser.kt`, `FinanceAdvisor.kt` y `Tips.kt`; si cambias la lógica en Android,
cámbiala también aquí.

## Datos

Se guardan en la zona privada del usuario de la base de datos del artifact
(`data/users/<id>/`, un documento por mes y otro de ajustes): solo esa persona puede verlos.
Fuera de Claude o sin sesión, se guardan en el `localStorage` del navegador.
Ajustes → Copia de seguridad exporta e importa un JSON.

## Publicar

`index.html` se publica como artifact junto con `pdf.worker.min.js` de PDF.js 3.11.174
(no está en el repositorio; descárgalo de
`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`).
Capacidades: `db`, `user`, `downloads`.
