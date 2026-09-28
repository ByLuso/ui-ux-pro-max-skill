#!/usr/bin/env python3
"""Paso 6: genera el .pmtiles final — un único archivo con toda la pirámide de tiles, sin
necesitar un servidor de teselas aparte (el frontend lo lee directamente por HTTP con
protomaps-leaflet, usando range requests).

Usa rio-pmtiles (`pip install rio-pmtiles`, viene en requirements.txt) en vez del CLI de Go
(pmtiles convert): hace exactamente lo mismo — teselar un raster y empaquetarlo en .pmtiles —
pero se instala con pip en el mismo entorno que el resto del pipeline, sin depender de un
binario aparte que además hay que buscar bajado a mano en Windows.
"""
import argparse

from common import load_zone, require_tool, run


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", required=True, help="Nombre o ruta del archivo zones/<zona>.yaml")
    args = parser.parse_args()

    zone = load_zone(args.zone)
    require_tool("rio", "Instala rio-pmtiles: `pip install rio-pmtiles` (ver pipeline/requirements.txt).")
    if not zone.reprojected_path.exists():
        raise SystemExit(f"No existe {zone.reprojected_path} — ejecuta antes 04_reproject.py para esta zona.")

    print(f"Generando {zone.name}.pmtiles (zoom {zone.zoom_min}-{zone.zoom_max})...")
    run(
        [
            "rio",
            "pmtiles",
            str(zone.reprojected_path),
            str(zone.pmtiles_path),
            "--overlay",
            "-f",
            "PNG",
            "--zoom-levels",
            f"{zone.zoom_min}..{zone.zoom_max}",
            "--name",
            zone.name,
            "--description",
            f"Relieve LiDAR (hillshade x SVF) — {zone.name}",
            "--attribution",
            "© IGN / CNIG",
        ]
    )
    print(f"OK: {zone.pmtiles_path}")
    print(
        "\nSiguiente paso: copia este archivo a fossil-zone-mapping/backend/data/pmtiles/ "
        f"(o el destino que configures) y añade '{zone.name}' a PMTILES_ZONES en "
        "backend/app/config.py — ver pipeline/README.md, apartado 'Integrarlo en la app'."
    )


if __name__ == "__main__":
    main()
