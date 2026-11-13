"""Descarga una foto con licencia libre de cada especie del catálogo de setas desde iNaturalist.

Uso (desde fossil-zone-mapping/backend, con las dependencias del backend instaladas):

    python ../scripts/fetch_mushroom_photos.py            # solo las que falten
    python ../scripts/fetch_mushroom_photos.py --force    # vuelve a descargarlas todas

Guarda `frontend/img/setas/<id>.jpg` y `frontend/img/setas/credits.json` (autor, licencia y
enlace de cada foto, que el frontend muestra bajo la imagen). Solo acepta licencias que permiten
cualquier uso, comercial incluido (CC0, CC BY, CC BY-SA): las "NC" se descartan.
Revisa las fotos a ojo después de descargarlas: la foto destacada de un taxón no siempre es la
mejor para identificarlo.
"""
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.services.mushroom_species import SPECIES  # noqa: E402

OUT_DIR = ROOT / "frontend" / "img" / "setas"
API = "https://api.inaturalist.org/v1"
ALLOWED_LICENSES = {"cc0", "cc-by", "cc-by-sa"}
HEADERS = {"User-Agent": "FossilZoneMapping/1.0 (personal mushroom guide)"}
# Si la foto elegida automáticamente no sirve para reconocer la seta, fija aquí el id de una
# observación de iNaturalist (la URL inaturalist.org/observations/<id>): se usa su primera foto.
OBSERVATION_OVERRIDES: dict[str, int] = {
    "cantharellus": 138991292,  # la destacada era un primer plano de los pliegues
    "macrolepiota": 408868028,  # la destacada eran ejemplares jóvenes cerrados
}


def pick_photo(scientific: str, species_id: str) -> dict | None:
    if species_id in OBSERVATION_OVERRIDES:
        obs = httpx.get(f"{API}/observations/{OBSERVATION_OVERRIDES[species_id]}", headers=HEADERS, timeout=30)
        obs.raise_for_status()
        photo = obs.json()["results"][0]["photos"][0]
        if (photo.get("license_code") or "").lower() not in ALLOWED_LICENSES:
            raise RuntimeError(f"La foto fijada para {species_id} no tiene licencia libre")
        return photo
    search = httpx.get(f"{API}/taxa", params={"q": scientific, "rank": "species", "per_page": 1}, headers=HEADERS, timeout=30)
    search.raise_for_status()
    results = search.json()["results"]
    if not results:
        return None
    time.sleep(1.2)
    taxon = httpx.get(f"{API}/taxa/{results[0]['id']}", headers=HEADERS, timeout=30)
    taxon.raise_for_status()
    photos = [tp["photo"] for tp in taxon.json()["results"][0].get("taxon_photos", [])]
    for photo in photos:
        if (photo.get("license_code") or "").lower() in ALLOWED_LICENSES:
            return {"taxon_id": results[0]["id"], **photo}

    # Plan B: fotos de observaciones con grado de investigación (identificación verificada por la
    # comunidad), las más votadas primero, filtradas por licencia libre.
    time.sleep(1.2)
    observations = httpx.get(
        f"{API}/observations",
        params={
            "taxon_id": results[0]["id"],
            "quality_grade": "research",
            "photo_license": ",".join(sorted(ALLOWED_LICENSES)),
            "order_by": "votes",
            "per_page": 10,
        },
        headers=HEADERS,
        timeout=30,
    )
    observations.raise_for_status()
    for observation in observations.json()["results"]:
        for photo in observation.get("photos", []):
            if (photo.get("license_code") or "").lower() in ALLOWED_LICENSES:
                return {"taxon_id": results[0]["id"], **photo}
    return None


def main(force: bool) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    credits_path = OUT_DIR / "credits.json"
    credits = json.loads(credits_path.read_text()) if credits_path.exists() else {}

    for species in SPECIES:
        target = OUT_DIR / f"{species['id']}.jpg"
        if target.exists() and species["id"] in credits and not force:
            continue
        photo = pick_photo(species["scientific"], species["id"])
        time.sleep(1.2)
        if photo is None:
            print(f"SIN FOTO LIBRE: {species['scientific']}")
            continue
        url = photo["url"].replace("square", "medium")
        image = httpx.get(url, headers=HEADERS, timeout=60, follow_redirects=True)
        image.raise_for_status()
        target.write_bytes(image.content)
        credits[species["id"]] = {
            "file": f"img/setas/{species['id']}.jpg",
            "attribution": photo["attribution"],
            "license": photo["license_code"].upper(),
            "source": f"https://www.inaturalist.org/photos/{photo['id']}",
        }
        print(f"OK {species['id']}: {photo['license_code']} · {photo['attribution']}")
        time.sleep(1.2)

    credits_path.write_text(json.dumps(credits, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
