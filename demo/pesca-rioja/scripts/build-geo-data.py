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
  way["natural"="water"]["name"](area.a);
  way["water"="reservoir"]["name"](area.a);
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

RIVER_META = {
    "ebro": {"nombre": "Ebro", "color": "#0369A1", "mouth_ref": (42.18, -1.75), "kind": "main"},
    "oja": {"nombre": "Oja", "color": "#166534", "mouth_ref": (42.576, -2.849), "kind": "trout"},
    "tiron": {"nombre": "Tirón", "color": "#15803D", "mouth_ref": (42.576, -2.849), "kind": "trout"},
    "najerilla": {"nombre": "Najerilla", "color": "#0EA5E9", "mouth_ref": (42.42, -2.55), "kind": "trout"},
    "iregua": {"nombre": "Iregua", "color": "#7C3AED", "mouth_ref": (42.47, -2.42), "kind": "trout"},
    "leza": {"nombre": "Leza", "color": "#DB2777", "mouth_ref": (42.44, -2.28), "kind": "trout"},
    "cidacos": {"nombre": "Cidacos", "color": "#EA580C", "mouth_ref": (42.303, -1.965), "kind": "trout"},
    "alhama": {"nombre": "Alhama", "color": "#78350F", "mouth_ref": (42.18, -1.75), "kind": "trout"},
    "linares": {"nombre": "Linares", "color": "#4D7C0F", "mouth_ref": (42.20, -2.10), "kind": "trout"},
    "jubera": {"nombre": "Jubera", "color": "#B45309", "mouth_ref": (42.40, -2.35), "kind": "trout"},
}

# Small gazetteer for nearest-town labeling of auto-generated stretches.
TOWNS = [
    ("Haro", 42.5763, -2.8437), ("Logroño", 42.4627, -2.4449), ("Alfaro", 42.1808, -1.7469),
    ("Ezcaray", 42.3253, -3.0000), ("Santo Domingo de la Calzada", 42.4405, -2.9538),
    ("Cuzcurrita de Río Tirón", 42.5150, -2.9280), ("Anguiano", 42.2757, -2.7728),
    ("Nájera", 42.4159, -2.7325), ("Villanueva de Cameros", 42.1652, -2.6395),
    ("Islallana", 42.4020, -2.5250), ("Leza de Río Leza", 42.3050, -2.4550),
    ("Arnedillo", 42.2266, -2.1000), ("Arnedo", 42.2266, -2.1030),
    ("Cervera del Río Alhama", 42.0270, -1.9680), ("Calahorra", 42.3055, -1.9656),
    ("Murillo de Río Leza", 42.3900, -2.3450), ("Ribafrecha", 42.3960, -2.3480),
    ("Muro de Aguas", 42.2210, -2.1740), ("Munilla", 42.2170, -2.4400),
    ("Enciso", 42.1560, -2.2680), ("Bobadilla", 42.4020, -2.5450),
    ("Agoncillo", 42.4400, -2.2870), ("Autol", 42.2160, -1.9990),
    ("Torrecilla en Cameros", 42.2450, -2.6280), ("Robres del Castillo", 42.2200, -2.3320),
]


def nearest_town(latlon):
    return min(TOWNS, key=lambda t: haversine_km(latlon, (t[1], t[2])))[0]


TIPO_CYCLE = ["libre", "libre", "coto", "libre", "sinMuerte", "coto", "libre", "intensivo"]

TIPO_DEFAULTS = {
    "libre": dict(modalidad=["mosca", "spinning", "cebo natural"], cupo="4 piezas/día",
                  tallaMinima="21 cm", veda="1 marzo – 3er domingo de agosto", precio="Gratuito"),
    "coto": dict(modalidad=["mosca", "spinning"], cupo="4 piezas/día",
                 tallaMinima="21 cm", veda="1 marzo – 3er domingo de agosto",
                 precio="Consulta permiso en sede electrónica"),
    "sinMuerte": dict(modalidad=["mosca sin muerte", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
                       tallaMinima="No aplica", veda="Abierto todo el año", precio="Gratuito"),
    "intensivo": dict(modalidad=["mosca", "spinning", "cebo natural"], cupo="6 piezas/día (repoblación periódica)",
                       tallaMinima="Sin talla mínima", veda="1 marzo – 3er domingo de agosto",
                       precio="Consulta permiso en sede electrónica"),
    "escolar": dict(modalidad=["cebo natural (iniciación)"], cupo="2 piezas/día",
                     tallaMinima="19 cm", veda="1 marzo – 3er domingo de agosto", precio="Gratuito (zona de iniciación)"),
    "vedado": dict(modalidad=["ninguna — cierre total"], cupo="0",
                    tallaMinima="No aplica", veda="Cerrado — zona de protección", precio="No disponible"),
}


def pseudo_random(seed_str, lo, hi):
    h = 0
    for ch in seed_str:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    frac = (h % 10000) / 10000
    return round(lo + frac * (hi - lo), 1)


def classify_auto_chunk(river_id, chunk_id, idx, total, midpoint):
    kind = RIVER_META[river_id]["kind"]
    frac = idx / max(total - 1, 1)
    if idx == 0 and total > 2:
        tipo = "escolar"
    else:
        tipo = TIPO_CYCLE[idx % len(TIPO_CYCLE)]
    especies = ["trucha-comun"] if kind == "trout" else ["barbo-iberico"]
    if kind == "trout" and tipo in ("coto", "intensivo"):
        especies = especies + ["trucha-arcoiris"]
    if kind == "main":
        especies = ["barbo-iberico"]
        if tipo in ("coto",):
            especies = especies + ["lucioperca"]
        if frac > 0.5:
            especies = especies + ["black-bass"]
    base_caudal = 45.0 if kind == "main" else 2.5
    caudal = pseudo_random(chunk_id + "-caudal", base_caudal * 0.6, base_caudal * 1.6)
    temp = pseudo_random(chunk_id + "-temp", 8.0, 17.0)
    dificultad = "Fácil" if kind == "main" else ("Difícil" if frac < 0.2 else "Media")
    defaults = TIPO_DEFAULTS[tipo]
    return {
        "tipo": tipo,
        "especies": especies,
        "caudalM3s": caudal,
        "tempAguaC": temp,
        "transparencia": "Media" if kind == "main" else "Alta",
        "accesoDificultad": dificultad,
        "vadeable": kind != "main",
        **defaults,
    }


# ---------------------------------------------------------------------------
# Hand-authored rich tramos to preserve (content only -- coords get re-snapped
# to real geometry). anchor = approx (lat, lon) near where it should sit.
# ---------------------------------------------------------------------------

RICH_TRAMOS = [
    dict(river="ebro", anchor=(42.5763, -2.8437), nombre="Ebro — Haro a San Vicente", municipio="Haro",
         tipo="libre", modalidad=["mosca", "spinning", "cebo natural"], cupo="4 piezas/día",
         tallaMinima="21 cm (trucha), 25 cm (barbo)", veda="1 marzo – 3er domingo de agosto",
         precio="Gratuito", especies=["barbo-iberico", "trucha-arcoiris"],
         caudalM3s=42.5, tempAguaC=14.2, transparencia="Media", accesoDificultad="Fácil", vadeable=False),
    dict(river="ebro", anchor=(42.4627, -2.4449), nombre="Ebro — Tramo urbano Logroño", municipio="Logroño",
         tipo="sinMuerte", modalidad=["mosca", "spinning sin muerte"], cupo="0 (captura y suelta obligatoria)",
         tallaMinima="No aplica (devolución obligatoria)", veda="Abierto todo el año, captura y suelta",
         precio="Gratuito", especies=["barbo-iberico", "black-bass"],
         caudalM3s=58.1, tempAguaC=15.6, transparencia="Baja", accesoDificultad="Muy fácil (paseo fluvial)", vadeable=False),
    dict(river="ebro", anchor=(42.1808, -1.7469), nombre="Ebro — Coto de Alfaro", municipio="Alfaro",
         tipo="coto", modalidad=["cebo natural", "spinning"], cupo="3 piezas/día",
         tallaMinima="25 cm (barbo)", veda="1 marzo – 3er domingo de agosto",
         precio="18 €/día — permiso en sede electrónica", especies=["barbo-iberico", "lucioperca"],
         caudalM3s=63.0, tempAguaC=16.4, transparencia="Media", accesoDificultad="Fácil", vadeable=False),
    dict(river="oja", anchor=(42.3253, -3.0000), nombre="Oja — Cabecera Ezcaray", municipio="Ezcaray",
         tipo="vedado", modalidad=["ninguna — cierre total"], cupo="0", tallaMinima="No aplica",
         veda="Cerrado todo el año — zona de protección de freza", precio="No disponible",
         especies=["trucha-comun"], caudalM3s=2.1, tempAguaC=9.8, transparencia="Alta",
         accesoDificultad="Difícil (sendero de montaña)", vadeable=True),
    dict(river="oja", anchor=(42.4405, -2.9538), nombre="Oja — Santo Domingo de la Calzada", municipio="Santo Domingo de la Calzada",
         tipo="intensivo", modalidad=["mosca", "spinning", "cebo natural"], cupo="6 piezas/día (repoblación semanal)",
         tallaMinima="Sin talla mínima", veda="1 marzo – 3er domingo de agosto",
         precio="12 €/día — permiso en sede electrónica", especies=["trucha-arcoiris", "trucha-comun"],
         caudalM3s=4.4, tempAguaC=11.5, transparencia="Alta", accesoDificultad="Fácil", vadeable=True),
    dict(river="tiron", anchor=(42.5150, -2.9280), nombre="Tirón — Tramo medio Cuzcurrita", municipio="Cuzcurrita de Río Tirón",
         tipo="libre", modalidad=["mosca", "spinning", "cebo natural"], cupo="4 piezas/día",
         tallaMinima="21 cm", veda="1 marzo – 3er domingo de agosto", precio="Gratuito",
         especies=["trucha-comun"], caudalM3s=3.2, tempAguaC=10.9, transparencia="Alta",
         accesoDificultad="Media", vadeable=True),
    dict(river="najerilla", anchor=(42.2757, -2.7728), nombre="Najerilla — Cabecera / Embalse Mansilla", municipio="Anguiano",
         tipo="escolar", modalidad=["cebo natural (iniciación)"], cupo="2 piezas/día",
         tallaMinima="19 cm", veda="1 marzo – 3er domingo de agosto", precio="Gratuito (zona de iniciación)",
         especies=["trucha-comun"], caudalM3s=2.8, tempAguaC=10.1, transparencia="Alta",
         accesoDificultad="Fácil", vadeable=True),
    dict(river="najerilla", anchor=(42.4159, -2.7325), nombre="Najerilla — Coto de Nájera", municipio="Nájera",
         tipo="coto", modalidad=["mosca", "spinning"], cupo="4 piezas/día", tallaMinima="21 cm",
         veda="1 marzo – 3er domingo de agosto", precio="15 €/día — permiso en sede electrónica",
         especies=["trucha-comun", "trucha-arcoiris"], caudalM3s=5.6, tempAguaC=12.3,
         transparencia="Media", accesoDificultad="Fácil", vadeable=True),
    dict(river="iregua", anchor=(42.1652, -2.6395), nombre="Iregua — Alto (Villanueva de Cameros)", municipio="Villanueva de Cameros",
         tipo="libre", modalidad=["mosca", "cebo natural"], cupo="4 piezas/día", tallaMinima="21 cm",
         veda="1 marzo – 3er domingo de agosto", precio="Gratuito", especies=["trucha-comun"],
         caudalM3s=1.9, tempAguaC=9.4, transparencia="Alta", accesoDificultad="Media", vadeable=True),
    dict(river="iregua", anchor=(42.4020, -2.5250), nombre="Iregua — Bajo urbano", municipio="Islallana / Logroño",
         tipo="sinMuerte", modalidad=["mosca sin muerte"], cupo="0 (devolución obligatoria)",
         tallaMinima="No aplica", veda="Abierto todo el año", precio="Gratuito",
         especies=["trucha-comun", "barbo-iberico"], caudalM3s=3.1, tempAguaC=12.8,
         transparencia="Media", accesoDificultad="Fácil", vadeable=True),
    dict(river="leza", anchor=(42.3050, -2.4550), nombre="Leza — Coto Leza de Río Leza", municipio="Leza de Río Leza",
         tipo="coto", modalidad=["mosca", "spinning"], cupo="4 piezas/día", tallaMinima="21 cm",
         veda="1 marzo – 3er domingo de agosto", precio="14 €/día — permiso en sede electrónica",
         especies=["trucha-comun"], caudalM3s=1.6, tempAguaC=10.7, transparencia="Alta",
         accesoDificultad="Media", vadeable=True),
    dict(river="cidacos", anchor=(42.2266, -2.1000), nombre="Cidacos — Arnedillo", municipio="Arnedillo",
         tipo="libre", modalidad=["mosca", "cebo natural"], cupo="4 piezas/día", tallaMinima="21 cm",
         veda="1 marzo – 3er domingo de agosto", precio="Gratuito", especies=["trucha-comun", "barbo-iberico"],
         caudalM3s=2.4, tempAguaC=13.1, transparencia="Media", accesoDificultad="Media", vadeable=True),
    dict(river="alhama", anchor=(42.0270, -1.9680), nombre="Alhama — Cabecera Cervera", municipio="Cervera del Río Alhama",
         tipo="vedado", modalidad=["ninguna — cierre total"], cupo="0", tallaMinima="No aplica",
         veda="Cerrado todo el año — recuperación de población", precio="No disponible",
         especies=["trucha-comun"], caudalM3s=0.9, tempAguaC=11.8, transparencia="Alta",
         accesoDificultad="Difícil", vadeable=True),
]

# Curated named reservoirs/lakes worth surfacing as fishing spots.
WATER_SELECTION = {
    "Embalse de Mansilla": dict(tipo="coto", especies=["trucha-arcoiris", "black-bass"], precio="Permiso de embalse — consulta sede electrónica"),
    "Embalse González-Lacasa": dict(tipo="coto", especies=["black-bass", "lucioperca"], precio="Permiso de embalse — consulta sede electrónica"),
    "Embalse de Pajares": dict(tipo="coto", especies=["trucha-arcoiris"], precio="Permiso de embalse — consulta sede electrónica"),
    "Embalse de Leiva": dict(tipo="libre", especies=["trucha-comun"], precio="Gratuito"),
    "Embalse de Cornago": dict(tipo="coto", especies=["trucha-arcoiris", "black-bass"], precio="Permiso de embalse — consulta sede electrónica"),
    "Pantano de La Grajera": dict(tipo="sinMuerte", especies=["black-bass", "lucioperca"], precio="Gratuito (captura y suelta)"),
    "Embalse de Enciso": dict(tipo="coto", especies=["black-bass"], precio="Permiso de embalse — consulta sede electrónica"),
    "Embalse de Yalde": dict(tipo="libre", especies=["trucha-comun"], precio="Gratuito"),
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
            chunks = chunk_chain(simplified, target_km=5.5, min_km=2.0)
            total = len(chunks)
            for idx, chunk_pts in enumerate(chunks):
                seg_counter += 1
                chunk_id = f"{rid}-seg{seg_counter}"
                length_km = round(chain_length_km(chunk_pts), 2)
                mid = chunk_pts[len(chunk_pts) // 2]

                rich = None
                for rt in RICH_TRAMOS:
                    if rt["river"] != rid or rt.get("_used"):
                        continue
                    closest = min(haversine_km(rt["anchor"], p) for p in chunk_pts)
                    if closest < 6.5:
                        rich = rt
                        break
                if rich:
                    rich["_used"] = True
                    tramos.append({
                        "id": chunk_id, "nombre": rich["nombre"], "municipio": rich["municipio"],
                        "km": length_km, "tipo": rich["tipo"], "modalidad": rich["modalidad"],
                        "cupo": rich["cupo"], "tallaMinima": rich["tallaMinima"], "veda": rich["veda"],
                        "precio": rich["precio"], "permisoUrl": "https://www.larioja.org/pesca",
                        "especies": rich["especies"], "caudalM3s": rich["caudalM3s"],
                        "tempAguaC": rich["tempAguaC"], "transparencia": rich["transparencia"],
                        "accesoDificultad": rich["accesoDificultad"], "vadeable": rich["vadeable"],
                        "coords": chunk_pts,
                    })
                else:
                    auto = classify_auto_chunk(rid, chunk_id, idx, total, mid)
                    town = nearest_town(mid)
                    tramos.append({
                        "id": chunk_id, "nombre": f"{meta['nombre']} — {town}",
                        "municipio": town, "km": length_km, "tipo": auto["tipo"],
                        "modalidad": auto["modalidad"], "cupo": auto["cupo"],
                        "tallaMinima": auto["tallaMinima"], "veda": auto["veda"], "precio": auto["precio"],
                        "permisoUrl": "https://www.larioja.org/pesca", "especies": auto["especies"],
                        "caudalM3s": auto["caudalM3s"], "tempAguaC": auto["tempAguaC"],
                        "transparencia": auto["transparencia"], "accesoDificultad": auto["accesoDificultad"],
                        "vadeable": auto["vadeable"], "coords": chunk_pts,
                    })
        rivers_out.append({"id": rid, "nombre": meta["nombre"], "color": meta["color"], "tramos": tramos})

    unused_rich = [rt["nombre"] for rt in RICH_TRAMOS if not rt.get("_used")]
    if unused_rich:
        print("WARNING: rich tramos not matched to real geometry:", unused_rich, file=sys.stderr)

    waterbodies_out = []
    for el in water_raw["elements"]:
        name = el.get("tags", {}).get("name")
        if name not in WATER_SELECTION:
            continue
        sel = WATER_SELECTION[name]
        pts = [(round(p["lat"], 6), round(p["lon"], 6)) for p in el["geometry"]]
        if len(pts) < 4:
            continue
        mid = pts[len(pts) // 2]
        town = nearest_town(mid)
        defaults = TIPO_DEFAULTS[sel["tipo"]]
        waterbodies_out.append({
            "id": slugify(name),
            "nombre": name, "municipio": town, "tipo": sel["tipo"],
            "modalidad": defaults["modalidad"], "cupo": defaults["cupo"],
            "tallaMinima": defaults["tallaMinima"], "veda": defaults["veda"],
            "precio": sel.get("precio", defaults["precio"]),
            "permisoUrl": "https://www.larioja.org/pesca", "especies": sel["especies"],
            "caudalM3s": None, "tempAguaC": pseudo_random(name + "-temp", 10.0, 18.0),
            "transparencia": "Media", "accesoDificultad": "Fácil", "vadeable": False,
            "coords": pts,
        })

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
                f'vadeable: {"true" if t["vadeable"] else "false"}, coords: {js_coords(t["coords"])} }},'
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
