"""Catálogo de especies de setas con su perfil ecológico simplificado.

Cada perfil traduce conocimiento micológico general (temporada, árbol hospedador, altitud,
pH del suelo, lluvia y temperatura que disparan la fructificación) a rangos numéricos que el
motor de `mushrooms.py` cruza con las capas del mapa. Son aproximaciones de campo para la mitad
norte peninsular, no un modelo calibrado: ajústalos con tu propia experiencia.

Rangos "trapezoidales" (min, opt_min, opt_max, max): fuera de [min, max] la condición es mala,
dentro de [opt_min, opt_max] es óptima, y entre medias se interpola linealmente.

Clases de hábitat (de Corine Land Cover, ver `mushrooms.FOREST_CLASSES`):
  conifer        Bosque de coníferas (pinares, abetales)
  broadleaf      Bosque de frondosas (hayedos, robledales, castañares)
  mixed          Bosque mixto
  sclerophyllous Vegetación esclerófila (encinares, coscojares)
  woodland_shrub Matorral boscoso de transición
  dehesa         Sistemas agroforestales (dehesas)
  grassland      Pastizales y prados
  moors          Brezales y landas
  agri_natural   Mosaico agrícola con vegetación natural
"""

SPECIES: list[dict] = [
    {
        "id": "niscalo",
        "name": "Níscalo",
        "scientific": "Lactarius deliciosus",
        "edibility": "comestible",
        "color": "#e8772e",
        "months": [9, 10, 11, 12],
        "hosts": {"conifer": 1.0, "mixed": 0.7, "woodland_shrub": 0.4},
        "elevation": (100, 400, 1300, 1700),
        "ph": (4.5, 5.5, 7.8, 8.3),
        "rain_mm": (25, 60),
        "temp_c": (4, 9, 16, 21),
        "habitat": "Pinares, sobre todo jóvenes y con pinocha; también en mixtos con pino.",
        "notes": "Látex naranja que verdea al roce. Sale 10-20 días después de lluvias otoñales generosas.",
    },
    {
        "id": "boletus-edulis",
        "name": "Boleto o calabaza",
        "scientific": "Boletus edulis",
        "edibility": "comestible",
        "color": "#a0632f",
        "months": [8, 9, 10, 11],
        "hosts": {"broadleaf": 1.0, "mixed": 0.9, "conifer": 0.7, "woodland_shrub": 0.3},
        "elevation": (300, 700, 1600, 2000),
        "ph": (3.8, 4.5, 6.2, 7.2),
        "rain_mm": (30, 70),
        "temp_c": (7, 11, 18, 23),
        "habitat": "Hayedos, robledales, castañares y pinares de montaña en suelo ácido.",
        "notes": "Pide un contraste: lluvia abundante seguida de unos días templados.",
    },
    {
        "id": "boletus-aereus",
        "name": "Boleto negro",
        "scientific": "Boletus aereus",
        "edibility": "comestible",
        "color": "#5b3a24",
        "months": [6, 7, 9, 10],
        "hosts": {"sclerophyllous": 1.0, "broadleaf": 0.9, "dehesa": 0.8, "mixed": 0.5},
        "elevation": (100, 300, 1000, 1300),
        "ph": (4.0, 4.8, 6.5, 7.3),
        "rain_mm": (20, 50),
        "temp_c": (12, 16, 23, 28),
        "habitat": "Encinares, alcornocales, robledales y castañares termófilos.",
        "notes": "El más termófilo de los boletos: tormentas de verano y primeras lluvias de otoño.",
    },
    {
        "id": "boletus-pinophilus",
        "name": "Boleto de pino",
        "scientific": "Boletus pinophilus",
        "edibility": "comestible",
        "color": "#8a3b2b",
        "months": [5, 6, 9, 10, 11],
        "hosts": {"conifer": 1.0, "mixed": 0.6},
        "elevation": (600, 1000, 1900, 2200),
        "ph": (3.8, 4.5, 6.0, 7.0),
        "rain_mm": (30, 65),
        "temp_c": (6, 10, 17, 22),
        "habitat": "Pinares de pino silvestre y negral de montaña, suelo ácido.",
        "notes": "Dos ventanas: primavera tardía y otoño.",
    },
    {
        "id": "amanita-caesarea",
        "name": "Oronja",
        "scientific": "Amanita caesarea",
        "edibility": "comestible",
        "color": "#e5a91a",
        "months": [7, 8, 9, 10],
        "hosts": {"broadleaf": 1.0, "sclerophyllous": 0.9, "dehesa": 0.6, "mixed": 0.6},
        "elevation": (100, 300, 1000, 1300),
        "ph": (4.2, 5.0, 6.8, 7.5),
        "rain_mm": (20, 50),
        "temp_c": (14, 18, 25, 30),
        "habitat": "Robledales, castañares y encinares soleados.",
        "notes": "¡Ojo! Confundible con Amanita muscaria lavada por la lluvia. Recoger solo con volva y láminas amarillas.",
    },
    {
        "id": "cantharellus",
        "name": "Rebozuelo",
        "scientific": "Cantharellus cibarius",
        "edibility": "comestible",
        "color": "#f2b632",
        "months": [6, 7, 8, 9, 10, 11],
        "hosts": {"broadleaf": 1.0, "mixed": 0.9, "conifer": 0.7, "woodland_shrub": 0.4},
        "elevation": (100, 400, 1400, 1800),
        "ph": (3.8, 4.3, 6.0, 7.0),
        "rain_mm": (20, 50),
        "temp_c": (10, 13, 20, 25),
        "habitat": "Hayedos, robledales y pinares húmedos sobre suelo ácido, entre musgo.",
        "notes": "Falsas láminas (pliegues) decurrentes; huele a albaricoque.",
    },
    {
        "id": "perretxiko",
        "name": "Perretxiko (seta de San Jorge)",
        "scientific": "Calocybe gambosa",
        "edibility": "comestible",
        "color": "#e9dfc6",
        "months": [3, 4, 5, 6],
        "hosts": {"grassland": 1.0, "woodland_shrub": 0.8, "moors": 0.6, "agri_natural": 0.6, "broadleaf": 0.3},
        "elevation": (300, 600, 1400, 1800),
        "ph": (5.8, 6.8, 8.3, 8.8),
        "rain_mm": (15, 40),
        "temp_c": (6, 9, 15, 19),
        "habitat": "Prados y orlas de espinos y endrinos, en corros, suelo calizo.",
        "notes": "Huele a harina. Clásica de La Rioja y Euskadi en abril-mayo.",
    },
    {
        "id": "morchella",
        "name": "Colmenilla",
        "scientific": "Morchella esculenta",
        "edibility": "comestible (cocinada)",
        "color": "#c49a5a",
        "months": [3, 4, 5],
        "hosts": {"broadleaf": 1.0, "mixed": 0.8, "woodland_shrub": 0.7, "agri_natural": 0.6, "conifer": 0.4},
        "elevation": (100, 300, 1200, 1600),
        "ph": (6.0, 7.0, 8.3, 8.8),
        "rain_mm": (15, 35),
        "temp_c": (5, 8, 14, 18),
        "water_affinity": True,
        "habitat": "Sotos de ríos, choperas, fresnedas y zonas quemadas el año anterior, en suelo calizo.",
        "notes": "Tóxica en crudo: siempre bien cocinada.",
    },
    {
        "id": "pleurotus-eryngii",
        "name": "Seta de cardo",
        "scientific": "Pleurotus eryngii",
        "edibility": "comestible",
        "color": "#9b8466",
        "months": [9, 10, 11, 12],
        "hosts": {"grassland": 1.0, "agri_natural": 0.8, "woodland_shrub": 0.5, "moors": 0.4},
        "elevation": (100, 400, 1200, 1500),
        "ph": (6.0, 7.0, 8.4, 8.8),
        "rain_mm": (20, 45),
        "temp_c": (6, 10, 17, 22),
        "habitat": "Pastizales secos y eriales con cardo corredor (Eryngium campestre).",
        "notes": "Busca el cardo corredor seco: la seta nace de sus raíces.",
    },
    {
        "id": "agaricus-campestris",
        "name": "Champiñón silvestre",
        "scientific": "Agaricus campestris",
        "edibility": "comestible",
        "color": "#f1ece1",
        "months": [5, 6, 9, 10, 11],
        "hosts": {"grassland": 1.0, "agri_natural": 0.7, "dehesa": 0.7, "moors": 0.4},
        "elevation": (0, 200, 1300, 1800),
        "ph": (5.2, 6.0, 8.0, 8.6),
        "rain_mm": (15, 40),
        "temp_c": (8, 12, 20, 25),
        "habitat": "Prados abonados y pastizales con ganado.",
        "notes": "¡Ojo con Agaricus xanthodermus (amarillea y huele a tinta) y con las amanitas blancas!",
    },
    {
        "id": "hydnum",
        "name": "Lengua de vaca",
        "scientific": "Hydnum repandum",
        "edibility": "comestible",
        "color": "#e7c08e",
        "months": [9, 10, 11, 12],
        "hosts": {"broadleaf": 1.0, "mixed": 0.9, "conifer": 0.8},
        "elevation": (100, 400, 1500, 1900),
        "ph": (4.5, 5.5, 7.8, 8.3),
        "rain_mm": (25, 55),
        "temp_c": (5, 8, 15, 20),
        "habitat": "Hayedos, robledales y pinares, en corros o hileras.",
        "notes": "Aguijones bajo el sombrero en vez de láminas: casi imposible de confundir.",
    },
    {
        "id": "craterellus",
        "name": "Trompeta de los muertos",
        "scientific": "Craterellus cornucopioides",
        "edibility": "comestible",
        "color": "#3a3330",
        "months": [9, 10, 11, 12],
        "hosts": {"broadleaf": 1.0, "mixed": 0.7},
        "elevation": (200, 500, 1400, 1700),
        "ph": (4.5, 5.5, 7.5, 8.0),
        "rain_mm": (30, 65),
        "temp_c": (5, 8, 15, 19),
        "water_affinity": True,
        "habitat": "Hayedos y robledales húmedos, en vaguadas con hojarasca.",
        "notes": "Muy mimética con la hojarasca: busca en zonas umbrías tras lluvias largas.",
    },
    {
        "id": "macrolepiota",
        "name": "Parasol o galamperna",
        "scientific": "Macrolepiota procera",
        "edibility": "comestible",
        "color": "#b98f62",
        "months": [8, 9, 10, 11],
        "hosts": {"grassland": 0.9, "woodland_shrub": 1.0, "dehesa": 0.9, "mixed": 0.7, "broadleaf": 0.6, "conifer": 0.5, "moors": 0.6},
        "elevation": (0, 200, 1400, 1800),
        "ph": (4.5, 5.5, 7.8, 8.4),
        "rain_mm": (20, 45),
        "temp_c": (9, 13, 21, 26),
        "habitat": "Claros y orlas de bosque, prados con matorral.",
        "notes": "Recoge solo ejemplares grandes (>10 cm): las lepiotas pequeñas pueden ser mortales.",
    },
    {
        "id": "marzuelo",
        "name": "Marzuelo",
        "scientific": "Hygrophorus marzuolus",
        "edibility": "comestible",
        "color": "#6f7178",
        "months": [2, 3, 4, 5],
        "hosts": {"conifer": 1.0, "mixed": 0.8, "broadleaf": 0.4},
        "elevation": (700, 1100, 1800, 2100),
        "ph": (4.0, 4.8, 6.8, 7.5),
        "rain_mm": (20, 45),
        "temp_c": (0, 3, 9, 13),
        "habitat": "Hayedos-abetales y pinares de montaña, al retirarse la nieve.",
        "notes": "Sale semienterrado bajo la hojarasca: busca abultamientos.",
    },
    {
        "id": "lepista-nuda",
        "name": "Pie azul",
        "scientific": "Lepista nuda",
        "edibility": "comestible (cocinada)",
        "color": "#8a6fb3",
        "months": [10, 11, 12, 1],
        "hosts": {"broadleaf": 1.0, "conifer": 0.9, "mixed": 1.0, "woodland_shrub": 0.6, "grassland": 0.3},
        "elevation": (0, 200, 1300, 1700),
        "ph": (5.0, 6.0, 8.0, 8.5),
        "rain_mm": (25, 50),
        "temp_c": (1, 4, 11, 16),
        "habitat": "Hojarasca y acículas acumuladas en bosques variados, en corros.",
        "notes": "Aguanta las primeras heladas: de las últimas setas del otoño.",
    },
    {
        "id": "amanita-phalloides",
        "name": "Oronja verde (MORTAL)",
        "scientific": "Amanita phalloides",
        "edibility": "mortal",
        "color": "#9bb36b",
        "months": [8, 9, 10, 11],
        "hosts": {"broadleaf": 1.0, "mixed": 0.8, "sclerophyllous": 0.7, "dehesa": 0.5, "conifer": 0.3},
        "elevation": (0, 200, 1200, 1600),
        "ph": (4.5, 5.5, 7.5, 8.2),
        "rain_mm": (25, 55),
        "temp_c": (8, 12, 20, 25),
        "habitat": "Robledales, castañares, hayedos y encinares.",
        "notes": "Responsable de la mayoría de muertes por setas. Está aquí para que sepas dónde y cuándo extremar el cuidado.",
    },
]

SPECIES_BY_ID: dict[str, dict] = {s["id"]: s for s in SPECIES}


# ---------------------------------------------------------------------------------------------
# Mini guía de campo por especie. Resumen de rasgos clásicos de identificación; NO sustituye a
# una guía completa ni a la revisión de un micólogo. "danger" en cada confusión:
#   "mortal" | "toxica" | "no-comestible" | "comestible"
# ---------------------------------------------------------------------------------------------

GOLDEN_RULES = [
    "Recoge solo lo que identifiques al 100 %. Ante la duda, no la comas.",
    "Arranca o corta el ejemplar entero con la base del pie: la volva y el bulbo son claves para identificar.",
    "Usa cesta, nunca bolsa de plástico: las setas fermentan y se estropean.",
    "Deja los ejemplares pequeños y los muy viejos, y no rastrilles el suelo.",
    "Si tienes dudas, lleva la cesta a una asociación micológica o a la farmacia antes de cocinar.",
    "Consulta la normativa: en buena parte de Soria y La Rioja hay montes acotados que exigen permiso.",
]

GUIDES: dict[str, dict] = {
    "niscalo": {
        "identify": [
            "Sombrero de 5-12 cm, naranja con círculos concéntricos más oscuros y centro hundido; manchas verdes con la edad.",
            "Láminas apretadas, naranjas, que verdean al rozarlas.",
            "Pie corto y hueco, con pequeñas manchas naranjas hundidas.",
            "Clave: al cortarlo suelta látex naranja zanahoria.",
        ],
        "lookalikes": [
            {"name": "Lactarius torminosus", "danger": "toxica", "how": "Sombrero rosado con el borde peludo y látex blanco."},
            {"name": "Lactarius sanguifluus", "danger": "comestible", "how": "Muy parecido, pero con látex rojo vino. Suele salir en pinares calizos."},
        ],
        "picking": "Corta por la base y sacude la tierra en el monte. Revisa que no tenga larvas: se agusana pronto.",
        "kitchen": "A la plancha con ajo y perejil, o en guisos. Puede teñir la orina de rojo: es inofensivo.",
    },
    "boletus-edulis": {
        "identify": [
            "Sombrero de 8-25 cm, marrón avellana con el margen más claro, algo graso con humedad.",
            "Debajo, poros (esponja) en vez de láminas: blancos de joven, después amarillo verdosos.",
            "Pie grueso y barrigudo con una redecilla blanca fina en la parte alta.",
            "Clave: carne blanca que NO azulea al cortarla.",
        ],
        "lookalikes": [
            {"name": "Tylopilus felleus", "danger": "no-comestible", "how": "Poros rosados y redecilla oscura. Amarguísimo: un solo ejemplar arruina el guiso."},
            {"name": "Rubroboletus satanas", "danger": "toxica", "how": "Poros y pie rojos, y la carne azulea. Regla: descarta los boletos con poros rojos."},
        ],
        "picking": "Elige ejemplares firmes y deja los de esponja blanda y verdosa. Corta el pie para revisar larvas.",
        "kitchen": "Los jóvenes, en carpaccio crudo; los demás, a la plancha o en arroz. Se secan muy bien.",
    },
    "boletus-aereus": {
        "identify": [
            "Sombrero de 8-20 cm, pardo muy oscuro a casi negro, seco y aterciopelado.",
            "Poros blancos que pasan a amarillo verdoso con la edad.",
            "Pie robusto y pardo, con redecilla parda.",
            "Clave: carne blanca, muy firme, que no cambia de color.",
        ],
        "lookalikes": [
            {"name": "Otros boletos del grupo edulis", "danger": "comestible", "how": "B. edulis, B. reticulatus y B. pinophilus se diferencian por el color del sombrero; todos son buenos."},
            {"name": "Boletos con poros rojos o carne que azulea", "danger": "toxica", "how": "Descártalos siempre si no eres experto."},
        ],
        "picking": "Sale con calor: busca en las orlas soleadas de encinares y robledales tras las tormentas.",
        "kitchen": "El más apreciado de los boletos: plancha, carpaccio o en conserva.",
    },
    "boletus-pinophilus": {
        "identify": [
            "Sombrero de 8-20 cm, rojo caoba o granate y algo rugoso.",
            "Poros blancos que pasan a amarillo verdoso.",
            "Pie rojizo con redecilla y la base ancha.",
            "Clave: carne blanca, con un tono rojizo justo bajo la piel del sombrero.",
        ],
        "lookalikes": [
            {"name": "Tylopilus felleus", "danger": "no-comestible", "how": "Poros rosados y sabor muy amargo."},
            {"name": "Boletos de poros rojos", "danger": "toxica", "how": "Descarta cualquier boleto con poros rojos o anaranjados."},
        ],
        "picking": "Busca en los claros y las orillas de pinares altos, a menudo entre brezo.",
        "kitchen": "Como el boleto común: plancha, guisos o seco.",
    },
    "amanita-caesarea": {
        "identify": [
            "Sombrero naranja brillante, liso y con el margen estriado.",
            "Láminas y pie AMARILLOS, con anillo amarillo.",
            "Base del pie metida en una volva blanca en forma de saco.",
            "De joven es un «huevo» blanco que, cortado, enseña el interior amarillo y naranja.",
        ],
        "lookalikes": [
            {"name": "Amanita muscaria", "danger": "toxica", "how": "Láminas y pie BLANCOS. La lluvia puede quitarle las verrugas blancas del sombrero."},
            {"name": "Huevos de Amanita phalloides", "danger": "mortal", "how": "Por fuera son iguales. Corta SIEMPRE los huevos por la mitad: si no ves amarillo-naranja dentro, tíralo."},
        ],
        "picking": "Recoge solo ejemplares abiertos o huevos cortados y comprobados. Saca la volva entera.",
        "kitchen": "Clásica en crudo, en láminas finas con aceite y sal, o a la plancha muy breve.",
    },
    "cantharellus": {
        "identify": [
            "Sombrero amarillo yema en forma de embudo, con el margen ondulado.",
            "Debajo, pliegues gruesos y bifurcados (no láminas finas) que bajan por el pie.",
            "Pie macizo, del mismo color.",
            "Clave: olor afrutado, a albaricoque.",
        ],
        "lookalikes": [
            {"name": "Omphalotus olearius (seta de olivo)", "danger": "toxica", "how": "Naranja intenso, con láminas verdaderas. Sale en grupos sobre tocones o raíces de olivo, encina o castaño."},
            {"name": "Hygrophoropsis aurantiaca (falso rebozuelo)", "danger": "no-comestible", "how": "Naranja, con láminas finas muy apretadas. Sale en pinares."},
        ],
        "picking": "Corta por el pie, sin arrancar el musgo. Apenas tiene gusanos.",
        "kitchen": "Salteado o en revuelto. No se seca bien: mejor saltéalo y congélalo.",
    },
    "perretxiko": {
        "identify": [
            "Sombrero de 5-12 cm, blanco a crema, carnoso, con el margen enrollado.",
            "Láminas BLANCAS, muy apretadas.",
            "Pie corto, robusto y blanco.",
            "Clave: olor fuerte a harina fresca. Crece en corros y en primavera.",
        ],
        "lookalikes": [
            {"name": "Entoloma sinuatum", "danger": "toxica", "how": "También huele a harina, pero sus láminas son amarillentas y se vuelven ROSADAS. Intoxicación grave."},
            {"name": "Inocybe erubescens", "danger": "mortal", "how": "Sale en primavera en los mismos sitios: sombrero cónico y fibroso que enrojece. Puede ser mortal."},
        ],
        "picking": "Vuelve cada año al mismo corro: córtalos sin levantar la tierra para no dañarlo.",
        "kitchen": "El clásico revuelto con huevo, o a la plancha con un poco de sal.",
    },
    "morchella": {
        "identify": [
            "Sombrero alveolado como un panal, cónico u ovoide, de ocre a pardo.",
            "El sombrero se une al pie por la base.",
            "Clave: al cortarla a lo largo está HUECA entera, de arriba abajo, en una sola cámara.",
        ],
        "lookalikes": [
            {"name": "Gyromitra esculenta", "danger": "mortal", "how": "Sombrero como un cerebro, no alveolado. Por dentro tiene cámaras o algodón, no un solo hueco."},
            {"name": "Verpa bohemica", "danger": "toxica", "how": "El sombrero solo se une al pie por la punta (cuelga como un dedal) y el pie está relleno de algodón."},
        ],
        "picking": "Córtala siempre por la mitad en el monte para comprobar que está hueca. Busca en sotos y en zonas quemadas el año anterior.",
        "kitchen": "SIEMPRE bien cocinada: cruda es tóxica. Se seca muy bien; rehidrátala en agua tibia.",
    },
    "pleurotus-eryngii": {
        "identify": [
            "Sombrero de 3-10 cm, pardo grisáceo, convexo y luego hundido, a menudo desplazado del centro.",
            "Láminas blanquecinas que bajan por el pie.",
            "Pie corto y blanco, a menudo descentrado.",
            "Clave: nace de las raíces del cardo corredor (Eryngium campestre).",
        ],
        "lookalikes": [
            {"name": "Clitocybe blancas de prado (C. dealbata, C. rivulosa)", "danger": "toxica", "how": "Blancas, pequeñas y con láminas que bajan por el pie. Salen en prados: si no ves el cardo, desconfía."},
        ],
        "picking": "Busca el cardo corredor seco en pastizales y eriales y escarba un poco en su base.",
        "kitchen": "Carne firme: plancha, brasa o guisos.",
    },
    "agaricus-campestris": {
        "identify": [
            "Sombrero de 4-10 cm, blanco y sedoso.",
            "Láminas libres, ROSADAS de joven y luego marrón chocolate. Nunca blancas en adultos.",
            "Pie blanco con un anillo simple y frágil, y SIN volva.",
            "Clave: olor agradable a champiñón; la carne apenas rosa al corte.",
        ],
        "lookalikes": [
            {"name": "Agaricus xanthodermus", "danger": "toxica", "how": "Amarillea con fuerza al rascar la base del pie y huele a tinta o fenol."},
            {"name": "Amanitas blancas (A. verna, A. virosa)", "danger": "mortal", "how": "Láminas SIEMPRE blancas y volva en la base. Saca el pie entero y mira las láminas."},
        ],
        "picking": "Arráncalo entero para ver la base. Descarta los ejemplares con láminas blancas.",
        "kitchen": "Crudo en ensalada si está muy fresco, o salteado.",
    },
    "hydnum": {
        "identify": [
            "Sombrero crema anaranjado pálido, irregular y carnoso.",
            "Clave: debajo tiene AGUIJONES frágiles, como pequeñas púas, en vez de láminas.",
            "Pie corto y blanquecino.",
            "Carne blanca, quebradiza y algo picante cruda.",
        ],
        "lookalikes": [
            {"name": "Hydnum rufescens", "danger": "comestible", "how": "Más pequeño y anaranjado. Igual de bueno."},
        ],
        "picking": "Una de las más seguras para empezar: no hay setas tóxicas con aguijones parecidas.",
        "kitchen": "Quita los aguijones de los ejemplares grandes, porque amargan. Escáldala antes de guisarla.",
    },
    "craterellus": {
        "identify": [
            "Forma de trompeta o embudo hueco, gris oscuro a negro.",
            "Cara externa gris ceniza, lisa o un poco arrugada, sin láminas.",
            "Carne fina y elástica.",
            "Clave: crece en grupos entre la hojarasca y cuesta verla.",
        ],
        "lookalikes": [
            {"name": "Pseudocraterellus undulatus", "danger": "comestible", "how": "Más pequeño y ondulado. También comestible."},
        ],
        "picking": "Cuando veas una, agáchate y mira despacio: suelen salir decenas juntas.",
        "kitchen": "Se seca de maravilla; en polvo condimenta salsas y arroces.",
    },
    "macrolepiota": {
        "identify": [
            "Sombrero muy grande, de 10-30 cm, con escamas pardas sobre fondo crema y el centro oscuro.",
            "Láminas blancas y libres.",
            "Pie alto con dibujo atigrado pardo y anillo doble que se DESLIZA arriba y abajo.",
            "Sin volva en la base.",
        ],
        "lookalikes": [
            {"name": "Lepiotas pequeñas (L. brunneoincarnata y otras)", "danger": "mortal", "how": "Parecen parasoles en miniatura (menos de 10 cm). Contienen la misma toxina que la oronja verde."},
            {"name": "Chlorophyllum rachodes", "danger": "toxica", "how": "Pie liso sin atigrar, y la carne enrojece al cortarla. A algunas personas les sienta mal."},
        ],
        "picking": "Recoge solo ejemplares grandes y abiertos, con el anillo móvil.",
        "kitchen": "El sombrero, empanado o rebozado. El pie es fibroso: descártalo.",
    },
    "marzuelo": {
        "identify": [
            "Sombrero de 4-12 cm, gris oscuro a negruzco, irregular, a menudo con tierra u hojas pegadas.",
            "Láminas blanquecinas a grises, gruesas y espaciadas.",
            "Pie corto, robusto, blanco grisáceo.",
            "Clave: sale a finales del invierno, semienterrado cerca de los neveros.",
        ],
        "lookalikes": [
            {"name": "Tricholoma grises (T. pardinum)", "danger": "toxica", "how": "Parecidos de color, pero salen en otoño, no al retirarse la nieve."},
        ],
        "picking": "Busca bultos en la hojarasca o en la pinocha. Destápalos con cuidado y vuelve a cubrir el sitio.",
        "kitchen": "Salteado, en guisos o con huevos. Carne fina y sabrosa.",
    },
    "lepista-nuda": {
        "identify": [
            "Sombrero de 5-15 cm, violeta o lila con tonos pardos, liso.",
            "Láminas lilas o violáceas, apretadas.",
            "Pie violáceo, fibroso, sin restos de velo.",
            "Clave: olor perfumado, afrutado.",
        ],
        "lookalikes": [
            {"name": "Cortinarius violáceos", "danger": "toxica", "how": "Tienen una cortina como de tela de araña bajo el sombrero y dejan polvo color óxido. Algunos son muy tóxicos."},
        ],
        "picking": "Haz la esporada (deja el sombrero sobre papel blanco unas horas): el pie azul deja polvo rosa pálido, nunca marrón óxido.",
        "kitchen": "SIEMPRE cocinada: cruda es indigesta. Va bien en guisos y escabeches.",
    },
    "amanita-phalloides": {
        "identify": [
            "Sombrero verde oliva a amarillo verdoso (a veces casi blanco), con finas fibras radiales.",
            "Láminas BLANCAS y libres.",
            "Pie blanco con un anillo blanco colgante.",
            "Clave: volva blanca en forma de saco en la base, a menudo enterrada. Hay que escarbar para verla.",
        ],
        "lookalikes": [
            {"name": "Rúsulas y Tricholoma verdes", "danger": "comestible", "how": "Se confunde con setas verdosas comestibles. Las rúsulas no tienen anillo ni volva: escarba SIEMPRE la base."},
            {"name": "Champiñones (Agaricus)", "danger": "comestible", "how": "Los champiñones tienen láminas rosadas o marrones; la oronja verde las tiene siempre blancas."},
        ],
        "picking": "NO la toques para comerla. Un solo ejemplar puede matar a un adulto, y la toxina no se destruye al cocinarla. Lávate las manos si la has tocado.",
        "kitchen": None,
        "symptoms": (
            "Los síntomas tardan de 6 a 24 horas: vómitos y diarrea muy intensos, una falsa mejoría y "
            "después fallo del hígado. Ante cualquier sospecha, ve a urgencias (112) aunque te encuentres "
            "bien, y llévate restos de las setas. Servicio de Información Toxicológica: 91 562 04 20."
        ),
    },
}

for _species in SPECIES:
    _species["guide"] = GUIDES[_species["id"]]
