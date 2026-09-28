#!/usr/bin/env python3
"""Ejecuta el pipeline completo para una zona: 00 (si toca) -> 01 -> 02 -> 03 -> 04 -> 05.

Uso:
    python run_pipeline.py --zone zones/pagasarri.yaml
    python run_pipeline.py --zone pagasarri          # también vale solo el nombre

Cada paso se puede ejecutar también suelto (python 02_generate_relief.py --zone ...) si solo
hace falta repetir uno tras cambiar un parámetro del zones/<zona>.yaml (p. ej. el zoom o el
z-factor del hillshade no obligan a rehacer el VRT).
"""
import argparse
import runpy
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_zone  # noqa: E402


def run_step(script_name: str, zone_arg: str) -> None:
    script_path = Path(__file__).resolve().parent / script_name
    old_argv = sys.argv
    sys.argv = [str(script_path), "--zone", zone_arg]
    try:
        runpy.run_path(str(script_path), run_name="__main__")
    finally:
        sys.argv = old_argv


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--zone", required=True, help="Nombre o ruta del archivo zones/<zona>.yaml")
    parser.add_argument(
        "--from-step",
        type=int,
        default=1,
        help="Empezar desde este paso (1-5) en vez de desde el principio, para reanudar tras un fallo.",
    )
    parser.add_argument(
        "--keep-intermediates",
        action="store_true",
        help="No borrar los GeoTIFF intermedios (VRT, hillshade, SVF, combinado, reproyectado) "
        "al terminar. Por defecto SÍ se borran tras generar el .pmtiles, para poder procesar "
        "muchas sub-zonas de una provincia sin agotar el disco — si vas a reprocesar esta misma "
        "zona varias veces seguidas (probando parámetros), usa esta opción para no repetir los "
        "pasos 1-4 cada vez.",
    )
    args = parser.parse_args()

    zone = load_zone(args.zone)
    steps = [
        ("01_build_vrt.py", "1/5 — Construir VRT"),
        ("02_generate_relief.py", "2/5 — Hillshade + SVF + LRM"),
        ("03_combine.py", "3/5 — Combinar hillshade x SVF"),
        ("04_reproject.py", "4/5 — Reproyectar a EPSG:3857"),
        ("05_generate_pmtiles.py", "5/5 — Generar .pmtiles"),
    ]

    if zone.lidar_source == "laz":
        steps.insert(0, ("00_laz_to_dem.py", "0/5 — Generar MDT desde .laz (PDAL)"))

    print(f"=== Pipeline para la zona '{zone.name}' ({len(steps)} pasos) ===\n")
    start = time.time()
    for i, (script, label) in enumerate(steps, start=1):
        if i < args.from_step:
            print(f"[{label}] omitido (--from-step {args.from_step})")
            continue
        print(f"\n--- {label} ---")
        step_start = time.time()
        run_step(script, args.zone)
        print(f"({time.time() - step_start:.1f}s)")

    if not args.keep_intermediates:
        print("\nLimpiando intermedios (usa --keep-intermediates para conservarlos)...")
        zone.cleanup_intermediates()

    print(f"\n=== Listo en {time.time() - start:.1f}s: {zone.pmtiles_path} ===")


if __name__ == "__main__":
    main()
