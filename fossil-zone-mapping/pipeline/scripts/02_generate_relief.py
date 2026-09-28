#!/usr/bin/env python3
"""Paso 3: genera los tres productos de visualización de relieve desde el VRT.

- Hillshade multidireccional (gdaldem, 4 azimuts combinados: sin esto, el relieve alineado con
  la única dirección de luz de un hillshade clásico queda invisible).
- Sky-View Factor (RVT): cuánto "cielo" ve cada píxel — resalta cauces, hondonadas y bordes sin
  depender de una dirección de luz, complementario al hillshade.
- Simple Local Relief Model (RVT): resta un modelo suavizado del terreno al terreno real, dejando
  solo las microformas (muros, terraplenes, ruinas) — el mejor de los tres para eso, aunque no
  entra en el producto combinado del paso 4 (se guarda aparte por si se quiere como capa propia
  más adelante).
"""
import argparse

import numpy as np
import rasterio
import rvt.vis as vis

from common import load_zone, require_tool, run


def _read_dem(vrt_path):
    with rasterio.open(vrt_path) as src:
        dem = src.read(1, masked=True).filled(np.nan).astype("float64")
        profile = src.profile
        pixel_size = src.transform.a
    return dem, profile, pixel_size


def generate_svf(zone, dem, pixel_size, profile) -> None:
    print("Calculando Sky-View Factor (RVT)...")
    result = vis.sky_view_factor(dem, resolution=pixel_size, compute_svf=True, svf_n_dir=16, svf_r_max=10)
    svf = result["svf"].astype("float32")
    # profile viene de leer el VRT (driver "VRT"); hay que forzar GTiff para escribir un archivo
    # normal, si no rasterio intenta escribir a través del VRT (que es de solo lectura) y falla.
    out_profile = {**profile, "driver": "GTiff", "dtype": "float32", "count": 1, "nodata": np.nan}
    with rasterio.open(zone.svf_path, "w", **out_profile) as dst:
        dst.write(svf, 1)
    print(f"OK: {zone.svf_path}")


def generate_lrm(zone, dem, profile) -> None:
    print(f"Calculando Simple Local Relief Model (RVT, radio {zone.lrm_radius_px} px)...")
    lrm = vis.slrm(dem, radius_cell=zone.lrm_radius_px).astype("float32")
    out_profile = {**profile, "driver": "GTiff", "dtype": "float32", "count": 1, "nodata": np.nan}
    with rasterio.open(zone.lrm_path, "w", **out_profile) as dst:
        dst.write(lrm, 1)
    print(f"OK: {zone.lrm_path}")


def generate_hillshade(zone) -> None:
    print(f"Calculando hillshade multidireccional (gdaldem, z-factor {zone.hillshade_z_factor})...")
    run(
        [
            "gdaldem",
            "hillshade",
            "-multidirectional",
            "-z",
            str(zone.hillshade_z_factor),
            "-of",
            "GTiff",
            str(zone.vrt_path),
            str(zone.hillshade_path),
        ]
    )
    print(f"OK: {zone.hillshade_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", required=True, help="Nombre o ruta del archivo zones/<zona>.yaml")
    args = parser.parse_args()

    zone = load_zone(args.zone)
    require_tool("gdaldem", "Instala GDAL — ver pipeline/README.md.")
    if not zone.vrt_path.exists():
        raise SystemExit(f"No existe {zone.vrt_path} — ejecuta antes 01_build_vrt.py para esta zona.")

    generate_hillshade(zone)

    dem, profile, pixel_size = _read_dem(zone.vrt_path)
    generate_svf(zone, dem, pixel_size, profile)
    if zone.skip_lrm:
        # Para zonas grandes/con poco disco o RAM (p. ej. sub-zonas de una rejilla de
        # provincia): el LRM no entra en la mezcla final del paso 4, así que si no hace falta
        # como capa aparte, saltarlo ahorra un array más en memoria y varios GB en disco.
        print("skip_lrm activo: no se calcula el Simple Local Relief Model para esta zona.")
    else:
        generate_lrm(zone, dem, profile)


if __name__ == "__main__":
    main()
