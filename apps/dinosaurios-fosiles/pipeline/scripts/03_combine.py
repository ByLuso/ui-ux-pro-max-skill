#!/usr/bin/env python3
"""Paso 4: combina hillshade + SVF en un único GeoTIFF de 8 bits con buen contraste.

El hillshade da volumen (luces/sombras direccionales) y el SVF da el "cielo visible" de cada
punto (resalta cauces y hondonadas sin depender de una dirección de luz); multiplicarlos combina
lo mejor de los dos. Se guarda en RGB (banda repetida x3, no color real) porque el paso de
tiles (rio-pmtiles) exige un raster de al menos 3 bandas.
"""
import argparse

import numpy as np
import rasterio

from common import load_zone


def stretch_percentile(array: np.ndarray, low_pct: float = 2, high_pct: float = 98) -> np.ndarray:
    low, high = np.nanpercentile(array, [low_pct, high_pct])
    if high <= low:
        return np.zeros_like(array)
    return np.clip((array - low) / (high - low), 0, 1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", required=True, help="Nombre o ruta del archivo zones/<zona>.yaml")
    args = parser.parse_args()

    zone = load_zone(args.zone)
    if not zone.hillshade_path.exists() or not zone.svf_path.exists():
        raise SystemExit(
            f"Faltan {zone.hillshade_path} y/o {zone.svf_path} — ejecuta antes 02_generate_relief.py."
        )

    print("Combinando hillshade x SVF...")
    with rasterio.open(zone.hillshade_path) as hs_src:
        hillshade = hs_src.read(1).astype("float64") / 255.0
        profile = hs_src.profile

    with rasterio.open(zone.svf_path) as svf_src:
        svf = svf_src.read(1, masked=True).filled(np.nan).astype("float64")
        # El SVF de RVT puede venir a distinta resolución/tamaño si algún borde se recortó de
        # forma distinta al calcularlo; si no coincide con el hillshade, es un bug de un paso
        # anterior — mejor fallar aquí con un mensaje claro que combinar arrays desalineados.
        if svf.shape != hillshade.shape:
            raise SystemExit(
                f"El SVF ({svf.shape}) y el hillshade ({hillshade.shape}) no tienen el mismo "
                f"tamaño — revisa 02_generate_relief.py para esta zona."
            )

    combined = hillshade * np.nan_to_num(svf, nan=np.nanmean(svf))
    combined = stretch_percentile(combined)
    img_uint8 = (combined * 255).astype("uint8")

    out_profile = {
        **profile,
        "dtype": "uint8",
        "count": 3,
        "nodata": None,
        "photometric": "RGB",
    }
    with rasterio.open(zone.combined_path, "w", **out_profile) as dst:
        for band in (1, 2, 3):
            dst.write(img_uint8, band)

    print(f"OK: {zone.combined_path}")


if __name__ == "__main__":
    main()
