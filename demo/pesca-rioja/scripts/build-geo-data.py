#!/usr/bin/env python3
"""
Builds real river/reservoir geometry for the Pesca Rioja prototype from
OpenStreetMap (Overpass API) and regenerates the RIVERS / WATERBODIES blocks
in js/data.js.

Fishing-status classification for river stretches we did not hand-author is
a DEMO HEURISTIC (position along the river + a repeating pattern), not real
regulation data -- every generated tramo is still covered by the app's
existing "datos ilustrativos" disclaimer.

Usage: python3 scripts/build-geo-data.py
Requires network access to overpass-api.de (falls back to /tmp cache files
if present, to avoid Overpass rate limits while iterating).
"""
import json
import math
import os
import re
import sys
import unicodedata
import urllib.request


def slugify(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")

CACHE_RIVERS = "/tmp/rioja_rivers.json"
CACHE_WATER = "/tmp/rioja_water.json"
DATA_JS = os.path.join(os.path.dirname(__file__), "..", "js", "data.js")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Real permit-request URL quoted in the Orden ("Se puede consultar la
# disponibilidad en tiempo real en www.larioja.org/permisosdepesca").
PERMISOS_URL = "https://www.larioja.org/permisosdepesca"

RIVERS_QUERY = """
[out:json][timeout:50];
area["ISO3166-2"="ES-RI"]["admin_level"="4"]->.a;
(
  way["waterway"~"^(river|stream)$"]["name"~"Ebro|Oja|Tirón|Tiron|Najerilla|Iregua|Leza|Cidacos|Alhama|Linares|Jubera"](area.a);
);
out geom;
"""

WATER_QUERY = """
[out:json][timeout:80];
area["ISO3166-2"="ES-RI"]["admin_level"="4"]->.a;
(
  way["natural"="water"](area.a);
  way["water"="reservoir"](area.a);
);
out geom;
"""


def fetch(query, cache_path):
    if os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as f:
            return json.load(f)
    data = urllib.parse = None
    req = urllib.request.Request(
        OVERPASS_URL,
        data=f"data={query}".encode("utf-8"),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        payload = json.load(resp)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    return payload


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def haversine_km(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def polygon_area_m2(points):
    """Shoelace formula on an equirectangular approximation -- fine for small ponds."""
    if len(points) < 3:
        return 0.0
    R = 6371000.0
    lat0 = math.radians(points[0][0])
    xy = [
        (R * math.cos(lat0) * math.radians(lon - points[0][1]), R * math.radians(lat - points[0][0]))
        for lat, lon in points
    ]
    s = 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def points_equal(a, b, tol=1e-4):
    return abs(a[0] - b[0]) < tol and abs(a[1] - b[1]) < tol


def chain_ways(ways):
    """Greedily stitch a river's OSM ways (each a list of (lat,lon)) into
    the longest contiguous paths possible, by matching shared endpoints."""
    remaining = [list(w) for w in ways]
    chains = []
    while remaining:
        current = remaining.pop(0)
        extended = True
        while extended:
            extended = False
            for i, w in enumerate(remaining):
                if points_equal(current[-1], w[0]):
                    current = current + w[1:]
                elif points_equal(current[-1], w[-1]):
                    current = current + list(reversed(w))[1:]
                elif points_equal(current[0], w[-1]):
                    current = w[:-1] + current
                elif points_equal(current[0], w[0]):
                    current = list(reversed(w))[:-1] + current
                else:
                    continue
                remaining.pop(i)
                extended = True
                break
        chains.append(current)
    return chains


def rdp(points, epsilon):
    if len(points) < 3:
        return points

    def perp_dist(pt, start, end):
        if start == end:
            return math.hypot(pt[0] - start[0], pt[1] - start[1])
        x, y = pt
        x1, y1 = start
        x2, y2 = end
        num = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1)
        den = math.hypot(y2 - y1, x2 - x1)
        return num / den

    dmax, index = 0.0, 0
    for i in range(1, len(points) - 1):
        d = perp_dist(points[i], points[0], points[-1])
        if d > dmax:
            dmax, index = d, i
    if dmax > epsilon:
        left = rdp(points[: index + 1], epsilon)
        right = rdp(points[index:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def chain_length_km(points):
    return sum(haversine_km(points[i], points[i + 1]) for i in range(len(points) - 1))


def chunk_chain(points, target_km=1.8, min_km=0.6):
    """Split a simplified chain into ~target_km segments (haversine)."""
    chunks = []
    current = [points[0]]
    current_len = 0.0
    for i in range(1, len(points)):
        seg_len = haversine_km(points[i - 1], points[i])
        current.append(points[i])
        current_len += seg_len
        if current_len >= target_km and i != len(points) - 1:
            chunks.append(current)
            current = [points[i]]
            current_len = 0.0
    if current_len >= min_km or not chunks:
        chunks.append(current)
    else:
        chunks[-1].extend(current[1:])
    return chunks


# ---------------------------------------------------------------------------
# Domain data
# ---------------------------------------------------------------------------

NAME_MAP = {
    "Río Ebro": "ebro", "Rio Ebro": "ebro", "Ebro ibaia": "ebro",
    "Río Oja": "oja",
    "Río Tirón": "tiron",
    "Río Najerilla": "najerilla",
    "Río Iregua": "iregua",
    "Río Leza": "leza", "Rio Leza": "leza",
    "Río Cidacos": "cidacos",
    "Río Alhama": "alhama",
    "Río Linares": "linares",
    "Río Jubera": "jubera",
}

# "kind" reflects the REAL water-type classification from the Orden de pesca
# (aguas trucheras vs ciprinícolas), verified against the official 2025/2026
# regulation text -- see scripts/NORMATIVA_FUENTES.md for the source quotes.
#   trout     -> full course is truchera (Oja, Tirón, Najerilla, Iregua)
#   trout_split -> truchera upstream of split_ref, ciprinícola downstream
#                  (Leza splits at the Jubera confluence; Cidacos at Arnedo)
#   cyprinid  -> ciprinícola (Ebro)
#   unmanaged -> not part of the zoned/permit system per the Orden; no
#                official coto/vedado/sin-muerte designation was found
#                (Alhama, Linares, Jubera)
RIVER_META = {
    "ebro": {"nombre": "Ebro", "color": "#0369A1", "mouth_ref": (42.18, -1.75), "kind": "cyprinid"},
    "oja": {"nombre": "Oja", "color": "#166534", "mouth_ref": (42.576, -2.849), "kind": "trout"},
    "tiron": {"nombre": "Tirón", "color": "#15803D", "mouth_ref": (42.576, -2.849), "kind": "trout"},
    "najerilla": {"nombre": "Najerilla", "color": "#0EA5E9", "mouth_ref": (42.42, -2.55), "kind": "trout"},
    "iregua": {"nombre": "Iregua", "color": "#7C3AED", "mouth_ref": (42.47, -2.42), "kind": "trout"},
    "leza": {"nombre": "Leza", "color": "#DB2777", "mouth_ref": (42.44, -2.28), "kind": "trout_split",
             "split_ref": (42.4029, -2.3247)},  # confluence with Jubera, at Murillo de Río Leza
    "cidacos": {"nombre": "Cidacos", "color": "#EA580C", "mouth_ref": (42.303, -1.965), "kind": "trout_split",
                "split_ref": (42.2273, -2.0996)},  # Puente de Francos, Arnedo
    "alhama": {"nombre": "Alhama", "color": "#78350F", "mouth_ref": (42.18, -1.75), "kind": "unmanaged"},
    "linares": {"nombre": "Linares", "color": "#4D7C0F", "mouth_ref": (42.20, -2.10), "kind": "unmanaged"},
    "jubera": {"nombre": "Jubera", "color": "#B45309", "mouth_ref": (42.40, -2.35), "kind": "unmanaged"},
}

# Gazetteer for nearest-town labeling of auto-generated stretches.
# Fetched from OpenStreetMap (all town/village place nodes within ES-RI).
TOWNS = [
    ('Agoncillo', 42.4452, -2.2914),
    ('Aguilar del Río Alhama', 41.9625, -1.994),
    ('Ajamil de Cameros', 42.1675, -2.4863),
    ('Albelda de Iregua', 42.3561, -2.4737),
    ('Alberite', 42.4061, -2.4393),
    ('Alcanadre', 42.4051, -2.1199),
    ('Aldeanueva de Ebro', 42.2293, -1.8881),
    ('Alesanco', 42.4143, -2.8172),
    ('Alesón', 42.4055, -2.6905),
    ('Alfaro', 42.1786, -1.7492),
    ('Almarza de Cameros', 42.2177, -2.5983),
    ('Anguciana', 42.5753, -2.9028),
    ('Anguiano', 42.2612, -2.7649),
    ('Arenzana de Abajo', 42.3866, -2.7189),
    ('Arenzana de Arriba', 42.3885, -2.6956),
    ('Arnedillo', 42.212, -2.2351),
    ('Arnedo', 42.2273, -2.0996),
    ('Arrúbal', 42.4355, -2.2521),
    ('Ausejo', 42.3448, -2.169),
    ('Autol', 42.2131, -2.0058),
    ('Azofra', 42.4235, -2.8014),
    ('Badarán', 42.3677, -2.8084),
    ('Bañares', 42.47, -2.91),
    ('Baños de Rioja', 42.5119, -2.946),
    ('Baños de Río Tobía', 42.3348, -2.7612),
    ('Berceo', 42.3385, -2.8527),
    ('Bergasa', 42.2522, -2.1319),
    ('Bergasillas Bajera', 42.2449, -2.159),
    ('Bezares', 42.3706, -2.6709),
    ('Bobadilla', 42.3176, -2.76),
    ('Brieva de Cameros', 42.164, -2.7936),
    ('Briones', 42.5421, -2.7878),
    ('Briñas', 42.6012, -2.8308),
    ('Cabezón de Cameros', 42.1973, -2.5195),
    ('Calahorra', 42.3035, -1.9649),
    ('Camprovín', 42.3537, -2.7229),
    ('Canales de la Sierra', 42.1426, -3.0251),
    ('Canillas de Río Tuerto', 42.3994, -2.8412),
    ('Casalarreina', 42.548, -2.9111),
    ('Casas Blancas', 42.4853, -2.8434),
    ('Castañares de Rioja', 42.512, -2.9317),
    ('Castroviejo', 42.3302, -2.6613),
    ('Cañas', 42.3916, -2.8462),
    ('Cellorigo', 42.6272, -2.9994),
    ('Cenicero', 42.4813, -2.642),
    ('Cervera del Río Alhama', 42.0058, -1.9555),
    ('Cihuri', 42.5655, -2.9218),
    ('Cirueña', 42.4118, -2.8955),
    ('Clavijo', 42.3495, -2.4263),
    ('Cordovín', 42.3849, -2.8154),
    ('Corera', 42.3432, -2.2194),
    ('Cornago', 42.0658, -2.094),
    ('Corporales', 42.4324, -2.9952),
    ('Cuzcurrita de Río Tirón', 42.5405, -2.9636),
    ('Cárdenas', 42.3744, -2.7671),
    ('Daroca de Rioja', 42.3717, -2.5813),
    ('El Rasillo de Cameros', 42.1949, -2.6974),
    ('El Redal', 42.3381, -2.201),
    ('El Villar de Arnedo', 42.3184, -2.0934),
    ('Enciso', 42.1485, -2.2687),
    ('Entrena', 42.3875, -2.5299),
    ('Estollo', 42.33, -2.8503),
    ('Ezcaray', 42.3258, -3.0146),
    ('Foncea', 42.615, -3.0391),
    ('Fonzaleche', 42.5815, -3.012),
    ('Fuenmayor', 42.4671, -2.5615),
    ('Galbárruli', 42.6223, -2.9613),
    ('Galilea', 42.3476, -2.237),
    ('Gallinero de Cameros', 42.1723, -2.6178),
    ('Gimileo', 42.5495, -2.823),
    ('Grañón', 42.4502, -3.0273),
    ('Grávalos', 42.1083, -2.0002),
    ('Haro', 42.5769, -2.8467),
    ('Herce', 42.2138, -2.1656),
    ('Herramélluri', 42.5021, -3.0196),
    ('Hervías', 42.448, -2.8878),
    ('Hormilla', 42.4379, -2.7747),
    ('Hormilleja', 42.4555, -2.731),
    ('Hornillos de Cameros', 42.2099, -2.4196),
    ('Hornos de Moncalvillo', 42.3919, -2.5852),
    ('Huércanos', 42.4288, -2.6945),
    ('Igea', 42.0686, -2.0093),
    ('Jalón de Cameros', 42.218, -2.4887),
    ('Laguna de Cameros', 42.1747, -2.5421),
    ('Lagunilla del Jubera', 42.3337, -2.3223),
    ('Lardero', 42.4273, -2.4624),
    ('Ledesma de la Cogolla', 42.3203, -2.7199),
    ('Logroño', 42.4661, -2.4397),
    ('Leiva', 42.5029, -3.0466),
    ('Leza de Río Leza', 42.3292, -2.4061),
    ('Los Molinos de Ocón', 42.3161, -2.2079),
    ('Lumbreras de Cameros', 42.1048, -2.6226),
    ('Manjarrés', 42.3919, -2.6758),
    ('Mansilla de la Sierra', 42.1533, -2.9446),
    ('Manzanares de Rioja', 42.3951, -2.8951),
    ('Matute', 42.2984, -2.7955),
    ('Medrano', 42.3827, -2.554),
    ('Munilla', 42.1886, -2.2955),
    ('Murillo de Río Leza', 42.4029, -2.3247),
    ('Muro de Aguas', 42.1335, -2.112),
    ('Muro en Cameros', 42.2255, -2.5299),
    ('Nalda', 42.3351, -2.4883),
    ('Navajún', 41.9646, -2.0988),
    ('Navarrete', 42.429, -2.5616),
    ('Nestares', 42.2704, -2.6199),
    ('Nieva de Cameros', 42.2188, -2.6675),
    ('Nájera', 42.4167, -2.7337),
    ('Ochánduri', 42.5249, -3.003),
    ('Ojacastro', 42.3467, -3.0049),
    ('Ollauri', 42.5423, -2.8327),
    ('Ollora', 42.3265, -2.8959),
    ('Ortigosa de Cameros', 42.1754, -2.7048),
    ('Pazuengos', 42.3181, -2.9255),
    ('Pedroso', 42.3003, -2.7186),
    ('Pinillos', 42.1995, -2.5974),
    ('Pradejón', 42.3343, -2.0689),
    ('Pradillo', 42.1773, -2.6414),
    ('Préjano', 42.1866, -2.1796),
    ('Quel', 42.2284, -2.0483),
    ('Rabanera', 42.1896, -2.4867),
    ('Ribafrecha', 42.3553, -2.3877),
    ('Rincón de Soto', 42.2346, -1.8505),
    ('Robres del Castillo', 42.2739, -2.2919),
    ('Rodezno', 42.5259, -2.8448),
    ('Sajazarra', 42.5886, -2.9603),
    ('San Asensio', 42.498, -2.7499),
    ('San Millán de Yécora', 42.5469, -3.0968),
    ('San Millán de la Cogolla', 42.3295, -2.8618),
    ('San Román de Cameros', 42.232, -2.4737),
    ('San Torcuato', 42.4822, -2.8904),
    ('San Vicente de la Sonsierra', 42.5624, -2.7587),
    ('Santa Coloma', 42.3682, -2.6564),
    ('Santa Engracia del Jubera', 42.315, -2.3062),
    ('Santa Eulalia Bajera', 42.2097, -2.1913),
    ('Santo Domingo de la Calzada', 42.4407, -2.9536),
    ('Santurde de Rioja', 42.3896, -2.9797),
    ('Santurdejo', 42.3775, -2.9548),
    ('Sojuela', 42.3701, -2.5452),
    ('Sorzano', 42.3424, -2.5283),
    ('Soto en Cameros', 42.2865, -2.4249),
    ('Sotés', 42.4003, -2.6019),
    ('Terroba', 42.2574, -2.4439),
    ('Tirgo', 42.5464, -2.9483),
    ('Tobía', 42.2987, -2.8143),
    ('Tormantos', 42.4935, -3.0735),
    ('Torre en Cameros', 42.2403, -2.5184),
    ('Torrecilla en Cameros', 42.2561, -2.6306),
    ('Torrecilla sobre Alesanco', 42.4085, -2.8345),
    ('Torremontalbo', 42.5012, -2.6852),
    ('Treviana', 42.5575, -3.0511),
    ('Tricio', 42.4019, -2.7183),
    ('Tudelilla', 42.2995, -2.1164),
    ('Uruñuela', 42.4425, -2.7081),
    ('Valdemadera', 41.9839, -2.0737),
    ('Valgañón', 42.3173, -3.0674),
    ('Ventosa', 42.4042, -2.6263),
    ('Ventrosa', 42.1558, -2.8521),
    ('Viguera', 42.3082, -2.5338),
    ('Villalba de Rioja', 42.61, -2.8872),
    ('Villalobar de Rioja', 42.4918, -2.9622),
    ('Villamediana de Iregua', 42.426, -2.4188),
    ('Villanueva de Cameros', 42.1671, -2.6509),
    ('Villar de Torre', 42.3714, -2.8646),
    ('Villarejo', 42.3729, -2.8877),
    ('Villarroya', 42.1323, -2.0667),
    ('Villarta-Quintana', 42.4298, -3.0485),
    ('Villavelayo', 42.1317, -2.9848),
    ('Villaverde de Rioja', 42.3214, -2.8104),
    ('Villoslada de Cameros', 42.1138, -2.6733),
    ('Viniegra de Abajo', 42.1525, -2.8892),
    ('Viniegra de Arriba', 42.0953, -2.8335),
    ('Zarratón', 42.5155, -2.8818),
    ('Zarzosa', 42.1814, -2.3422),
    ('Zorraquín', 42.3258, -3.0378),
    ('Ábalos', 42.5727, -2.7101),
]


def nearest_town(latlon):
    return min(TOWNS, key=lambda t: haversine_km(latlon, (t[1], t[2])))[0]


# General rules verified against the Orden de pesca de La Rioja (folleto-resumen
# 2025 + BOR 2026 season dates). Every auto-generated (non hand-matched) stretch
# uses these -- real coto/sin-muerte/vedado designations only apply where we
# have a specific named source (see RICH_TRAMOS below); anything else defaults
# to "tramo libre", which is the correct residual category per the Orden.
TROUT_SEASON = "29 marzo – 31 agosto 2026 (agosto solo captura y suelta; lunes y jueves no festivos solo captura y suelta)"
CYPRINID_SEASON = "Todo el año (aguas ciprinícolas; sin veda estacional)"

TIPO_DEFAULTS = {
    "coto": dict(modalidad=["mosca", "spinning"], cupo="4 piezas/día",
                 tallaMinima="23 cm", veda=TROUT_SEASON,
                 precio="Consulta permiso en sede electrónica"),
    "sinMuerte": dict(modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
                       tallaMinima="No aplica", veda=TROUT_SEASON, precio="Gratuito"),
    "intensivo": dict(modalidad=["mosca", "spinning", "cebo natural"], cupo="4 piezas/día (repoblación periódica)",
                       tallaMinima="23 cm", veda=TROUT_SEASON,
                       precio="Consulta permiso en sede electrónica"),
    "escolar": dict(modalidad=["cebo natural (iniciación)"], cupo="2 piezas/día",
                     tallaMinima="19 cm", veda=TROUT_SEASON, precio="Gratuito (zona de iniciación)"),
    "vedado": dict(modalidad=["ninguna — cierre total"], cupo="0",
                    tallaMinima="No aplica", veda="Cerrado — zona de protección (rota anualmente, consulta IDERioja)",
                    precio="No disponible"),
}


def pseudo_random(seed_str, lo, hi):
    h = 0
    for ch in seed_str:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    frac = (h % 10000) / 10000
    return round(lo + frac * (hi - lo), 1)


def water_kind_at(river_id, frac_along_chain, midpoint):
    meta = RIVER_META[river_id]
    if meta["kind"] != "trout_split":
        return "trout" if meta["kind"] == "trout" else meta["kind"]
    # trout upstream of the split landmark, cyprinid downstream of it
    d_to_mouth = haversine_km(midpoint, meta["mouth_ref"])
    d_split_to_mouth = haversine_km(meta["split_ref"], meta["mouth_ref"])
    return "cyprinid" if d_to_mouth < d_split_to_mouth else "trout"


def classify_auto_chunk(river_id, chunk_id, idx, total, midpoint):
    frac = idx / max(total - 1, 1)
    kind = water_kind_at(river_id, frac, midpoint)
    caudal_base = {"cyprinid": 45.0, "trout": 2.5, "unmanaged": 2.0}[kind]
    caudal = pseudo_random(chunk_id + "-caudal", caudal_base * 0.6, caudal_base * 1.6)
    temp = pseudo_random(chunk_id + "-temp", 8.0, 17.0)

    if kind == "trout":
        # Real talla override: upstream of the Anguiano coto (Najerilla) /
        # Viguera coto (Iregua) is 21 cm cabecera water; downstream is 25 cm.
        talla = "23 cm"
        if river_id == "najerilla":
            anguiano = next(t for t in TOWNS if t[0] == "Anguiano")
            talla = "21 cm (cabecera)" if haversine_km(midpoint, RIVER_META[river_id]["mouth_ref"]) > haversine_km((anguiano[1], anguiano[2]), RIVER_META[river_id]["mouth_ref"]) else "25 cm (aguas abajo del coto de Anguiano)"
        elif river_id == "iregua":
            viguera = next(t for t in TOWNS if t[0] == "Viguera")
            talla = "21 cm (cabecera)" if haversine_km(midpoint, RIVER_META[river_id]["mouth_ref"]) > haversine_km((viguera[1], viguera[2]), RIVER_META[river_id]["mouth_ref"]) else "25 cm (aguas abajo del coto de Viguera)"
        return {
            "tipo": "libre", "especies": ["trucha-comun"], "caudalM3s": caudal, "tempAguaC": temp,
            "transparencia": "Alta", "accesoDificultad": "Difícil" if frac < 0.2 else "Media", "vadeable": True,
            "modalidad": ["mosca", "spinning", "cebo natural"], "cupo": "3 truchas/día",
            "tallaMinima": talla, "veda": TROUT_SEASON, "precio": "Gratuito",
        }
    if kind == "cyprinid":
        # General legal species list for aguas ciprinícolas per the Orden
        # ("Especies pescables: Anguila, barbo común... tenca..."); invasive
        # species (black-bass, lucioperca, etc.) are only pescable in
        # specific authorized eradication zones we don't have a confirmed
        # list for, so they're not added here to avoid overclaiming.
        especies = ["barbo-iberico", "anguila", "tenca"]
        return {
            "tipo": "libre", "especies": especies, "caudalM3s": caudal, "tempAguaC": temp,
            "transparencia": "Media", "accesoDificultad": "Fácil", "vadeable": False,
            "modalidad": ["cebo natural", "spinning"], "cupo": "2 barbos + 5 anguilas + 5 tencas/día",
            "tallaMinima": "35 cm (barbo), 25 cm (anguila), 15 cm (tenca)", "veda": CYPRINID_SEASON, "precio": "Gratuito",
        }
    # unmanaged (Alhama, Linares, Jubera): no coto/vedado designation found in the Orden
    return {
        "tipo": "libre", "especies": ["barbo-iberico", "anguila", "tenca"], "caudalM3s": caudal, "tempAguaC": temp,
        "transparencia": "Media", "accesoDificultad": "Media", "vadeable": True,
        "modalidad": ["cebo natural", "spinning"], "cupo": "Normativa general de aguas ciprinícolas",
        "tallaMinima": "35 cm (barbo), 25 cm (anguila), 15 cm (tenca)",
        "veda": "Sin coto ni vedado designado en la Orden vigente",
        "precio": "Gratuito",
    }


# ---------------------------------------------------------------------------
# Hand-authored rich tramos to preserve (content only -- coords get re-snapped
# to real geometry). anchor = approx (lat, lon) near where it should sit.
# ---------------------------------------------------------------------------

# Real named stretches, extracted verbatim (boundaries paraphrased) from the
# official Orden de pesca (folleto-resumen 2025 "ZONIFICACIÓN PISCÍCOLA" +
# BOR AGM/6/2026 season dates). See scripts/NORMATIVA_FUENTES.md for the
# source quotes each entry is based on. `anchor` is the nearest identifiable
# landmark town, used only to snap the entry onto the correct real geometry
# chunk -- not a literal legal boundary point.
RICH_TRAMOS = [
    # --- OJA ---------------------------------------------------------
    dict(river="oja", anchor=(42.3467, -3.0049), nombre="Oja — Tramo sin muerte de Posadas", municipio="Ojacastro",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 6 de abril al 31 de julio", precio="Gratuito",
         especies=["trucha-comun"], caudalM3s=2.6, tempAguaC=10.5, transparencia="Alta",
         accesoDificultad="Media", vadeable=True),
    dict(river="oja", anchor=(42.548, -2.9111), nombre="Oja — Tramo sin muerte de Casalarreina", municipio="Casalarreina",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de julio (escolleras casco urbano hasta unión con el Tirón)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=4.8, tempAguaC=11.9, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="oja", anchor=(42.3258, -3.0146), nombre="Oja — Tramo libre Azárrulla–Ojacastro", municipio="Ezcaray",
         tipo="libre", modalidad=["mosca", "spinning", "cebo natural"], cupo="3 truchas/día",
         tallaMinima="21 cm", veda="Hábil del 6 de abril al 6 de julio", precio="Gratuito",
         especies=["trucha-comun"], caudalM3s=1.8, tempAguaC=9.6, transparencia="Alta",
         accesoDificultad="Media", vadeable=True),
    # --- TIRÓN ---------------------------------------------------------
    dict(river="tiron", anchor=(42.5769, -2.8467), nombre="Tirón — Tramo sin muerte de Haro", municipio="Haro",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de julio (presa de Arrauri a Fuente del Coto Carrascón)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=3.4, tempAguaC=11.2, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="tiron", anchor=(42.5021, -3.0196), nombre="Tirón — Vedado Herramélluri–Ochánduri", municipio="Herramélluri",
         tipo="vedado", modalidad=["ninguna — cierre total"], cupo="0", tallaMinima="No aplica",
         veda="Vedado esta campaña (los vedados del Tirón rotan cada año; consulta IDERioja)",
         precio="No disponible", especies=["trucha-comun"], caudalM3s=2.0, tempAguaC=9.9, transparencia="Alta",
         accesoDificultad="Media", vadeable=True),
    dict(river="tiron", anchor=(42.5753, -2.9028), nombre="Tirón — Coto Intensivo de Anguciana", municipio="Anguciana",
         tipo="intensivo", modalidad=["mosca", "spinning", "cebo natural (solo lombriz)"], cupo="4 truchas arcoíris/día",
         tallaMinima="23 cm", veda="Ene–jun y oct–dic (lunes, miér, jue, vie, sáb, dom y festivos); trucha común debe devolverse",
         precio="Permiso — Sociedad Riojalteña de Caza y Pesca, Haro", especies=["trucha-arcoiris"],
         caudalM3s=3.1, tempAguaC=11.8, transparencia="Media", accesoDificultad="Fácil", vadeable=True),
    # --- NAJERILLA -----------------------------------------------------
    dict(river="najerilla", anchor=(42.3348, -2.7612), nombre="Najerilla — Tramo sin muerte de Piarrejas", municipio="Baños de Río Tobía",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 6 de abril al 31 de julio (entre los embalses de Mansilla y Piarrejas)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=2.9, tempAguaC=10.3, transparencia="Alta",
         accesoDificultad="Media", vadeable=True),
    dict(river="najerilla", anchor=(42.2612, -2.7649), nombre="Najerilla — Tramo sin muerte \"La Bolacha\"", municipio="Anguiano",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (presa central de Anguiano a desemb. río Brieva)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=3.5, tempAguaC=10.8, transparencia="Alta",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="najerilla", anchor=(42.3744, -2.7671), nombre="Najerilla — Tramo sin muerte de Arenzana", municipio="Cárdenas",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (presa de Mahave a desemb. río Cárdenas)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=4.1, tempAguaC=11.5, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="najerilla", anchor=(42.4159, -2.7325), nombre="Najerilla — Tramo sin muerte de Nájera", municipio="Nájera",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (desemb. río Cordovín a puente N-120)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=5.0, tempAguaC=12.4, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="najerilla", anchor=(42.2612, -2.7649), nombre="Najerilla — Coto de Anguiano", municipio="Anguiano",
         tipo="coto", modalidad=["mosca", "spinning"], cupo="4 truchas/día", tallaMinima="23 cm",
         veda="Hábil todo el coto; sub-zona sin muerte del 1 al 31 de agosto",
         precio="Permiso en sede electrónica (federado/no federado)", especies=["trucha-comun", "trucha-arcoiris"],
         caudalM3s=3.8, tempAguaC=11.0, transparencia="Media", accesoDificultad="Fácil", vadeable=True),
    dict(river="najerilla", anchor=(42.498, -2.7499), nombre="Najerilla — Coto de San Asensio", municipio="San Asensio",
         tipo="coto", modalidad=["mosca", "spinning"], cupo="4 truchas/día", tallaMinima="25 cm",
         veda="Miércoles, jueves, sábados, domingos y festivos del 30 de marzo al 31 de julio",
         precio="Permiso en sede electrónica (federado/no federado)", especies=["trucha-comun", "trucha-arcoiris"],
         caudalM3s=6.2, tempAguaC=13.0, transparencia="Media", accesoDificultad="Fácil", vadeable=False),
    # --- IREGUA ----------------------------------------------------------
    dict(river="iregua", anchor=(42.1138, -2.6733), nombre="Iregua — Coto de Lumbreras", municipio="Villoslada de Cameros",
         tipo="coto", modalidad=["mosca", "spinning"], cupo="4 truchas/día", tallaMinima="23 cm",
         veda="Miércoles, jueves, sábados, domingos y festivos del 6 de abril al 31 de julio",
         precio="Permiso en sede electrónica (federado/no federado)", especies=["trucha-comun"],
         caudalM3s=1.4, tempAguaC=9.0, transparencia="Alta", accesoDificultad="Media", vadeable=True),
    dict(river="iregua", anchor=(42.1671, -2.6509), nombre="Iregua — Coto de Villanueva", municipio="Villanueva de Cameros",
         tipo="coto", modalidad=["mosca", "spinning"], cupo="4 truchas/día", tallaMinima="23 cm",
         veda="Miércoles, jueves, sábados, domingos y festivos del 30 de marzo al 31 de julio",
         precio="Permiso en sede electrónica (federado/no federado)", especies=["trucha-comun"],
         caudalM3s=2.1, tempAguaC=10.1, transparencia="Media", accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.2188, -2.6675), nombre="Iregua — Tramo sin muerte de Villanueva", municipio="Nieva de Cameros",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de julio (puente de Mascarán a presa central de Nieva)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=2.4, tempAguaC=10.6, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.2561, -2.6306), nombre="Iregua — Tramo sin muerte de Torrecilla", municipio="Torrecilla en Cameros",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (zona de Corbalán al puente de Mascarán)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=2.6, tempAguaC=10.9, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.3082, -2.5338), nombre="Iregua — Coto de Viguera", municipio="Viguera",
         tipo="coto", modalidad=["mosca", "spinning", "cebo natural (hasta 1 mayo)"], cupo="4 truchas/día",
         tallaMinima="25 cm", veda="Miércoles, jueves, sábados, domingos y festivos del 30 de marzo al 31 de julio",
         precio="Permiso en sede electrónica (federado/no federado)", especies=["trucha-comun"],
         caudalM3s=3.3, tempAguaC=11.7, transparencia="Media", accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.3351, -2.4883), nombre="Iregua — Tramo sin muerte de Viguera", municipio="Nalda",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de julio (presa toma de aguas de Logroño a puente de Nalda)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=3.6, tempAguaC=12.0, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.3561, -2.4737), nombre="Iregua — Tramo sin muerte de Albelda", municipio="Albelda de Iregua",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (presa regadío río Somero a presa Escuelas Pías)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=3.9, tempAguaC=12.4, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.4061, -2.4393), nombre="Iregua — Tramo sin muerte de Alberite", municipio="Alberite",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (río Mercado a presa del río Varea)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=4.2, tempAguaC=12.8, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.4661, -2.4397), nombre="Iregua — Tramo sin muerte de Logroño", municipio="Logroño",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (Parque del Iregua en Logroño)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=4.6, tempAguaC=13.2, transparencia="Media",
         accesoDificultad="Muy fácil (paseo fluvial)", vadeable=True),
    # --- LEZA / CIDACOS --------------------------------------------------
    dict(river="leza", anchor=(42.3292, -2.4061), nombre="Leza — Tramo sin muerte del Restauro", municipio="Leza de Río Leza",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de julio (fuentes del Restauro al puente LR-460)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=1.7, tempAguaC=10.4, transparencia="Alta",
         accesoDificultad="Media", vadeable=True),
    dict(river="cidacos", anchor=(42.212, -2.2351), nombre="Cidacos — Tramo sin muerte de Arnedillo", municipio="Arnedillo",
         tipo="sinMuerte", modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica", veda="Hábil del 30 de marzo al 31 de agosto (final coto Peroblasco a puente LR-115)",
         precio="Gratuito", especies=["trucha-comun"], caudalM3s=2.2, tempAguaC=12.6, transparencia="Media",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="cidacos", anchor=(42.16, -2.24), nombre="Cidacos — Coto de Peroblasco", municipio="Arnedillo",
         tipo="coto", modalidad=["mosca", "spinning"], cupo="4 truchas/día", tallaMinima="23 cm",
         veda="Miércoles, jueves, sábados, domingos y festivos del 30 de marzo al 31 de agosto",
         precio="Permiso en sede electrónica (federado/no federado)", especies=["trucha-comun"],
         caudalM3s=2.0, tempAguaC=12.0, transparencia="Media", accesoDificultad="Media", vadeable=True),
    dict(river="cidacos", anchor=(42.2273, -2.0996), nombre="Cidacos — Coto Intensivo de Arnedo", municipio="Arnedo",
         tipo="intensivo", modalidad=["mosca", "spinning", "cebo natural (solo lombriz)"], cupo="4 truchas arcoíris/día",
         tallaMinima="23 cm", veda="Lun, miér, jue, vie, sáb, dom y festivos entre abril y octubre",
         precio="Permiso — Sociedad de Pescadores del Cidacos, Arnedo", especies=["trucha-arcoiris"],
         caudalM3s=2.8, tempAguaC=13.5, transparencia="Media", accesoDificultad="Fácil", vadeable=True),
]

# Curated named reservoirs/lakes worth surfacing as fishing spots. Talla/cupo
# taken from the Orden where confirmed; entries marked "sin dato confirmado"
# use the general trout-embalse rule as a placeholder, not a verified figure.
WATER_SELECTION = {
    "Embalse de Mansilla": dict(tipo="coto", especies=["trucha-comun", "trucha-arcoiris"],
                                 talla="30 cm", cupo="3 truchas/día",
                                 precio="Hábil 9 marzo–30 septiembre, todos los días, pesca tradicional"),
    "Embalse González-Lacasa": dict(tipo="coto", especies=["trucha-comun", "trucha-arcoiris"],
                                     talla="30 cm", cupo="3 truchas/día",
                                     precio="Hábil 9 marzo–30 septiembre, todos los días, pesca tradicional"),
    "Embalse de Pajares": dict(tipo="coto", especies=["trucha-arcoiris"],
                                talla="30 cm", cupo="3 truchas/día",
                                precio="Embalse truchero acotado — sin dato de fechas confirmado, consulta sede electrónica"),
    "Embalse de Leiva": dict(tipo="coto", especies=["trucha-arcoiris"],
                              talla="30 cm", cupo="3 truchas/día",
                              precio="Embalse truchero acotado — sin dato de fechas confirmado, consulta sede electrónica"),
    "Embalse de Cornago": dict(tipo="coto", especies=["trucha-arcoiris"], confirmado=False,
                                talla="30 cm (sin dato confirmado)", cupo="3 truchas/día (sin dato confirmado)",
                                precio="Consulta sede electrónica — datos de este embalse no confirmados en la fuente consultada"),
    "Pantano de La Grajera": dict(tipo="intensivo", especies=["trucha-arcoiris", "tenca", "anguila", "black-bass"],
                                   talla="23 cm (trucha), 15 cm (tenca), 25 cm (anguila)", cupo="4/día según especie y periodo",
                                   precio="Periodo truchero 23 feb–15 jun; periodo ciprínidos oct–feb. Área de Medio Ambiente, Ayto. Logroño"),
    "Embalse de Enciso": dict(tipo="coto", especies=["trucha-arcoiris"],
                               talla="30 cm", cupo="3 truchas/día",
                               precio="Hábil 9 marzo–30 septiembre, todos los días, pesca tradicional"),
    "Embalse de Yalde": dict(tipo="coto", especies=["trucha-arcoiris"], confirmado=False,
                              talla="30 cm (sin dato confirmado)", cupo="3 truchas/día (sin dato confirmado)",
                              precio="Consulta sede electrónica — datos de este embalse no confirmados en la fuente consultada"),
    "Embalse de Piarrejas": dict(tipo="coto", especies=["trucha-arcoiris"],
                                  talla="30 cm", cupo="3 truchas/día",
                                  precio="Hábil 6 abril–31 julio; lunes y jueves solo captura y suelta"),
    "Pantano de Valbornedo": dict(tipo="sinMuerte", especies=["barbo-iberico", "anguila", "tenca"],
                                   talla="No aplica", cupo="0 (captura y suelta obligatoria de ciprínidos autóctonos)",
                                   precio="Gratuito — exóticas se sacrifican tras su captura; reservado para competición varios días al año"),
    # Balsas de riego explícitamente listadas como lugar PROHIBIDO para pescar
    # en la sección "Lugares prohibidos" de la Orden.
    "Balsa de Sojuela": dict(tipo="vedado", especies=[], talla="No aplica", cupo="0",
                              precio="Vedada — balsa de riego, lugar prohibido según la Orden de pesca"),
    "Balsa de Sorzano": dict(tipo="vedado", especies=[], talla="No aplica", cupo="0",
                              precio="Vedada — balsa de riego, lugar prohibido según la Orden de pesca"),
    "Embalse de Regajo": dict(tipo="vedado", especies=[], talla="No aplica", cupo="0",
                               precio="Vedada — balsa de riego, lugar prohibido según la Orden de pesca"),
}

# Categorical exclusions: infrastructure that isn't a fishable standing water
# body (troughs, springs, fountains, swimming pools, irrigation canals,
# tiny drainage ditches) or duplicate/mistagged OSM elements. Everything
# else named is included per the user's request that all real water be
# interactive, even when we have no specific regulation data for it.
WATER_EXCLUDE_NAMES = {
    "Abrevadero", "Manantial", "Fuente de Las Abejas", "Piscina municipal",
    "Río Tirón", "Pilón", "Canal Viejo o Patagallina", "Canal Viejo o de Patagallina",
    "Arroyo de Enmedio",
}


def main():
    rivers_raw = fetch(RIVERS_QUERY, CACHE_RIVERS)
    water_raw = fetch(WATER_QUERY, CACHE_WATER)

    by_river = {}
    for el in rivers_raw["elements"]:
        name = el.get("tags", {}).get("name", "")
        rid = NAME_MAP.get(name)
        if not rid:
            continue
        pts = [(round(p["lat"], 6), round(p["lon"], 6)) for p in el["geometry"]]
        by_river.setdefault(rid, []).append(pts)

    rivers_out = []
    for rid, meta in RIVER_META.items():
        ways = by_river.get(rid, [])
        if not ways:
            continue
        chains = [c for c in chain_ways(ways) if chain_length_km(c) > 1.2]
        chains.sort(key=chain_length_km, reverse=True)

        tramos = []
        seg_counter = 0
        for chain in chains:
            # Orient chain source -> mouth using the river's known mouth reference.
            if haversine_km(chain[0], meta["mouth_ref"]) < haversine_km(chain[-1], meta["mouth_ref"]):
                chain = list(reversed(chain))
            simplified = rdp(chain, epsilon=0.0004)
            chunks = chunk_chain(simplified, target_km=3.0, min_km=1.2)
            total = len(chunks)
            for idx, chunk_pts in enumerate(chunks):
                seg_counter += 1
                chunk_id = f"{rid}-seg{seg_counter}"
                length_km = round(chain_length_km(chunk_pts), 2)
                mid = chunk_pts[len(chunk_pts) // 2]

                candidates = []
                for rt in RICH_TRAMOS:
                    if rt["river"] != rid or rt.get("_used"):
                        continue
                    closest = min(haversine_km(rt["anchor"], p) for p in chunk_pts)
                    if closest < 4.2:
                        candidates.append((closest, rt))
                rich = min(candidates, key=lambda c: c[0])[1] if candidates else None
                if rich:
                    rich["_used"] = True
                    tramos.append({
                        "id": chunk_id, "nombre": rich["nombre"], "municipio": rich["municipio"],
                        "km": length_km, "tipo": rich["tipo"], "modalidad": rich["modalidad"],
                        "cupo": rich["cupo"], "tallaMinima": rich["tallaMinima"], "veda": rich["veda"],
                        "precio": rich["precio"],
                        "permisoUrl": PERMISOS_URL if rich["tipo"] in ("coto", "intensivo") else None,
                        "especies": rich["especies"], "caudalM3s": rich["caudalM3s"],
                        "tempAguaC": rich["tempAguaC"], "transparencia": rich["transparencia"],
                        "accesoDificultad": rich["accesoDificultad"], "vadeable": rich["vadeable"],
                        "nombradoEnOrden": True, "coords": chunk_pts,
                    })
                else:
                    auto = classify_auto_chunk(rid, chunk_id, idx, total, mid)
                    town = nearest_town(mid)
                    tramos.append({
                        "id": chunk_id, "nombre": f"{meta['nombre']} — {town}",
                        "municipio": town, "km": length_km, "tipo": auto["tipo"],
                        "modalidad": auto["modalidad"], "cupo": auto["cupo"],
                        "tallaMinima": auto["tallaMinima"], "veda": auto["veda"], "precio": auto["precio"],
                        "permisoUrl": PERMISOS_URL if auto["tipo"] in ("coto", "intensivo") else None,
                        "especies": auto["especies"],
                        "caudalM3s": auto["caudalM3s"], "tempAguaC": auto["tempAguaC"],
                        "transparencia": auto["transparencia"], "accesoDificultad": auto["accesoDificultad"],
                        "vadeable": auto["vadeable"], "nombradoEnOrden": False, "coords": chunk_pts,
                    })
        rivers_out.append({"id": rid, "nombre": meta["nombre"], "color": meta["color"], "tramos": tramos})

    unused_rich = [rt["nombre"] for rt in RICH_TRAMOS if not rt.get("_used")]
    if unused_rich:
        print("WARNING: rich tramos not matched to real geometry:", unused_rich, file=sys.stderr)

    waterbodies_out = []
    GENERIC_WATER_DEFAULTS = dict(
        tipo="libre", modalidad=["cebo natural", "spinning"], cupo="Normativa general de aguas ciprinícolas",
        tallaMinima="35 cm (barbo), 25 cm (anguila), 15 cm (tenca)", veda=CYPRINID_SEASON,
        precio="Sin información específica en las fuentes consultadas — consulta la Orden vigente",
        especies=["barbo-iberico", "anguila", "tenca"],
    )
    seen_slugs = {}
    MIN_UNNAMED_AREA_M2 = 2500  # skip tiny farm puddles with no name at all
    unnamed_counter = 0
    for el in water_raw["elements"]:
        raw_name = el.get("tags", {}).get("name")
        if raw_name and raw_name in WATER_EXCLUDE_NAMES:
            continue
        pts = [(round(p["lat"], 6), round(p["lon"], 6)) for p in el["geometry"]]
        if len(pts) < 4:
            continue
        if not raw_name and polygon_area_m2(pts) < MIN_UNNAMED_AREA_M2:
            continue

        mid = pts[len(pts) // 2]
        town = nearest_town(mid)
        if raw_name:
            name = raw_name
            sel = WATER_SELECTION.get(name, GENERIC_WATER_DEFAULTS)
        else:
            unnamed_counter += 1
            name = f"Masa de agua sin nombre — {town}"
            sel = GENERIC_WATER_DEFAULTS

        defaults = TIPO_DEFAULTS.get(sel["tipo"], GENERIC_WATER_DEFAULTS)
        base_slug = slugify(name) if raw_name else f"agua-sin-nombre-{el['id']}"
        slug = base_slug
        if base_slug in seen_slugs:
            seen_slugs[base_slug] += 1
            slug = f"{base_slug}-{seen_slugs[base_slug]}"
        else:
            seen_slugs[base_slug] = 1
        waterbodies_out.append({
            "id": slug,
            "nombre": name, "municipio": town, "tipo": sel["tipo"],
            "modalidad": sel.get("modalidad", defaults["modalidad"]), "cupo": sel.get("cupo", defaults["cupo"]),
            "tallaMinima": sel.get("talla", defaults["tallaMinima"]), "veda": defaults["veda"],
            "precio": sel.get("precio", defaults["precio"]),
            "permisoUrl": PERMISOS_URL if sel["tipo"] in ("coto", "intensivo") else None,
            "especies": sel["especies"],
            "caudalM3s": None, "tempAguaC": pseudo_random(name + str(el["id"]) + "-temp", 10.0, 18.0),
            "transparencia": "Media", "accesoDificultad": "Fácil", "vadeable": False,
            "nombradoEnOrden": sel.get("confirmado", sel is not GENERIC_WATER_DEFAULTS), "coords": pts,
        })
    print(f"Waterbodies: {len(waterbodies_out)} ({unnamed_counter} unnamed, area-filtered)")

    total_tramos = sum(len(r["tramos"]) for r in rivers_out)
    print(f"Rivers: {len(rivers_out)}, tramos: {total_tramos}, waterbodies: {len(waterbodies_out)}")

    # ---- Emit JS -----------------------------------------------------
    def js_str(s):
        return json.dumps(s, ensure_ascii=False)

    def js_coords(coords):
        return "[" + ",".join(f"[{lat},{lon}]" for lat, lon in coords) + "]"

    def js_list(items):
        return "[" + ",".join(js_str(i) for i in items) + "]"

    lines = ["const RIVERS = ["]
    for r in rivers_out:
        lines.append(f'  {{ id: {js_str(r["id"])}, nombre: {js_str(r["nombre"])}, color: {js_str(r["color"])}, tramos: [')
        for t in r["tramos"]:
            lines.append(
                "    { "
                f'id: {js_str(t["id"])}, nombre: {js_str(t["nombre"])}, municipio: {js_str(t["municipio"])}, '
                f'km: {t["km"]}, tipo: {js_str(t["tipo"])}, modalidad: {js_list(t["modalidad"])}, '
                f'cupo: {js_str(t["cupo"])}, tallaMinima: {js_str(t["tallaMinima"])}, veda: {js_str(t["veda"])}, '
                f'precio: {js_str(t["precio"])}, permisoUrl: {js_str(t["permisoUrl"])}, '
                f'especies: {js_list(t["especies"])}, caudalM3s: {t["caudalM3s"]}, tempAguaC: {t["tempAguaC"]}, '
                f'transparencia: {js_str(t["transparencia"])}, accesoDificultad: {js_str(t["accesoDificultad"])}, '
                f'vadeable: {"true" if t["vadeable"] else "false"}, '
                f'nombradoEnOrden: {"true" if t["nombradoEnOrden"] else "false"}, coords: {js_coords(t["coords"])} }},'
            )
        lines.append("  ] },")
    lines.append("];")
    rivers_js = "\n".join(lines)

    lines = ["const WATERBODIES = ["]
    for w in waterbodies_out:
        caudal = "null" if w["caudalM3s"] is None else w["caudalM3s"]
        lines.append(
            "  { "
            f'id: {js_str(w["id"])}, nombre: {js_str(w["nombre"])}, municipio: {js_str(w["municipio"])}, '
            f'tipo: {js_str(w["tipo"])}, modalidad: {js_list(w["modalidad"])}, cupo: {js_str(w["cupo"])}, '
            f'tallaMinima: {js_str(w["tallaMinima"])}, veda: {js_str(w["veda"])}, precio: {js_str(w["precio"])}, '
            f'permisoUrl: {js_str(w["permisoUrl"])}, especies: {js_list(w["especies"])}, caudalM3s: {caudal}, '
            f'tempAguaC: {w["tempAguaC"]}, transparencia: {js_str(w["transparencia"])}, '
            f'accesoDificultad: {js_str(w["accesoDificultad"])}, vadeable: false, esAgua: true, '
            f'nombradoEnOrden: {"true" if w["nombradoEnOrden"] else "false"}, '
            f'coords: {js_coords(w["coords"])} }},'
        )
    lines.append("];")
    waterbodies_js = "\n".join(lines)

    with open(DATA_JS, encoding="utf-8") as f:
        content = f.read()

    content = re.sub(r"const RIVERS = \[.*?\n\];", rivers_js, content, count=1, flags=re.DOTALL)

    if "const WATERBODIES" in content:
        content = re.sub(r"const WATERBODIES = \[.*?\n\];", waterbodies_js, content, count=1, flags=re.DOTALL)
    else:
        marker = "function allTramos() {"
        content = content.replace(marker, waterbodies_js + "\n\n" + marker, 1)

    if "function allWaterbodies" not in content:
        content = content.replace(
            "function tramoById(id) {\n  return allTramos().find((t) => t.id === id);\n}",
            "function tramoById(id) {\n  return allTramos().find((t) => t.id === id);\n}\n\n"
            "function allWaterbodies() {\n  return WATERBODIES;\n}\n\n"
            "function waterbodyById(id) {\n  return WATERBODIES.find((w) => w.id === id);\n}\n\n"
            "function allInteractables() {\n  return [...allTramos(), ...allWaterbodies()];\n}",
            1,
        )

    with open(DATA_JS, "w", encoding="utf-8") as f:
        f.write(content)
    print("Wrote", DATA_JS)


if __name__ == "__main__":
    main()
