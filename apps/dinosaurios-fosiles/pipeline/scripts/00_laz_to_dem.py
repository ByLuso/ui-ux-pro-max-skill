#!/usr/bin/env python3
"""Paso 1b (opcional): genera un MDT propio a partir de nubes de puntos PNOA-LiDAR (.laz) con
PDAL, cuando hay .laz disponibles para la zona y se quiere más resolución que las hojas MDT02/
MDT01 del CNIG (0,5-1 m en vez de 2 m). Solo se ejecuta si zones/<zona>.yaml tiene
`lidar_source: laz`; run_pipeline.py lo salta automáticamente si no.

Requiere PDAL instalado (no es un paquete pip normal — ver pipeline/README.md, apartado PDAL).
"""
import argparse
import json
import sys
from pathlib import Path

from common import load_zone, require_tool, run


def build_pdal_pipeline(zone) -> dict:
    laz_files = sorted(str(p) for p in zone.laz_dir.glob("*.laz"))
    if not laz_files:
        print(f"ERROR: no hay archivos .laz en {zone.laz_dir}", file=sys.stderr)
        sys.exit(1)

    # Filtra clase 2 (suelo, clasificación ASPRS estándar que usa PNOA-LiDAR) y descarta el
    # resto (vegetación, edificios...) antes de mallar: es lo que da un MDT (terreno desnudo) en
    # vez de un MDS (superficie, con copas de árboles y tejados incluidos).
    readers = [{"type": "readers.las", "filename": f} for f in laz_files]
    pipeline = {
        "pipeline": [
            *readers,
            {"type": "filters.merge"},
            {"type": "filters.range", "limits": "Classification[2:2]"},
            {
                "type": "writers.gdal",
                "filename": str(zone.laz_dem_path),
                "resolution": zone.laz_resolution_m,
                "output_type": "idw" if zone.laz_interpolation == "idw" else "mean",
                "gdaldriver": "GTiff",
            },
        ]
    }
    return pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", required=True, help="Nombre o ruta del archivo zones/<zona>.yaml")
    args = parser.parse_args()

    zone = load_zone(args.zone)
    if zone.lidar_source != "laz":
        print(f"Zona '{zone.name}' tiene lidar_source={zone.lidar_source!r}, no 'laz' — nada que hacer.")
        return

    require_tool(
        "pdal",
        "Instálalo con conda/mamba: `conda install -c conda-forge pdal` "
        "(no hay paquete pip ni apt oficial para PDAL). Ver pipeline/README.md.",
    )

    pipeline_json = zone.out_dir / f"{zone.name}_pdal_pipeline.json"
    pipeline_json.write_text(json.dumps(build_pdal_pipeline(zone), indent=2), encoding="utf-8")

    print(f"Generando MDT desde .laz para '{zone.name}' ({zone.laz_interpolation}, {zone.laz_resolution_m} m/px)...")
    run(["pdal", "pipeline", str(pipeline_json)])
    print(f"OK: {zone.laz_dem_path}")


if __name__ == "__main__":
    main()
