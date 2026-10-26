#!/usr/bin/env python3
"""Generate 10 hiking/natural-park itinerary pages for Spain with embedded Leaflet route maps."""

import os, json

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'itinerarios')

ROUTES = [
  {
    "file": "cares.html",
    "title": "Ruta del Cares",
    "subtitle": "Picos de Europa",
    "region": "Asturias · León",
    "photo": "photo-1506905925346-21bda4d32df4",
    "hero_grad": "linear-gradient(160deg,#030e0a 0%,#083020 40%,#0d4a30 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#051a10","#0a2a18","#062010"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "12 km A/R", "desnivel": "+200 m", "dificultad": "Fácil–Media", "tiempo": "4–5 h",
    "mejor_epoca": "May–Oct",
    "tipo": "senderismo",
    "desc_hero": "La garganta más espectacular de España entre paredes de 500 metros.",
    "map_center": [43.2065, -4.8896], "map_zoom": 13,
    "route": [[43.252,-4.901],[43.245,-4.897],[43.238,-4.892],[43.230,-4.888],[43.222,-4.885],[43.214,-4.883],[43.207,-4.882],[43.199,-4.881],[43.192,-4.879],[43.185,-4.878],[43.178,-4.878],[43.170,-4.878],[43.161,-4.878]],
    "waypoints": [
      {"latlng":[43.252,-4.901],"label":"Inicio: Poncebos (84m)"},
      {"latlng":[43.230,-4.888],"label":"Mirador del Tombo"},
      {"latlng":[43.207,-4.882],"label":"Punto medio del desfiladero"},
      {"latlng":[43.185,-4.878],"label":"Collado Jermoso (desvío)"},
      {"latlng":[43.161,-4.878],"label":"Final: Caín (470m)"},
    ],
    "secciones": [
      ("Poncebos → km 3","La senda arranca junto al río Cares con paredes que ya rozan los 200m. El camino está tallado en la roca viva. Puente colgante en el primer kilómetro. Vista del pico Cotalba."),
      ("km 3 → km 6 (Mirador del Tombo)","Las paredes alcanzan los 500m de altura. El río discurre 200m por debajo en algunos puntos. El sendero tiene una acanaleta labrada en la roca y mini túneles perforados. El silencio solo lo rompe el agua."),
      ("km 6 → km 9","El desfiladero se abre ligeramente. Se ven las aldeas rupestres de Cordiñanes y Posada desde la senda. El color esmeralda del Cares contrasta con la roca caliza gris."),
      ("km 9 → Caín","Descenso gradual hacia el pueblo de Caín (48 habitantes). La ruta termina en un pequeño bar donde la tortilla de patatas y la sidra saben diferente tras 12 km entre paredes de piedra."),
    ],
    "llevar": ["Agua (mínimo 2L, no hay fuentes en la ruta)","Calzado de trekking (suelo irregular y húmedo)","Impermeable ligero","Protector solar (sol de alta montaña)","Snacks energéticos","Linterna si entras en los mini túneles"],
    "gastro": [("Sidra asturiana","La sidra natural asturiana se escancia desde altura para oxigenarla. En los bares de Caín y Poncebos la sirven como los dioses mandan."),("Cachopo","Filete empanado relleno de jamón serrano y queso fundido. El plato de festa asturiana por excelencia. Contundente y delicioso."),("Fabes con Almejas","Alubias blancas grandes cocinadas con almejas gallegas. Plato de cuchara del norte, ideal para recuperar tras el trekking."),("Queso de Cabrales","Queso azul de leche cruda madurado en cuevas húmedas de la zona. DOP Cabrales, producido a menos de 10km de la ruta.")],
    "emergencias": [("Emergencias","112","Número único España"),("Guardia Civil","062","Rescate montaña Picos de Europa"),("GREIM Cangas de Onís","+34 985 848 200","Grupo Rescate en Montaña"),("Hospital Cangas de Onís","+34 985 848 100","10 km al norte")],
    "consejos": ["Ir de semana (lunes–jueves) para evitar aglomeraciones. En agosto hay literalmente colas en el camino.","La ruta NO es circular. Se va y vuelve por el mismo camino o se organiza un segundo coche en Caín.","El primer y último kilómetro son los más expuestos al sol. Salir antes de las 9h en verano.","El camino está siempre húmedo por la sombra y la humedad del río. Cuidado con el musgo en las piedras."],
    "tags": "cares picos europa garganta asturias leonTrekking ruta desfiladero cañón",
  },
  {
    "file": "mulhacen.html",
    "title": "Ascensión al Mulhacén",
    "subtitle": "Sierra Nevada — 3.479 m",
    "region": "Granada · Andalucía",
    "photo": "photo-1501854140801-50d01698950b",
    "hero_grad": "linear-gradient(160deg,#100508 0%,#2a0e14 40%,#3d1520 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#1a0508","#2a0a12","#150310"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "22 km ida/vuelta", "desnivel": "+1.500 m", "dificultad": "Difícil", "tiempo": "8–10 h",
    "mejor_epoca": "Jul–Sep",
    "tipo": "senderismo",
    "desc_hero": "El pico más alto de la Península Ibérica. El techo de España a 3.479 metros.",
    "map_center": [37.0531, -3.3319], "map_zoom": 13,
    "route": [[37.058,-3.351],[37.056,-3.345],[37.055,-3.338],[37.054,-3.330],[37.053,-3.322],[37.053,-3.315],[37.054,-3.312]],
    "waypoints": [
      {"latlng":[37.058,-3.351],"label":"Hoya del Portillo (2.510m) — parking"},
      {"latlng":[37.055,-3.338],"label":"Laguna de la Mosca (2.870m)"},
      {"latlng":[37.054,-3.325],"label":"Collado del Mulhacén (3.290m)"},
      {"latlng":[37.054,-3.312],"label":"Cima Mulhacén (3.479m)"},
    ],
    "secciones": [
      ("Hoya del Portillo → Laguna de la Mosca (3 km)","Salida del parking a 2.510m. Terreno de alta montaña desde el primer paso: pedrera, gramíneas alpinas y vistas al mar Mediterráneo en días claros. La Laguna de la Mosca es la primera parada, un lago glaciar rodeado de pircas."),
      ("Laguna de la Mosca → Collado (5 km)","El tramo más exigente. El terreno se vuelve pedregoso y el desnivel se intensifica. A 3.000m ya se nota la falta de oxígeno. Las crestas de la cordillera aparecen a la derecha — en julio persiste nieve en las umbrías."),
      ("Collado → Cima (2 km)","Último kilómetro: cresta expuesta al viento. Las vistas desde el collado ya son de vértigo — el Mar Mediterráneo al sur, el desierto de Almería al sureste, Sierra Morena al norte. La cima tiene una piedra circular y un hito cairn."),
      ("Cima → Hoya del Portillo (regreso)","El descenso es más rápido (3–4h) pero más duro para las rodillas. Cuidado con la pedrera suelta. Si hay niebla, seguir exactamente el GPS."),
    ],
    "llevar": ["GPS o mapa descargado offline (sin cobertura en cima)","Ropa de abrigo aunque haga calor abajo (en cima puede hacer -5°C en julio)","Bastones de trekking (rodillas en descenso)","Crampones en mayo–junio (nieve persistente)","Mínimo 3L de agua","Protector solar 50+ (radiación a 3.500m es extrema)"],
    "gastro": [("Remojón granadino","Ensalada de naranja, bacalao, cebolleta y aceitunas negras. El aperitivo más refrescante de Granada antes de la subida."),("Plato alpujarreño","Huevos fritos, patatas, morcilla, chorizo y jamón de Trevélez. Contundente y necesario después de 1.500m de desnivel."),("Jamón de Trevélez","El jamón más alto del mundo (pueblo a 1.476m). IGP Jamón de Trevélez, 30 meses de curación con el aire de Sierra Nevada."),("Pionono","El dulce de Santa Fe (pueblo natal de Cristóbal Colón): bizcocho enrollado con crema tostada. Pequeño, dulce, perfecto.")],
    "emergencias": [("Emergencias","112","Número único España"),("GREIM Granada","+34 958 280 400","Grupo Rescate Especializado en Montaña"),("Parque Nacional Sierra Nevada","+34 958 026 300","Información y permisos"),("Hospital Baza","+34 958 700 100","Hospital más próximo por el norte")],
    "consejos": ["En julio y agosto hay BUS OFICIAL desde Granada a Hoya del Portillo. Plazas limitadas — reservar en la web del Parque Nacional.","Aclimatarse el día anterior pernoctando en Capileira (1.436m) o haciendo la ruta sin llegar a cima.","El cielo nocturno desde la cima es de los más estrellados de Europa — hay telescopios del IAA (Instituto Astrofísico de Andalucía) visibles.","Llevar dinero en efectivo para los bares de Trevélez."],
    "tags": "mulhacen sierra nevada granada cima 3479m pico alto iberia senderismo montaña",
  },
  {
    "file": "aiguestortes.html",
    "title": "Travesía Aigüestortes",
    "subtitle": "Pirineos Catalanes — Espot a Boí",
    "region": "Lleida · Cataluña",
    "photo": "photo-1464822759023-fed622ff2c3b",
    "hero_grad": "linear-gradient(160deg,#050d1a 0%,#0d1e3a 40%,#1a2e5a 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#050d1a","#0a1828","#060e20"),
    "dias": "2 días",
    "precio": "€30–50",
    "distancia": "22 km (travesía)", "desnivel": "+1.100 m / -1.300 m", "dificultad": "Moderada–Difícil", "tiempo": "2 días",
    "mejor_epoca": "Jul–Sep",
    "tipo": "senderismo",
    "desc_hero": "El único parque nacional de montaña de Cataluña. Lagos de montaña, pinos negros y crestas pirenaicas.",
    "map_center": [42.530, 0.985], "map_zoom": 12,
    "route": [[42.575,1.093],[42.556,1.055],[42.543,1.038],[42.530,1.015],[42.520,0.998],[42.510,0.975],[42.499,0.938],[42.499,0.910],[42.499,0.890]],
    "waypoints": [
      {"latlng":[42.575,1.093],"label":"Espot (1.320m) — Inicio"},
      {"latlng":[42.556,1.055],"label":"Estany de Sant Maurici (1.910m)"},
      {"latlng":[42.530,1.015],"label":"Collado de Contraix (2.742m)"},
      {"latlng":[42.510,0.975],"label":"Estany Llong (2.000m) — refugio"},
      {"latlng":[42.499,0.890],"label":"Boí (1.250m) — Final"},
    ],
    "secciones": [
      ("Día 1: Espot → Refugio Estany Llong (11 km)","Taxi 4x4 desde Espot hasta el Estany de Sant Maurici (obligatorio en verano). El lago color turquesa con los Encantats (2.747m) al fondo es uno de los paisajes más fotografiados de los Pirineos. Subida al Collado de Contraix con vistas a Francia. Descenso al Estany Llong y pernocta en el Refugio Amitges o Ernest Mallafré (reservar con meses de antelación)."),
      ("Día 2: Refugio → Boí (11 km)","Madrugada en el refugio con cielo estrellado increíble. Descenso por el valle de Sant Nicolau entre bosques de abeto y prados alpinos. Los Aigüestortes son literalmente 'aguas torcidas' — el río forma meandros y humedales naturales únicos en los Pirineos. Llegada a Boí, donde las iglesias románicas del siglo XI son Patrimonio UNESCO."),
    ],
    "llevar": ["Reserva de refugio (obligatoria en julio/agosto, se agotan en horas)","Saco de dormir ligero","Ropa polar (noches a 0–5°C incluso en agosto)","Filtro de agua o pastillas (hay fuentes en la ruta)","Permiso de acceso (gratuito pero obligatorio en temporada)","Mapa topográfico 1:25.000 del parque"],
    "gastro": [("Escudella i carn d'olla","Potaje catalán de invierno con pasta, garbanzos y carne. En los refugios de montaña se sirve como primer plato contundente."),("Pa amb tomàquet","El desayuno catalán: pan tostado frotado con tomate maduro y regado con aceite de oliva. Humilde y perfecto."),("Botifarra amb mongetes","Salchicha catalana a la brasa con judías blancas. El plato más sencillo y sabroso del país. En los restaurantes de Boí es el plato estrella."),("Crema catalana","La versión catalana de la crème brûlée: crema con cáscara de limón y canela, con una capa de azúcar quemado crujiente. Postre nacional de Cataluña.")],
    "emergencias": [("Emergencias","112","Número único"),("Parque Nacional Aigüestortes","+34 973 696 189","Centro de información"),("Guardia Civil Montaña","+34 973 640 010","Estación Espot"),("Hospital Tremp","+34 973 651 000","Hospital comarcal más cercano")],
    "consejos": ["Reservar el refugio con 3–4 meses de antelación en julio y agosto. Sin reserva, sin cama.","El taxi 4x4 hasta Sant Maurici es obligatorio en temporada (prohibidos los coches privados). Coste ~€8 ida.","Los lunes hay menos gente. Si puedes, haz la travesía de martes a miércoles.","Llevar suficiente ropa de abrigo — las noches en el refugio a 2.000m son frías incluso en agosto."],
    "tags": "aiguestortes pirineos catalanes espot boi lagos montaña refugio travesia cataluña",
  },
  {
    "file": "tramuntana.html",
    "title": "GR-221 Serra de Tramuntana",
    "subtitle": "Mallorca — de Port d'Andratx a Valldemossa",
    "region": "Mallorca · Islas Baleares",
    "photo": "photo-1552083375-1447ce886485",
    "hero_grad": "linear-gradient(160deg,#050d1a 0%,#0d1e3a 40%,#1a3055 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#050d18","#0a1830","#061020"),
    "dias": "2 días",
    "precio": "€20–40",
    "distancia": "35 km (2 etapas)", "desnivel": "+1.400 m / -1.400 m", "dificultad": "Moderada", "tiempo": "2 días",
    "mejor_epoca": "Mar–May · Sep–Nov",
    "tipo": "senderismo",
    "desc_hero": "La Ruta de Piedra en Seco. Patrimonio UNESCO que atraviesa la sierra más bella del Mediterráneo.",
    "map_center": [39.630, 2.470], "map_zoom": 11,
    "route": [[39.543,2.387],[39.560,2.402],[39.580,2.421],[39.600,2.441],[39.620,2.460],[39.640,2.482],[39.660,2.508],[39.682,2.534],[39.707,2.563]],
    "waypoints": [
      {"latlng":[39.543,2.387],"label":"Port d'Andratx (0m)"},
      {"latlng":[39.590,2.432],"label":"Es Grau — coll paso"},
      {"latlng":[39.636,2.484],"label":"Estellencs (150m) — pernocta"},
      {"latlng":[39.660,2.508],"label":"Banyalbufar (100m)"},
      {"latlng":[39.707,2.563],"label":"Valldemossa (400m)"},
    ],
    "secciones": [
      ("Día 1: Port d'Andratx → Estellencs (18 km)","Las paredes de piedra en seco que dan nombre a la ruta (Dry Stone Route) aparecen desde el primer kilómetro. Construidas por esclavos y campesinos durante siglos para contener las terrazas agrícolas. El sendero sube y baja por crestas con vistas al mar Mediterráneo. Estellencs (500 habitantes) tiene dos bares y un alojamiento rural donde recuperarse."),
      ("Día 2: Estellencs → Valldemossa (17 km)","Banyalbufar — el pueblo de bancales más espectacular de España — marca el ecuador del día. Las terrazas descienden en cascada hasta el mar. Valldemossa es el destino final: el monasterio donde Chopin y George Sand pasaron el invierno de 1838–39 es hoy uno de los lugares más visitados de Mallorca."),
    ],
    "llevar": ["Bastones de trekking (mucho terreno irregular de piedra seca)","Protector solar alto (sol mediterráneo intenso en las crestas)","Agua mínimo 2L (pocas fuentes entre Estellencs y Banyalbufar)","Reserva de alojamiento en Estellencs (Casa de Huéspedes Can Pau, plazas limitadas)","Botiquín básico","Cámara — el paisaje lo requiere"],
    "gastro": [("Pa amb oli","El bocadillo balear: pan moreno con aceite de oliva mallorquín, tomate y sal. Con sobrasada o queso mahonés se convierte en el desayuno de los dioses mediterráneos."),("Tumbet","Lasaña mallorquina vegetariana: capas de berenjenas, pimientos, patatas y salsa de tomate. Plato de temporada cuando las verduras están en su punto."),("Ensaimada","El dulce icónico de Mallorca: espiral de masa hojaldrada con manteca de cerdo. La versión con sobrasada o cabello de ángel es la más local."),("Hierbas mallorquinas","Licor artesanal elaborado con más de 30 plantas aromáticas de la sierra. Se bebe frío después de comer. El digestivo más fragante del Mediterráneo.")],
    "emergencias": [("Emergencias","112",""),("Consell de Mallorca (GR-221)","+34 971 219 111","Info ruta y alojamientos"),("Guardia Civil Andratx","+34 971 136 008",""),("Hospital Son Espases","+34 871 205 000","Palma, 40 km")],
    "consejos": ["Evitar junio, julio y agosto por el calor extremo (35–40°C en las crestas con poco sombra).","La ruta completa son 8 etapas — esta selección es el tramo más espectacular.","Comprar agua en los pueblos — en verano las fuentes están secas.","El alojamiento en Estellencs es muy limitado. Reservar con semanas de antelación."],
    "tags": "tramuntana mallorca GR221 senderismo piedra seca mediterráneo Valldemossa baleares",
  },
  {
    "file": "volcanes-lapalma.html",
    "title": "Ruta de los Volcanes",
    "subtitle": "La Palma — de El Paso a Fuencaliente",
    "region": "La Palma · Canarias",
    "photo": "photo-1513197278454-a5f3ceb56f66",
    "hero_grad": "linear-gradient(160deg,#100505 0%,#2a0808 40%,#400d10 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#180505","#280808","#150306"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "28 km", "desnivel": "+500 m / -1.800 m", "dificultad": "Moderada", "tiempo": "8–10 h",
    "mejor_epoca": "Oct–May",
    "tipo": "senderismo",
    "desc_hero": "Por la espina dorsal volcánica de la isla más verde de Canarias. Lava negra, pinos canarios y el océano.",
    "map_center": [28.565, -17.860], "map_zoom": 12,
    "route": [[28.626,-17.869],[28.610,-17.868],[28.595,-17.866],[28.580,-17.864],[28.562,-17.858],[28.545,-17.853],[28.527,-17.847],[28.510,-17.843],[28.495,-17.840],[28.483,-17.836]],
    "waypoints": [
      {"latlng":[28.626,-17.869],"label":"El Paso (700m) — inicio bus"},
      {"latlng":[28.595,-17.866],"label":"Volcán San Juan (1.840m)"},
      {"latlng":[28.562,-17.858],"label":"Refugio El Pilar (1.445m)"},
      {"latlng":[28.527,-17.847],"label":"Volcán Teneguía (439m)"},
      {"latlng":[28.483,-17.836],"label":"Fuencaliente (160m) — final"},
    ],
    "secciones": [
      ("El Paso → Volcán San Juan (8 km)","Bus desde Santa Cruz de La Palma a El Paso. El ascenso inicial por el dorso volcánico revela los colores anaranjados y negros de las lavas más recientes. El Volcán San Juan erupcionó en 1949 — sus coladas de lava solidificada crean un paisaje de otro planeta."),
      ("Volcán San Juan → Refugio El Pilar (6 km)","Senda por la cresta con vistas simultáneas al Atlántico Este y Oeste — la isla tiene apenas 28km de ancho. Los pinos canarios crecen literalmente desde la lava negra con sus largas acículas recogiendo la humedad de las nubes. El Refugio El Pilar es ideal para el almuerzo."),
      ("Refugio → Volcán Teneguía (9 km)","El tramo más histórico: el Teneguía erupcionó en 1971 y es el volcán más reciente de La Palma. Se puede caminar sobre la lava de hace 50 años que aún desprende calor en algunos puntos. El paisaje de lapilli negro con el mar azul al fondo es extraterrestre."),
      ("Teneguía → Fuencaliente (5 km)","Descenso final hasta el faro de Fuencaliente y las salinas donde se extrae la sal volcánica más cara de España (€15/100g). Las bodegas de la zona producen el vino malvasía volcánico más interesante de Canarias."),
    ],
    "llevar": ["Calzado con suela gruesa (la lava corta el calzado fino)","Mínimo 3L de agua (no hay fuentes en la mayor parte del recorrido)","Protector solar 50+ (sin sombra en las crestas volcánicas)","Bastones (la lava es irregular)","GPS descargado (el terreno es confuso en los campos de lava)","Ropa de capas (en la cresta puede hacer frío y viento)"],
    "gastro": [("Papas arrugadas con mojo","Las papas canarias pequeñas cocidas con sal gruesa hasta que la piel se arruga. Con mojo rojo (pimentón, comino, ajo) o mojo verde (cilantro, perejil). Imposible comerlas solo una vez."),("Queso de La Palma","Queso de cabra palmero ahumado con piel negra. Sabor único por el tipo de pasto volcánico. DOP Queso Palmero."),("Vino malvasía volcánico","Los viñedos crecen en hoyos excavados en la lava negra para retener la humedad. Bodega Carballo hace el mejor malvasía dulce de Canarias."),("Bienmesabe","Crema de almendras, miel de palma y huevo. El postre más palmeño, originario de la repostería árabe medieval.")],
    "emergencias": [("Emergencias","112",""),("Parque Nacional Caldera de Taburiente","+34 922 497 277",""),("Guardia Civil Santa Cruz de La Palma","+34 922 411 050",""),("Hospital Nuestra Señora de Los Reyes","+34 822 481 400","Santa Cruz de La Palma")],
    "consejos": ["Organizar transporte de regreso desde Fuencaliente antes de salir — los buses son escasos.","La ruta puede ser impredicatible en febrero–marzo cuando hay nieve en la cresta (raro pero posible).","Llevar siempre la aplicación del Cabildo Insular de La Palma con las rutas descargadas.","Las salinas de Fuencaliente cierran al público en temporada baja — verificar horarios."],
    "tags": "volcanes la palma canarias ruta senderismo teneguía fuencaliente lava caldera",
  },
  {
    "file": "garajonay.html",
    "title": "Travesía del Garajonay",
    "subtitle": "La Gomera — Bosque Laurisilva UNESCO",
    "region": "La Gomera · Canarias",
    "photo": "photo-1518889735218-3f39acfaab16",
    "hero_grad": "linear-gradient(160deg,#050f08 0%,#0a2010 40%,#103018 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#051008","#0a2012","#061010"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "15 km circular", "desnivel": "+600 m", "dificultad": "Moderada", "tiempo": "5–6 h",
    "mejor_epoca": "Todo el año",
    "tipo": "senderismo",
    "desc_hero": "El bosque de laurisilva más intacto del mundo. Un bosque de la Era Terciaria que sobrevivió a las glaciaciones.",
    "map_center": [28.113, -17.248], "map_zoom": 13,
    "route": [[28.118,-17.278],[28.115,-17.270],[28.112,-17.260],[28.109,-17.248],[28.108,-17.238],[28.110,-17.228],[28.113,-17.222],[28.118,-17.218],[28.120,-17.228],[28.120,-17.240],[28.118,-17.255],[28.118,-17.268],[28.118,-17.278]],
    "waypoints": [
      {"latlng":[28.118,-17.278],"label":"Las Hayas — inicio circular"},
      {"latlng":[28.109,-17.248],"label":"Alto de Garajonay (1.487m) — punto más alto"},
      {"latlng":[28.113,-17.222],"label":"La Loma de Tagalguén"},
      {"latlng":[28.120,-17.240],"label":"El Cedro — zona de helechos gigantes"},
    ],
    "secciones": [
      ("Las Hayas → Alto de Garajonay (5 km)","El bosque de laurisilva — laurel, til, viñátigo, brezo árbol — crea una atmósfera de película de fantasía: musgos que cuelgan de cada rama, helechos de 3 metros, neblina persistente. El Alto de Garajonay (1.487m) es el punto más alto de La Gomera, con vistas a Tenerife (el Teide), La Palma y El Hierro simultáneamente cuando el tiempo acompaña."),
      ("Alto → La Loma de Tagalguén (4 km)","La cresta norte del parque tiene menos vegetación y más viento. Las vistas hacia el mar del norte son de acantilados verticales. El contraste entre la exuberancia vegetal del interior y la dureza del litoral norte es uno de los paisajes más sorprendentes de Canarias."),
      ("Tagalguén → El Cedro → Las Hayas (6 km)","El barranco de El Cedro es el corazón húmedo del parque: helechos gigantes (Woodwardia radicans) de 3 metros, un riachuelo permanente, musgos fluorescentes. Se puede hacer un desvío al ermita de Nuestra Señora de Lourdes, rodeada de laurisilva. Regreso a Las Hayas por pista forestal."),
    ],
    "llevar": ["Impermeable (el bosque siempre está húmedo por la niebla)","Calzado impermeable (el suelo está mojado todo el año)","Capas de ropa (temperatura variable entre 15–22°C)","GPS (el bosque es denso y los senderos se cruzan)","Agua 1.5L (hay fuentes en El Cedro)","Prismáticos (para ver aves endémicas: paloma turqué, paloma rabiche)"],
    "gastro": [("Potaje de berros gomero","Potaje espeso de berros silvestres con alubias y papas. El plato de cuchara más típico de La Gomera, cocinado lentamente."),("Almogrote","Pasta de queso curado rallado con tomate, ajo, pimiento y aceite. El aperitivo más gomero, para untar en pan o papas."),("Gofio escaldado","Harina tostada de cereales mezclada con caldo de pescado hasta formar una pasta cremosa. Antiquísima y nutritiva."),("Miel de palma","Jarabe oscuro y dulce producido de la savia del palmito canario. Sabor a caramelo con notas herbáceas. Se compra directamente a los palmeros que lo elaboran artesanalmente.")],
    "emergencias": [("Emergencias","112",""),("Parque Nacional Garajonay","+34 922 800 993","Centro de visitantes"),("Guardia Civil San Sebastián","+34 922 870 150","La Gomera"),("Hospital de La Gomera","+34 922 140 200","San Sebastián de La Gomera")],
    "consejos": ["La laurisilva está declarada Patrimonio Natural de la UNESCO desde 1986. Salir estrictamente de los senderos señalizados está prohibido.","Llevar siempre ropa de abrigo — la neblina hace que la temperatura baje 10°C en minutos.","Las palomas turqué y rabiche son endémicas y vulnerables — hacer silencio para observarlas.","El bosque es espectacularmente diferente con niebla — no necesitas sol para disfrutarlo."],
    "tags": "garajonay la gomera laurisilva bosque primario UNESCO senderismo canarias",
  },
  {
    "file": "grazalema.html",
    "title": "Pinsapar de Grazalema",
    "subtitle": "Sierra de Grazalema — El bosque más húmedo de España",
    "region": "Cádiz · Andalucía",
    "photo": "photo-1583244685026-d8519b5e3d21",
    "hero_grad": "linear-gradient(160deg,#050e08 0%,#0c2010 40%,#163018 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#050e08","#0c2012","#081210"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "12 km circular", "desnivel": "+600 m", "dificultad": "Moderada", "tiempo": "4–5 h",
    "mejor_epoca": "May–Oct",
    "tipo": "senderismo",
    "desc_hero": "El único bosque de pinsapos (abetos españoles) del mundo, reliquias de la Era Terciaria en los Alcornocales andaluces.",
    "map_center": [36.778, -5.440], "map_zoom": 13,
    "route": [[36.759,-5.515],[36.763,-5.505],[36.768,-5.494],[36.775,-5.480],[36.779,-5.465],[36.782,-5.450],[36.781,-5.435],[36.778,-5.423],[36.776,-5.410],[36.775,-5.395],[36.774,-5.380],[36.774,-5.370]],
    "waypoints": [
      {"latlng":[36.759,-5.515],"label":"Benamahoma — inicio (450m)"},
      {"latlng":[36.775,-5.480],"label":"Puerto del Boyar (1.103m)"},
      {"latlng":[36.781,-5.440],"label":"Pinsapar denso (1.200m)"},
      {"latlng":[36.778,-5.410],"label":"El Torreón (1.654m) — desvío opcional"},
      {"latlng":[36.774,-5.370],"label":"Grazalema — final (825m)"},
    ],
    "secciones": [
      ("Benamahoma → Puerto del Boyar (4 km)","Ascenso por el cañón del Bosque desde Benamahoma siguiendo el río El Bosque. El camino sube entre álamos, fresnos y cornijos. En el Puerto del Boyar (1.103m) el paisaje cambia radicalmente: las nieblas del Atlántico, que dan a la sierra la mayor pluviometría de la Península (2.500 mm/año), riegan el pinsapar."),
      ("Pinsapar — el bosque relicto (4 km)","El pinsapo (Abies pinsapo) es un árbol que solo crece en tres sierras de Málaga y Cádiz — uno de los endemismos más amenazados y hermosos de Europa. Los ejemplares centenarios del Pinsapar de Grazalema pueden superar los 25 metros. Caminar entre ellos, con neblina y sin otros senderistas, es una experiencia mística."),
      ("El Torreón → Grazalema (4 km)","Descenso por la ladera sur con vistas al pueblo blanco de Grazalema, uno de los más bonitos de Andalucía. Calles empedradas, casas encaladas, el olor a romero y lavanda. La Plaza de España tiene bares con buena comida serrana a precios honestos."),
    ],
    "llevar": ["Permiso de acceso al Pinsapar (obligatorio, gratuito, limitado a 30 personas/día — reservar en la Junta de Andalucía)","Impermeable ligero (el pinsapar siempre está húmedo)","Calzado de trekking","Agua 2L","Prismáticos para aves rapaces (buitres leonados, águila real)","Ropa de abrigo incluso en verano (la cresta es fría)"],
    "gastro": [("Queso payoyo","El mejor queso de Cádiz: mezcla de leche de cabra payoya y oveja merina grazalemeña. Semicurado, cremoso, con notas herbáceas. DOP en tramitación."),("Tagarnina","Planta silvestre de la sierra (cardillo) rehogada con ajo, huevo y migas de pan. El plato de campo más humilde y sabroso de la sierra."),("Chivo retinto","Cabrito lechal criado en libertad en los pastos de la sierra. Asado en horno de leña o en caldereta. La carne más sabrosa de Andalucía."),("Mosto de Jerez","El vino de Jerez en fermentación que se bebe en los bares serranos en noviembre. Fresco, turbio, con sabor a uva recién pisada.")],
    "emergencias": [("Emergencias","112",""),("Parque Natural Sierra de Grazalema","+34 956 709 733","Centro de información Grazalema"),("Guardia Civil Grazalema","+34 956 132 008",""),("Hospital de Jerez","+34 956 032 000","Hospital más cercano, 60km")],
    "consejos": ["El permiso de acceso al Pinsapar es OBLIGATORIO y se agota. Reservar en la página de la Junta de Andalucía con días de antelación.","Zona de máxima pluviometría de España — llevar siempre impermeable aunque el cielo esté despejado en Grazalema.","La ruta es circular — se puede hacer en ambos sentidos. Recomendamos Benamahoma → Grazalema (terminar en el pueblo es mejor logísticamente).","Los buitres leonados son muy abundantes — mirar hacia las corrientes de aire cálido para verlos planear."],
    "tags": "grazalema pinsapar sierra cádiz bosque relicto senderismo andalucía",
  },
  {
    "file": "penalara.html",
    "title": "Peñalara y la Laguna Grande",
    "subtitle": "Sierra de Guadarrama — La montaña de Madrid",
    "region": "Madrid · Segovia",
    "photo": "photo-1578924825042-c8ad89b8d4b2",
    "hero_grad": "linear-gradient(160deg,#080510 0%,#140e28 40%,#1e1540 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#080510","#140e25","#0a0818"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "10 km ida/vuelta", "desnivel": "+560 m", "dificultad": "Fácil–Moderada", "tiempo": "4–5 h",
    "mejor_epoca": "Jun–Oct",
    "tipo": "senderismo",
    "desc_hero": "El pico más alto de la Sierra de Guadarrama, con la única laguna glaciar de Madrid y vistas a ambas mesetas.",
    "map_center": [40.852, -3.948], "map_zoom": 13,
    "route": [[40.843,-3.957],[40.846,-3.954],[40.849,-3.952],[40.852,-3.950],[40.855,-3.950],[40.857,-3.949],[40.859,-3.948],[40.860,-3.945]],
    "waypoints": [
      {"latlng":[40.843,-3.957],"label":"Puerto de los Cotos (1.830m)"},
      {"latlng":[40.857,-3.949],"label":"Laguna Grande de Peñalara (2.017m)"},
      {"latlng":[40.860,-3.945],"label":"Pico Peñalara (2.428m)"},
    ],
    "secciones": [
      ("Puerto de los Cotos → Laguna Grande (3 km)","El Puerto de los Cotos (1.830m) es el punto de partida habitual: parking y cercanías C-8b desde Madrid en 1h15min. El sendero asciende por hayedos y pinaresde alta montaña. En 45 minutos se alcanza la Laguna Grande de Peñalara (2.017m), el único lago glaciar de la Comunidad de Madrid — de color negro-esmeralda, rodeado de paredes de granito."),
      ("Laguna Grande → Cima Peñalara (2 km)","El tramo más exigente: 400m de desnivel en 2km por bloques de granito. En junio puede haber nieve. La cima de Peñalara (2.428m) tiene un buzón de cumbres con el libro de firmas. En días claros se ve la meseta de Castilla al norte y los picos de Gredos al sur."),
      ("Regreso (5 km)","Misma senda de regreso. En el descenso, la vista del Puerto de Navacerrada y el embalse de Valdesquí es privilegiada. Llegar al aparcamiento de Cotos antes de las 17h para tomar el cercanías de regreso a Madrid."),
    ],
    "llevar": ["Bastones (la pedrera en cima es resbaladiza)","Crampones y piolet en noviembre–mayo (nieve y hielo frecuentes)","Ropa de abrigo (en cima hace 15°C menos que en Madrid)","Agua 2L","Gafas de sol y protector solar (reflejo de nieve/granito)","Tarjeta RENFE (tren desde Atocha, línea C-8b)"],
    "gastro": [("Cocido madrileño","El plato emblema de la meseta: dos vuelcos — sopa de fideos con el caldo y después garbanzos, verduras y carnes. Contundente y nutritivo. Los mejores en La Bola o Taberna Malaspina en Madrid."),("Judiones de La Granja","Alubias gigantes de Segovia cocinadas con morcilla, chorizo y oreja. El plato del invierno serrano por excelencia."),("Ponche segoviano","Bizcocho de almendras y crema de moca recubierto de mazapán tostado. El postre más famoso de Segovia."),("Sobaos de Riofrío","Bizcochos mantequillosos del Real Sitio de Riofrío. El tentempié perfecto para la mochila antes de subir a Peñalara.")],
    "emergencias": [("Emergencias","112",""),("Parque Nacional Sierra de Guadarrama","+34 918 522 613",""),("Guardia Civil Rascafría","+34 918 691 090","8km de Cotos"),("Hospital El Escorial","+34 918 908 500","30km por carretera")],
    "consejos": ["Desde Madrid en cercanías RENFE C-8b hasta Cotos: 1h15min, €7. Una de las pocas montañas de más de 2.000m accesibles en transporte público desde una capital.","En invierno (dic–feb) la zona es estación de esquí nórdico. Verificar condiciones de nieve.","El aparcamiento de Cotos se llena los domingos antes de las 9h. En cercanías no hay ese problema.","La Laguna Grande es zona de reproducción de anfibios protegidos — está prohibido bañarse o pescar."],
    "tags": "peñalara guadarrama laguna glaciar madrid sierra senderismo 2428m granito",
  },
  {
    "file": "cabo-de-gata.html",
    "title": "Camino Natural de Cabo de Gata",
    "subtitle": "Costa volcánica almeriense",
    "region": "Almería · Andalucía",
    "photo": "photo-1558618047-3c8c76ca7d13",
    "hero_grad": "linear-gradient(160deg,#050d1a 0%,#0d1e3a 40%,#153055 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#050d18","#0a1830","#060e20"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "18 km lineal", "desnivel": "+400 m", "dificultad": "Fácil–Moderada", "tiempo": "5–6 h",
    "mejor_epoca": "Mar–Jun · Sep–Nov",
    "tipo": "senderismo",
    "desc_hero": "El único desierto de Europa y las playas más vírgenes del Mediterráneo occidental. Lava, sal y luz.",
    "map_center": [36.820, -2.060], "map_zoom": 12,
    "route": [[36.945,-2.001],[36.920,-2.018],[36.895,-2.030],[36.876,-2.034],[36.860,-2.042],[36.841,-2.048],[36.820,-2.060],[36.800,-2.072],[36.775,-2.090],[36.760,-2.090]],
    "waypoints": [
      {"latlng":[36.945,-2.001],"label":"Agua Amarga — inicio"},
      {"latlng":[36.876,-2.034],"label":"Las Negras — playa negra volcánica"},
      {"latlng":[36.841,-2.048],"label":"La Isleta del Moro — almuerzo"},
      {"latlng":[36.800,-2.072],"label":"Los Escullos — chumberas y tarayes"},
      {"latlng":[36.760,-2.090],"label":"San José — final"},
    ],
    "secciones": [
      ("Agua Amarga → Las Negras (7 km)","Agua Amarga es un pueblo de pescadores de 300 habitantes sin supermercado. El camino sale por el Arrecife de las Sirenas con sus formaciones de lava basáltica. Las Negras debe su nombre a la playa de arena volcánica negra — única en el Mediterráneo español — rodeada de un acantilado de roca oscura."),
      ("Las Negras → La Isleta del Moro (4 km)","El tramo más espectacular: senda sobre acantilados con el Mediterráneo turquesa a los pies. La Isleta del Moro es un pequeño promontorio con un pueblo de pescadores literalmente colgado sobre el mar. El restaurante La Isleta sirve el calamar a la plancha más fresco que se puede comer."),
      ("La Isleta → Los Escullos → San José (7 km)","Descenso a cala de Los Escullos con sus castillo del siglo XVIII. La vegetación cambia: azufaifos, chumberas gigantes, tarayes. San José es el núcleo turístico más importante del parque, con playa, restaurantes y alquiler de kayaks. La mejor ruta de senderismo litoral de España."),
    ],
    "llevar": ["Protector solar 50+ (el sol de Almería es el más intenso de Europa)","Agua mínimo 3L (no hay fuentes en la ruta)","Sombrero o gorra (pocas sombras en el camino)","Calzado de trekking (terreno volcánico irregular)","Bañador y toalla (las playas del camino son para bañarse)","Dinero en efectivo (en Las Negras y La Isleta no hay cajero)"],
    "gastro": [("Pulpo a la plancha","El pulpo del Parque Natural de Cabo de Gata es capturado artesanalmente. A la plancha con aceite y sal es la preparación más honesta. En cualquier chiringuito de la ruta."),("Ajoblanco almeriense","Sopa fría de almendras, ajo, pan y aceite. Más gruesa que el gazpacho, más nutritiva. Se sirve con uvas moscatel de la zona."),("Uvas de Almería","La uva de mesa blanca de Almería (Doña Dolores) es la mejor de España. En verano los agricultores la venden en los pueblos del parque."),("Turrón de Guirlache","Turrón crujiente de almendras tostadas con caramelo y anís. Especialidad de los obradores artesanales de Almería.")],
    "emergencias": [("Emergencias","112",""),("Parque Natural Cabo de Gata","+34 950 160 435",""),("Guardia Civil San José","+34 950 380 043",""),("Hospital Torrecárdenas","+34 950 016 000","Almería capital, 40km")],
    "consejos": ["Julio y agosto: el calor puede superar los 38°C. La ruta en esas fechas hay que hacerla antes de las 10h o después de las 18h.","En Las Negras y La Isleta hay bares con buen pescado — organizar la pausa de almuerzo aquí.","El final en San José permite alquilar kayak para explorar la costa sur del parque (Playa de los Genoveses, Mónsul).","La noche en Cabo de Gata es de las más estrelladas de Europa — poca contaminación lumínica."],
    "tags": "cabo de gata almería costa senderismo mediterráneo parque natural volcánico",
  },
  {
    "file": "medulas.html",
    "title": "Las Médulas y el Valle del Silencio",
    "subtitle": "El Bierzo — La mina de oro más grande de Roma",
    "region": "El Bierzo · León",
    "photo": "photo-1558901357-ca41e027e43a",
    "hero_grad": "linear-gradient(160deg,#140805 0%,#2e1408 40%,#451f0d 70%,rgba(201,169,110,0.15) 100%)",
    "aurora": ("#140805","#2e1408","#180a05"),
    "dias": "1 día",
    "precio": "€0",
    "distancia": "10 km circular", "desnivel": "+350 m", "dificultad": "Fácil", "tiempo": "3–4 h",
    "mejor_epoca": "Sep–Nov · Mar–Jun",
    "tipo": "parque",
    "desc_hero": "Patrimonio Mundial UNESCO. Las galerías de extracción de oro más grandes del Imperio Romano forman hoy un paisaje de película.",
    "map_center": [42.460, -6.766], "map_zoom": 13,
    "route": [[42.454,-6.776],[42.458,-6.770],[42.462,-6.762],[42.467,-6.756],[42.472,-6.750],[42.475,-6.742],[42.472,-6.735],[42.466,-6.740],[42.460,-6.748],[42.455,-6.758],[42.454,-6.768],[42.454,-6.776]],
    "waypoints": [
      {"latlng":[42.454,-6.776],"label":"Las Médulas pueblo (850m) — inicio"},
      {"latlng":[42.462,-6.762],"label":"Mirador de la Orellana"},
      {"latlng":[42.472,-6.750],"label":"Mirador de Orellán (969m) — vistas panorámicas"},
      {"latlng":[42.475,-6.742],"label":"Cueva de la Encantada (tunel romano)"},
      {"latlng":[42.460,-6.748],"label":"Lago del Carucedo"},
    ],
    "secciones": [
      ("Las Médulas → Mirador de Orellán (3 km)","Las Médulas fueron la mina de oro más grande del Imperio Romano — operaron durante 250 años extrayendo 5 millones de kg de oro con el sistema de ruina montium (inundación con agua para colapsar las galerías). Las torres de tierra roja con castaños incrustados que se ven hoy son el resultado de esa ingeniería brutal. El Mirador de Orellán ofrece la vista panorámica más impactante del conjunto."),
      ("Mirador → Cueva de la Encantada (3 km)","La Cueva de la Encantada es una galería de extracción romana de 20m de longitud que se puede recorrer con linterna. El contraste entre el interior oscuro y húmedo y el exterior de luz naranja del paisaje es sobrecogedora. Los castaños centenarios (algunos de 600 años) que crecen entre las torres de tierra crean un paisaje único en Europa."),
      ("Cueva → Lago del Carucedo → pueblo (4 km)","El Lago del Carucedo se formó como consecuencia directa de las excavaciones romanas — el desecho de la extracción bloqueó el río Sil formando un lago de 3km. En otoño, el castañar crea un espectáculo de colores dorados y rojos alrededor de las torres rojas. La ruta termina en el pueblo con sus bares de tapas de cecina y vino Mencia."),
    ],
    "llevar": ["Linterna (para la Cueva de la Encantada)","Calzado de trekking (terreno irregular)","Agua 1.5L (ruta corta pero sin fuentes en el recorrido)","Ropa de abrigo en otoño (El Bierzo es húmedo y frío)","Cámara con buen objetivo (el paisaje es fotogénico a todas horas)","Dinero en efectivo para los bares del pueblo"],
    "gastro": [("Botillo del Bierzo","Embutido de vísceras de cerdo (rabadilla, costilla, rabo) curado y ahumado. IGP Botillo del Bierzo. Se cuece y se sirve con berzas y patatas. Plato de invierno contundente y muy local."),("Cecina de León","Carne de vacuno curada en sal y ahumada durante 7 meses. Se corta en lonchas finas y se sirve con aceite de oliva. La cecina de Vegacervera es la mejor."),("Vino Mencía","La uva autóctona del Bierzo produce vinos tintos frescos y afrutados con notas de violeta y cereza. DO Bierzo, bodegas como Descendientes de J. Palacios o Estefanía hacen los mejores."),("Castañas del Bierzo","En octubre y noviembre, las castañas de las Médulas y los pueblos del Bierzo se venden asadas en cada esquina. Las mejores son las del castañar de las Médulas, herederas directas de los plantados por los romanos.")],
    "emergencias": [("Emergencias","112",""),("Junta Castilla y León (Las Médulas)","+34 987 422 853","Oficina de turismo"),("Guardia Civil Ponferrada","+34 987 410 208","15km"),("Hospital El Bierzo","+34 987 455 200","Ponferrada, 15km")],
    "consejos": ["La mejor época es octubre — el castañar se tiñe de dorado y naranja sobre el rojo de las torres. Es uno de los paisajes otoñales más espectaculares de España.","La Cueva de la Encantada solo es visitable con el tour organizado del centro de visitantes (€3, 45 min). Verificar horarios antes de ir.","El pueblo de Las Médulas tiene 3–4 bares con buenas tapas y menús del día a €10–12. Comer allí y apoyar la economía local.","Desde Madrid son 4h en coche — mejor combinarlo con un fin de semana en Ponferrada y visita al Castillo de los Templarios."],
    "tags": "médulas bierzo León Roma oro patrimonio UNESCO castaños otoño senderismo",
  },
]

CSS_SHARED = """    html, body { background: #040810 !important; color: #edeef2 !important; font-family: 'Jost', system-ui, sans-serif; }
    nav[role="navigation"] { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 0 32px; height: 72px; display: flex; align-items: center; justify-content: space-between; background: rgba(4,8,16,0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255,255,255,0.08); transition: background 0.3s cubic-bezier(0.16,1,0.3,1); }
    nav[role="navigation"].scrolled { background: rgba(4,8,16,0.95); }
    .itin-section { margin-bottom: 56px; scroll-margin-top: 96px; }
    .section-heading { font-family: 'Bodoni Moda', Georgia, serif; font-size: 1.7rem; font-weight: 700; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; color: #edeef2; }
    .section-heading::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.08); }
    .day-card { background: #0d1628; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; overflow: hidden; margin-bottom: 28px; }
    .day-header { padding: 18px 22px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); display: flex; align-items: center; gap: 16px; }
    .day-num { font-family: 'Bodoni Moda', Georgia, serif; font-size: 2.2rem; font-weight: 700; color: #c9a96e; line-height: 1; min-width: 60px; }
    .day-title { font-family: 'Bodoni Moda', Georgia, serif; font-size: 1.1rem; font-weight: 700; color: #edeef2; margin-bottom: 4px; }
    .day-subtitle { font-size: 0.8rem; color: rgba(237,238,242,0.55); }
    .day-body { padding: 22px; }
    .tip-item { display: flex; gap: 12px; padding: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; margin-bottom: 10px; }
    .tip-num { min-width: 28px; height: 28px; background: rgba(201,169,110,0.15); border: 1px solid rgba(201,169,110,0.3); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: 'Bodoni Moda', Georgia, serif; font-size: 0.85rem; font-weight: 700; color: #c9a96e; flex-shrink: 0; }
    .tip-text { font-size: 0.875rem; color: rgba(237,238,242,0.55); line-height: 1.65; }
    .tip-text strong { color: #edeef2; }
    .gastro-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; }
    .gastro-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px; }
    .gastro-cat { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #c9a96e; margin-bottom: 6px; }
    .gastro-title { font-weight: 700; font-size: 0.93rem; color: #edeef2; margin-bottom: 6px; }
    .gastro-desc { font-size: 0.82rem; color: rgba(237,238,242,0.55); line-height: 1.6; }
    .emerg-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; }
    .emerg-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px; }
    .emerg-label { font-size: 0.7rem; color: rgba(237,238,242,0.55); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .emerg-value { font-size: 1.1rem; font-weight: 700; color: #edeef2; margin-bottom: 2px; }
    .emerg-note { font-size: 0.72rem; color: rgba(237,238,242,0.55); }
    .cta-banner { background: linear-gradient(135deg, rgba(201,169,110,0.12) 0%, rgba(74,127,165,0.08) 100%); border: 1px solid rgba(201,169,110,0.3); border-radius: 20px; padding: 32px; text-align: center; margin-bottom: 28px; }
    .cta-banner h3 { font-family: 'Bodoni Moda', Georgia, serif; font-size: 1.3rem; font-weight: 700; color: #edeef2; margin-bottom: 10px; }
    .cta-banner p { font-size: 0.875rem; color: rgba(237,238,242,0.55); margin-bottom: 18px; }
    .cta-btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 24px; background: linear-gradient(135deg, #c9a96e, #a07840); color: #0a0a0a; font-weight: 600; font-size: 0.9rem; border-radius: 10px; text-decoration: none; transition: transform 0.2s, opacity 0.2s; }
    .cta-btn:hover { transform: translateY(-2px); opacity: 0.9; }
    .disclosure { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px 18px; font-size: 0.79rem; color: rgba(237,238,242,0.55); line-height: 1.65; margin-top: 40px; }
    .itin-layout { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 48px 24px 100px; display: grid; grid-template-columns: 220px 1fr; gap: 48px; align-items: start; }
    .toc { position: sticky; top: 96px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 18px; font-size: 0.82rem; }
    .toc-title { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(237,238,242,0.55); margin-bottom: 12px; }
    .toc-list { list-style: none; display: flex; flex-direction: column; gap: 2px; }
    .toc-list a { display: block; padding: 6px 10px; border-radius: 8px; color: rgba(237,238,242,0.55); text-decoration: none; transition: all 0.2s; border-left: 2px solid transparent; }
    .toc-list a:hover { background: rgba(255,255,255,0.08); color: #edeef2; }
    .toc-list a.active { color: #c9a96e; border-left-color: #c9a96e; background: rgba(201,169,110,0.15); }
    /* Map dark tiles */
    .leaflet-tile-pane { filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%); }
    .route-info-bar { display: grid; grid-template-columns: repeat(5,1fr); gap: 1px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; margin-bottom: 32px; }
    .route-info-item { background: #070d1a; padding: 14px 12px; text-align: center; }
    .route-info-label { font-size: 0.65rem; color: rgba(237,238,242,0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
    .route-info-val { font-family: 'Bodoni Moda', Georgia, serif; font-size: 1rem; font-weight: 700; color: #c9a96e; }
    .check-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 0.86rem; color: rgba(237,238,242,0.55); }
    .check-item:last-child { border-bottom: none; }
    .check-box { width: 16px; height: 16px; border: 1.5px solid rgba(255,255,255,0.2); border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
    @keyframes blob { 0%,100%{transform:translate(0,0)scale(1)}33%{transform:translate(40px,-60px)scale(1.08)}66%{transform:translate(-30px,40px)scale(0.94)} }
    .aurora{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
    .aurora-span{position:absolute;width:500px;height:500px;border-radius:50%;filter:blur(80px);top:40%;left:50%;transform:translate(-50%,-50%);opacity:.35;animation:blob 14s ease-in-out infinite -3.5s}
    @media(max-width:1024px){.itin-layout{grid-template-columns:1fr}.toc{display:none}.gastro-grid{grid-template-columns:1fr}.route-info-bar{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:640px){nav[role="navigation"]{padding:0 14px}nav[role="navigation"] ul{display:none}.emerg-grid{grid-template-columns:1fr}.route-info-bar{grid-template-columns:repeat(2,1fr)}}
    @media(prefers-reduced-motion:reduce){.aurora::before,.aurora::after,.aurora-span{animation:none}}"""

def make_page(r):
    a1, a2, a3 = r['aurora']
    route_json = json.dumps(r['route'])
    wp_json = json.dumps(r['waypoints'])
    center_json = json.dumps(r['map_center'])

    # Secciones
    secciones_html = ''
    for i, (title, desc) in enumerate(r['secciones'], 1):
        secciones_html += f'''      <div class="day-card">
        <div class="day-header">
          <div class="day-num" aria-hidden="true">{i:02d}</div>
          <div>
            <div class="day-title">{title}</div>
          </div>
        </div>
        <div class="day-body" style="font-size:0.88rem;color:rgba(237,238,242,0.65);line-height:1.75;">{desc}</div>
      </div>\n'''

    # Llevar checklist
    llevar_html = ''.join(f'      <div class="check-item"><div class="check-box"></div>{item}</div>\n' for item in r['llevar'])

    # Gastronomía — tuples are (name, description)
    gastro_html = ''
    for g in r['gastro']:
        gastro_html += f'''        <div class="gastro-card">
          <div class="gastro-title">{g[0]}</div>
          <div class="gastro-desc">{g[1]}</div>
        </div>\n'''

    # Emergencias
    emerg_html = ''
    for e in r['emergencias']:
        emerg_html += f'''        <div class="emerg-card"><div class="emerg-label">{e[0]}</div><div class="emerg-value">{e[1]}</div><div class="emerg-note">{e[2]}</div></div>\n'''

    # Consejos
    consejos_html = ''
    for i, c in enumerate(r['consejos'], 1):
        consejos_html += f'      <div class="tip-item"><div class="tip-num">{i}</div><div class="tip-text">{c}</div></div>\n'

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{r['title']} — {r['subtitle']} | Routlo</title>
  <meta name="description" content="{r['desc_hero']} Ruta completa, mapa interactivo, presupuesto y consejos de Routlo."/>
  <link rel="stylesheet" href="../assets/shared.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
  <style>
{CSS_SHARED}
    .aurora::before{{content:'';position:absolute;width:700px;height:700px;border-radius:50%;filter:blur(80px);background:radial-gradient(circle,{a1} 0%,transparent 70%);top:-200px;left:-150px;opacity:.5;animation:blob 14s ease-in-out infinite}}
    .aurora::after{{content:'';position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(80px);background:radial-gradient(circle,{a2} 0%,transparent 70%);bottom:-150px;right:-100px;opacity:.45;animation:blob 14s ease-in-out infinite -7s}}
    .aurora-span{{background:radial-gradient(circle,{a3} 0%,transparent 70%)!important}}
    .dest-hero{{position:relative;z-index:1;min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center;padding:140px 24px 60px;overflow:hidden}}
    .dest-hero-bg{{position:absolute;inset:0;background:{r['hero_grad']},url('https://images.unsplash.com/{r['photo']}?w=1400&q=80') center/cover no-repeat}}
    .dest-hero-overlay{{position:absolute;inset:0;background:linear-gradient(to top,#040810 0%,rgba(4,8,16,0.5) 50%,rgba(4,8,16,0.2) 100%)}}
    .dest-breadcrumb{{display:flex;align-items:center;gap:8px;font-size:0.8rem;color:rgba(237,238,242,0.55);margin-bottom:20px;position:relative;z-index:1}}
    .dest-breadcrumb a{{color:rgba(237,238,242,0.55);text-decoration:none;transition:color .2s}}
    .dest-breadcrumb a:hover{{color:#c9a96e}}
    .dest-breadcrumb span{{opacity:.4}}
    .dest-title{{font-family:'Bodoni Moda',Georgia,serif;font-size:clamp(2.5rem,6vw,5rem);font-weight:700;line-height:1.05;margin-bottom:8px;position:relative;z-index:1;color:#edeef2}}
    .dest-country{{font-family:'Bodoni Moda',Georgia,serif;font-size:clamp(1.2rem,3vw,2rem);font-weight:400;font-style:italic;color:#c9a96e;margin-bottom:24px;position:relative;z-index:1}}
    .dest-meta{{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;position:relative;z-index:1;margin-bottom:32px}}
    .dest-badge{{display:flex;align-items:center;gap:6px;padding:6px 14px;background:rgba(4,8,16,0.7);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);border-radius:100px;font-size:0.8rem;color:rgba(237,238,242,0.55)}}
    .dest-badge.gold{{border-color:rgba(201,169,110,0.3);color:#c9a96e}}
  </style>
</head>
<body>
<div class="aurora" aria-hidden="true"><span class="aurora-span"></span></div>

<nav role="navigation" aria-label="Navegación principal">
  <a href="../index.html" class="nav-logo" aria-label="Routlo inicio">
    <img src="../assets/routlo-logo.png" alt="Routlo" style="height:38px;border-radius:8px;background:#fff;padding:3px 10px;box-shadow:0 2px 8px rgba(0,0,0,0.28);">
  </a>
  <ul class="nav-links" role="list">
    <li><a href="../index.html">Inicio</a></li>
    <li><a href="../itinerarios.html">Itinerarios</a></li>
    <li><a href="../mapa.html">Mapa</a></li>
    <li><a href="../chatbot.html">Chatbot IA</a></li>
    <li><a href="../itinerarios-espana.html" class="active">España</a></li>
    <li class="nav-auth" id="navAuth"></li>
  </ul>
  <button class="nav-mobile-btn" aria-label="Abrir menú" onclick="toggleMenu()">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
</nav>

<section class="dest-hero" aria-labelledby="dest-title">
  <div class="dest-hero-bg" aria-hidden="true"></div>
  <div class="dest-hero-overlay" aria-hidden="true"></div>
  <nav class="dest-breadcrumb" aria-label="Ruta de navegación">
    <a href="../itinerarios-espana.html">España</a>
    <span aria-hidden="true">›</span><span>{r['region']}</span>
  </nav>
  <h1 class="dest-title" id="dest-title">{r['title']}</h1>
  <p class="dest-country">{r['subtitle']}</p>
  <div class="dest-meta">
    <span class="dest-badge">📍 {r['region']}</span>
    <span class="dest-badge gold">{r['dias']}</span>
    <span class="dest-badge">📏 {r['distancia']}</span>
    <span class="dest-badge">⛰️ {r['desnivel']}</span>
    <span class="dest-badge">🥾 {r['dificultad']}</span>
  </div>
</section>

<div class="itin-layout">
  <aside class="toc" aria-label="Tabla de contenidos">
    <div class="toc-title">En esta guía</div>
    <ul class="toc-list">
      <li><a href="#datos-tecnicos">Datos técnicos</a></li>
      <li><a href="#mapa-ruta">Mapa del recorrido</a></li>
      <li><a href="#recorrido">Por secciones</a></li>
      <li><a href="#llevar">Qué llevar</a></li>
      <li><a href="#gastronomia">Gastronomía</a></li>
      <li><a href="#consejos">Consejos</a></li>
      <li><a href="#emergencias">Emergencias</a></li>
    </ul>
  </aside>

  <main>
    <!-- Datos técnicos -->
    <section id="datos-tecnicos" class="itin-section" aria-labelledby="h-datos">
      <h2 class="section-heading" id="h-datos">Datos técnicos</h2>
      <div class="route-info-bar">
        <div class="route-info-item"><div class="route-info-label">Distancia</div><div class="route-info-val">{r['distancia']}</div></div>
        <div class="route-info-item"><div class="route-info-label">Desnivel</div><div class="route-info-val">{r['desnivel']}</div></div>
        <div class="route-info-item"><div class="route-info-label">Dificultad</div><div class="route-info-val">{r['dificultad']}</div></div>
        <div class="route-info-item"><div class="route-info-label">Tiempo</div><div class="route-info-val">{r['tiempo']}</div></div>
        <div class="route-info-item"><div class="route-info-label">Mejor época</div><div class="route-info-val">{r['mejor_epoca']}</div></div>
      </div>
    </section>

    <!-- Mapa del recorrido -->
    <section id="mapa-ruta" class="itin-section" aria-labelledby="h-mapa">
      <h2 class="section-heading" id="h-mapa">Mapa del recorrido</h2>
      <div id="route-map" style="height:440px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);margin-bottom:14px;"></div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:0.79rem;color:rgba(237,238,242,0.55);">
        <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#5ecb8a;"></span>Inicio</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#c9a96e;"></span>Puntos clave</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#e05a5a;"></span>Final</span>
        <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:24px;height:3px;background:#c9a96e;border-radius:2px;"></span>Recorrido</span>
      </div>
    </section>

    <!-- Recorrido por secciones -->
    <section id="recorrido" class="itin-section" aria-labelledby="h-recorrido">
      <h2 class="section-heading" id="h-recorrido">Recorrido por secciones</h2>
{secciones_html}    </section>

    <!-- Qué llevar -->
    <section id="llevar" class="itin-section" aria-labelledby="h-llevar">
      <h2 class="section-heading" id="h-llevar">Qué llevar</h2>
      <div class="day-card"><div class="day-body">
{llevar_html}      </div></div>
    </section>

    <!-- Gastronomía -->
    <section id="gastronomia" class="itin-section" aria-labelledby="h-gastro">
      <h2 class="section-heading" id="h-gastro">Gastronomía local</h2>
      <div class="gastro-grid">
{gastro_html}      </div>
    </section>

    <!-- Consejos -->
    <section id="consejos" class="itin-section" aria-labelledby="h-consejos">
      <h2 class="section-heading" id="h-consejos">Consejos esenciales</h2>
{consejos_html}    </section>

    <!-- Emergencias -->
    <section id="emergencias" class="itin-section" aria-labelledby="h-emerg">
      <h2 class="section-heading" id="h-emerg">Números de emergencia</h2>
      <div class="emerg-grid">
{emerg_html}      </div>
    </section>

    <div class="cta-banner">
      <h3>¿Quieres planificar este viaje?</h3>
      <p>Nuestro chatbot IA puede ayudarte con alojamiento, transporte y personalización del recorrido.</p>
      <a href="../chatbot.html" class="cta-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        Chatbot IA de Routlo
      </a>
    </div>

    <div class="disclosure">
      <strong>Aviso:</strong> Las rutas y distancias son orientativas. Las condiciones de montaña pueden cambiar — consultar siempre el parte meteorológico y el estado del sendero antes de salir. Lleva siempre seguro de asistencia en montaña (rescate en helicóptero puede costar €3.000+).
    </div>
  </main>
</div>

<footer style="position:relative;z-index:1;border-top:1px solid rgba(255,255,255,0.08);padding:48px 32px 32px;max-width:1200px;margin:0 auto;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:32px;margin-bottom:40px;">
    <div><div style="font-family:'Bodoni Moda',Georgia,serif;font-size:1.1rem;font-weight:700;color:#c9a96e;margin-bottom:12px;">Routlo</div><p style="font-size:0.82rem;color:rgba(237,238,242,0.45);line-height:1.65;">Itinerarios inteligentes para viajeros exigentes.</p></div>
    <div><div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:rgba(237,238,242,0.4);margin-bottom:12px;">Senderismo España</div>
      <nav aria-label="Rutas senderismo"><ul style="list-style:none;display:flex;flex-direction:column;gap:6px;">
        <li><a href="cares.html" style="font-size:0.84rem;color:rgba(237,238,242,0.55);text-decoration:none;">Ruta del Cares</a></li>
        <li><a href="mulhacen.html" style="font-size:0.84rem;color:rgba(237,238,242,0.55);text-decoration:none;">Mulhacén</a></li>
        <li><a href="aiguestortes.html" style="font-size:0.84rem;color:rgba(237,238,242,0.55);text-decoration:none;">Aigüestortes</a></li>
        <li><a href="penalara.html" style="font-size:0.84rem;color:rgba(237,238,242,0.55);text-decoration:none;">Peñalara</a></li>
      </ul></nav>
    </div>
    <div><div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:rgba(237,238,242,0.4);margin-bottom:12px;">España</div>
      <nav aria-label="España"><ul style="list-style:none;display:flex;flex-direction:column;gap:6px;"><li><a href="../itinerarios-espana.html" style="font-size:0.84rem;color:rgba(237,238,242,0.55);text-decoration:none;">Ver todos</a></li></ul></nav>
    </div>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
    <span style="font-size:0.79rem;color:rgba(237,238,242,0.3);">© 2026 Routlo. Todos los derechos reservados.</span>
    <a href="../itinerarios-espana.html" style="font-size:0.79rem;color:rgba(237,238,242,0.4);text-decoration:none;">← Todos los itinerarios de España</a>
  </div>
</footer>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV/XN/WPew=" crossorigin=""></script>
<script>
(function(){{
  // Nav scroll
  const nav = document.querySelector('nav[role="navigation"]');
  window.addEventListener('scroll', () => {{ nav.classList.toggle('scrolled', window.scrollY > 20); }}, {{passive:true}});
  function toggleMenu() {{ const ul = nav.querySelector('ul'); ul.style.display = ul.style.display === 'flex' ? 'none' : 'flex'; }}
  window.toggleMenu = toggleMenu;

  // TOC
  const sections = document.querySelectorAll('.itin-section[id]');
  const tocLinks = document.querySelectorAll('.toc-list a');
  const obs = new IntersectionObserver(entries => {{
    entries.forEach(e => {{
      if (e.isIntersecting) {{
        tocLinks.forEach(l => l.classList.remove('active'));
        const a = document.querySelector(`.toc-list a[href="#${{e.target.id}}"]`);
        if (a) a.classList.add('active');
      }}
    }});
  }}, {{ rootMargin: '-20% 0px -70% 0px' }});
  sections.forEach(s => obs.observe(s));

  // Leaflet route map
  const routeCoords = {route_json};
  const waypoints = {wp_json};
  const center = {center_json};

  const map = L.map('route-map', {{ zoomControl: true, attributionControl: false }})
    .setView(center, {r['map_zoom']});

  L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
    maxZoom: 18, attribution: '© OpenStreetMap'
  }}).addTo(map);

  // Fit to route
  const bounds = L.latLngBounds(routeCoords).pad(0.15);
  map.fitBounds(bounds);

  // Route polyline
  L.polyline(routeCoords, {{ color: '#c9a96e', weight: 4, opacity: 0.9, lineJoin: 'round' }}).addTo(map);

  // Start marker
  L.circleMarker(routeCoords[0], {{
    radius: 9, fillColor: '#5ecb8a', color: '#fff', weight: 2.5, fillOpacity: 1
  }}).bindTooltip(waypoints[0].label, {{ permanent: false, direction: 'top' }}).addTo(map);

  // End marker
  L.circleMarker(routeCoords[routeCoords.length - 1], {{
    radius: 9, fillColor: '#e05a5a', color: '#fff', weight: 2.5, fillOpacity: 1
  }}).bindTooltip(waypoints[waypoints.length - 1].label, {{ permanent: false, direction: 'top' }}).addTo(map);

  // Intermediate waypoints
  waypoints.slice(1, -1).forEach(wp => {{
    L.circleMarker(wp.latlng, {{
      radius: 7, fillColor: '#c9a96e', color: '#fff', weight: 2, fillOpacity: 1
    }}).bindTooltip(wp.label, {{ permanent: false, direction: 'top' }}).addTo(map);
  }});

  // Attribution
  L.control.attribution({{ prefix: false }}).addAttribution('© <a href="https://openstreetmap.org">OpenStreetMap</a>').addTo(map);
}})();
</script>
</body>
</html>"""
    return html


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for r in ROUTES:
        path = os.path.join(OUT_DIR, r['file'])
        with open(path, 'w', encoding='utf-8') as f:
            f.write(make_page(r))
        print(f"✓ {r['file']}")

if __name__ == '__main__':
    main()
PYEOF