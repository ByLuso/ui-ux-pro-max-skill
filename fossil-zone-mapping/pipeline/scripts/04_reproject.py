#!/usr/bin/env python3
"""Paso 5: reproyecta el GeoTIFF combinado a EPSG:3857 (Web Mercator), el CRS que usan los
tiles XYZ estándar (y por tanto Leaflet). Remuestreo cúbico: bilineal ya vale para la mayoría de
casos, pero cúbico da bordes algo más suaves en el relieve fino que es justo lo que se quiere
resaltar aquí."""
import argparse

from common import load_zone, require_tool, run


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", required=True, help="Nombre o ruta del archivo zones/<zona>.yaml")
    args = parser.parse_args()

    zone = load_zone(args.zone)
    require_tool("gdalwarp", "Instala GDAL — ver pipeline/README.md.")
    if not zone.combined_path.exists():
        raise SystemExit(f"No existe {zone.combined_path} — ejecuta antes 03_combine.py para esta zona.")

    print(f"Reproyectando '{zone.name}' a EPSG:3857 (remuestreo cúbico)...")
    run(
        [
            "gdalwarp",
            "-t_srs",
            "EPSG:3857",
            "-r",
            "cubic",
            "-overwrite",
            str(zone.combined_path),
            str(zone.reprojected_path),
        ]
    )
    print(f"OK: {zone.reprojected_path}")


if __name__ == "__main__":
    main()
