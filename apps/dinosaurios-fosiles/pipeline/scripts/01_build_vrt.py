#!/usr/bin/env python3
"""Paso 2: combina todas las hojas MDT (o el MDT generado desde .laz en el paso 1b) de una zona
en un único VRT sin costuras entre hojas (gdalbuildvrt respeta el nodata de cada una)."""
import argparse

from common import load_zone, require_tool, run


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", required=True, help="Nombre o ruta del archivo zones/<zona>.yaml")
    args = parser.parse_args()

    zone = load_zone(args.zone)
    require_tool("gdalbuildvrt", "Instala GDAL — ver pipeline/README.md.")

    if zone.lidar_source == "laz":
        if not zone.laz_dem_path.exists():
            raise SystemExit(
                f"No existe {zone.laz_dem_path} — ejecuta antes 00_laz_to_dem.py para esta zona."
            )
        sources = [zone.laz_dem_path]
    else:
        sources = sorted(zone.mdt_dir.glob(zone.input_pattern))
        if not sources:
            raise SystemExit(
                f"No hay archivos que coincidan con '{zone.input_pattern}' en {zone.mdt_dir}. "
                f"Pon ahí las hojas MDT02/MDT01 descargadas del CNIG."
            )

    print(f"Construyendo VRT de '{zone.name}' a partir de {len(sources)} archivo(s)...")
    cmd = ["gdalbuildvrt", "-r", "bilinear"]
    if zone.bbox_wgs84:
        west, south, east, north = zone.bbox_wgs84
        # gdalbuildvrt recorta con -te en el CRS de las fuentes; como el bbox del zona.yaml está
        # en WGS84 y las hojas MDT suelen venir en EPSG:25830, reproyectamos el rectángulo antes.
        from osgeo import osr

        src_srs = osr.SpatialReference()
        src_srs.ImportFromEPSG(4326)
        src_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        dst_srs = osr.SpatialReference()
        dst_srs.ImportFromEPSG(25830)
        transform = osr.CoordinateTransformation(src_srs, dst_srs)
        minx, miny, _ = transform.TransformPoint(west, south)
        maxx, maxy, _ = transform.TransformPoint(east, north)
        cmd += ["-te", str(minx), str(miny), str(maxx), str(maxy)]
    cmd += [str(zone.vrt_path), *[str(s) for s in sources]]
    run(cmd)
    print(f"OK: {zone.vrt_path}")


if __name__ == "__main__":
    main()
