#!/usr/bin/env python3
"""Genera una rejilla de archivos zones/<prefijo>-NN.yaml a partir del contorno de un área
grande (una provincia/comunidad autónoma entera), para procesarla en sub-zonas pequeñas en vez
de una sola pasada gigante — necesario con poca RAM/disco, ver pipeline/README.md, apartado
"Provincias/comunidades autónomas enteras".

Todas las sub-zonas comparten la misma carpeta de hojas descargadas (--source-dir): cada una
recorta esa carpeta común a su propio trozo del área (gdalbuildvrt + -te en 01_build_vrt.py), así
que no hace falta duplicar los MDT de entrada por cada sub-zona.

Uso:
    python make_grid_zones.py --bbox -3.15 41.95 -1.70 42.65 --tile-km 30 --prefix la-rioja --source-dir la-rioja

Eso deja listos zones/la-rioja-01.yaml, zones/la-rioja-02.yaml, ... — cada uno se procesa con
run_pipeline.py como cualquier otra zona.
"""
import argparse
import math

import yaml

from common import PIPELINE_DIR

KM_PER_DEG_LAT = 111.32


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("OESTE", "SUR", "ESTE", "NORTE"), required=True)
    parser.add_argument("--tile-km", type=float, default=30, help="Lado aproximado de cada sub-zona, en km.")
    parser.add_argument("--prefix", required=True, help="Prefijo de nombre para las sub-zonas (p. ej. 'la-rioja').")
    parser.add_argument(
        "--source-dir",
        required=True,
        help="Carpeta dentro de data/mdt/ con TODAS las hojas descargadas para el área completa "
        "(la comparten todas las sub-zonas, cada una recortando su propio trozo).",
    )
    parser.add_argument("--zoom-min", type=int, default=12)
    parser.add_argument("--zoom-max", type=int, default=17)
    parser.add_argument(
        "--keep-lrm",
        action="store_true",
        help="Calcular también el LRM en cada sub-zona (por defecto se omite: no entra en la "
        "mezcla final y con muchas sub-zonas ahorra bastante tiempo/disco).",
    )
    args = parser.parse_args()

    west, south, east, north = args.bbox
    if west >= east or south >= north:
        raise SystemExit("Bbox inválida: esperaba OESTE SUR ESTE NORTE con OESTE<ESTE y SUR<NORTE.")

    km_per_deg_lon = KM_PER_DEG_LAT * math.cos(math.radians((south + north) / 2))
    n_cols = max(1, math.ceil((east - west) * km_per_deg_lon / args.tile_km))
    n_rows = max(1, math.ceil((north - south) * KM_PER_DEG_LAT / args.tile_km))
    lon_step = (east - west) / n_cols
    lat_step = (north - south) / n_rows

    zones_dir = PIPELINE_DIR / "zones"
    zones_dir.mkdir(exist_ok=True)

    created = []
    n = 0
    for row in range(n_rows):
        for col in range(n_cols):
            n += 1
            tile_west = west + col * lon_step
            tile_east = west + (col + 1) * lon_step
            tile_south = south + row * lat_step
            tile_north = south + (row + 1) * lat_step
            name = f"{args.prefix}-{n:02d}"
            zone_config = {
                "name": name,
                "lidar_source": "mdt",
                "input_pattern": "*.tif",
                "source_dir": args.source_dir,
                "bbox_wgs84": [tile_west, tile_south, tile_east, tile_north],
                "hillshade_z_factor": 1.3,
                "lrm_radius_px": 15,
                "skip_lrm": not args.keep_lrm,
                "zoom_min": args.zoom_min,
                "zoom_max": args.zoom_max,
            }
            path = zones_dir / f"{name}.yaml"
            with open(path, "w", encoding="utf-8") as f:
                yaml.safe_dump(zone_config, f, sort_keys=False, allow_unicode=True)
            created.append(name)

    print(f"Rejilla de {n_rows}x{n_cols} = {len(created)} sub-zonas (~{args.tile_km} km de lado cada una):")
    for name in created:
        print(f"  zones/{name}.yaml")
    print(
        f"\nAntes de procesarlas, pon TODAS las hojas MDT que cubran el área completa en "
        f"data/mdt/{args.source_dir}/ (una sola vez, no hace falta repartirlas por sub-zona)."
    )
    print("\nPara procesarlas todas en orden (cada una limpia sus intermedios al terminar):")
    print("  for /F %z in (" + " ".join(created) + ") do python run_pipeline.py --zone %z")
    print("(en PowerShell: foreach ($z in @(" + ",".join(f'"{c}"' for c in created) + ")) { python run_pipeline.py --zone $z }" + ")")


if __name__ == "__main__":
    main()
