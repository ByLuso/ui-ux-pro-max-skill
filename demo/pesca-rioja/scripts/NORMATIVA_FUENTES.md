# Fuentes de la normativa usada en `build-geo-data.py`

Este documento registra de dónde sale cada dato de regulación usado para
clasificar los tramos, para que sea auditable y no se confunda con la
normativa oficial vigente (que hay que consultar siempre antes de salir a
pescar).

## Fuentes consultadas

1. **Orden AGM/6/2026, de 19 de febrero** (períodos hábiles de pesca 2026,
   BOR) — vía resumen de iberley.es. De aquí sale la fecha general de
   temporada 2026 (29 marzo–31 agosto) y la confirmación de que existen
   vedados en el Oja (nacimiento–Puente Canillas), Tirón
   (Herramélluri–Ochánduri), Portilla y Urbión.
2. **"La pesca en La Rioja 2025"** — folleto-resumen oficial (Orden
   AGM/10/2025, de 24 de enero, BOR 28/01/2025), PDF de 2 páginas obtenido
   públicamente vía enlace de Google Drive embebido en
   myfishingmaps.com/normativa-de-pesca/normativa-de-pesca-de-la-rioja/.
   De aquí sale casi todo el detalle usado: clasificación de aguas
   trucheras/ciprinícolas por río, la sección "ZONIFICACIÓN PISCÍCOLA"
   (tramos sin muerte con sus límites y periodo hábil), la tabla de "COTOS
   TRUCHEROS" e "INTENSIVOS" (límites, talla, cupo, cebos, días hábiles),
   y los datos de embalses (Mansilla, Piarrejas, González-Lacasa, Enciso,
   La Grajera, Anguciana, Arnedo).

## Limitaciones conocidas — léelas antes de confiar en un tramo

- **El folleto detallado es de la temporada 2025**, no 2026. La estructura
  (qué río es truchero, dónde están los cotos, sus límites) cambia poco de
  un año a otro, pero fechas exactas y algún cupo puntual pueden variar en
  2026. Se ha usado la fecha general 2026 (29 marzo–31 agosto) donde no
  hay dato específico por tramo, pero las fechas citadas dentro de cada
  tramo con nombre son las que aparecían en el folleto 2025.
- **Los vedados rotan cada año por designación oficial** (el propio
  folleto lo dice explícitamente: "en el Tirón rotan los vedados
  alternativos... en el Najerilla se vedan Valvanera y Brieva [este año]").
  El único vedado que se muestra en la app (Tirón, Herramélluri–Ochánduri)
  es el que aparecía vigente en la fuente consultada — puede no ser el
  vedado real de 2026. Antes de dar por vedada o libre una zona, consulta
  el mapa oficial en IDERioja.
- **Los límites de cada tramo son aproximados.** El folleto describe los
  límites por accidentes geográficos concretos ("puente de Arrauri",
  "presa de Mahave", etc.) que no siempre tienen coordenadas públicas; el
  script los ancla al pueblo/localidad conocida más cercana y usa el
  segmento de río real más próximo a ese punto, no la coordenada legal
  exacta.
- **Alhama, Linares y Jubera** no aparecen en ninguna parte del folleto
  como aguas trucheras gestionadas, cotos o vedados — se han marcado como
  "sin coto ni vedado designado" en vez de inventar una clasificación. Es
  posible que exista alguna gestión puntual no reflejada aquí.
- **Cornago y Yalde** (embalses) no tenían datos específicos confirmados en
  las fuentes consultadas — se marcan explícitamente como "sin dato
  confirmado" en vez de mostrar cifras inventadas con apariencia de reales.
- Los ~180 tramos "libre" que no tienen nombre propio en el folleto no son
  fabricados con un patrón aleatorio (como en la versión anterior de esta
  demo) — usan las reglas GENERALES verificadas para su tipo de agua
  (truchera: 23 cm / 3 truchas/día; ciprinícola: 35 cm barbo / 2, 25 cm
  anguila / 5), que es la categoría residual correcta según la Orden
  cuando no hay coto/vedado/sin-muerte específico.

**En resumen:** esto ya no es un patrón inventado sin relación con la
normativa real, pero tampoco es una réplica exacta y verificada campo a
campo del Anexo I oficial de 2026. Sigue siendo una demo — antes de una
salida de pesca real, confirma siempre en la Orden vigente y el mapa de
IDERioja.
