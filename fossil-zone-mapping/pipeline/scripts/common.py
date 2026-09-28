"""Utilidades compartidas por los scripts numerados del pipeline (01_build_vrt.py, etc.)."""
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

PIPELINE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PIPELINE_DIR / "data"
OUTPUT_DIR = PIPELINE_DIR / "output"


@dataclass
class Zone:
    name: str
    lidar_source: str
    input_pattern: str
    laz_resolution_m: float
    laz_interpolation: str
    bbox_wgs84: list | None
    hillshade_z_factor: float
    lrm_radius_px: int
    zoom_min: int
    zoom_max: int

    @property
    def mdt_dir(self) -> Path:
        return DATA_DIR / "mdt" / self.name

    @property
    def laz_dir(self) -> Path:
        return DATA_DIR / "laz" / self.name

    @property
    def out_dir(self) -> Path:
        d = OUTPUT_DIR / self.name
        d.mkdir(parents=True, exist_ok=True)
        return d

    # Rutas de los productos intermedios y final, todas bajo output/<zone>/.
    @property
    def vrt_path(self) -> Path:
        return self.out_dir / f"{self.name}_dem.vrt"

    @property
    def laz_dem_path(self) -> Path:
        return self.out_dir / f"{self.name}_dem_from_laz.tif"

    @property
    def hillshade_path(self) -> Path:
        return self.out_dir / f"{self.name}_hillshade.tif"

    @property
    def svf_path(self) -> Path:
        return self.out_dir / f"{self.name}_svf.tif"

    @property
    def lrm_path(self) -> Path:
        return self.out_dir / f"{self.name}_lrm.tif"

    @property
    def combined_path(self) -> Path:
        return self.out_dir / f"{self.name}_combined_rgb.tif"

    @property
    def reprojected_path(self) -> Path:
        return self.out_dir / f"{self.name}_3857.tif"

    @property
    def pmtiles_path(self) -> Path:
        return self.out_dir / f"{self.name}.pmtiles"


def load_zone(zone_yaml: str) -> Zone:
    path = Path(zone_yaml)
    if not path.is_absolute():
        # Permite pasar tanto una ruta como solo el nombre ("pagasarri" -> zones/pagasarri.yaml).
        candidate = PIPELINE_DIR / "zones" / f"{zone_yaml}.yaml"
        path = candidate if candidate.exists() else PIPELINE_DIR / zone_yaml
    if not path.exists():
        die(f"No existe el archivo de zona: {path}")
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    return Zone(
        name=raw["name"],
        lidar_source=raw.get("lidar_source", "mdt"),
        input_pattern=raw.get("input_pattern", "*.tif"),
        laz_resolution_m=raw.get("laz_resolution_m", 0.5),
        laz_interpolation=raw.get("laz_interpolation", "tin"),
        bbox_wgs84=raw.get("bbox_wgs84"),
        hillshade_z_factor=raw.get("hillshade_z_factor", 1.3),
        lrm_radius_px=raw.get("lrm_radius_px", 15),
        zoom_min=raw.get("zoom_min", 12),
        zoom_max=raw.get("zoom_max", 20),
    )


def die(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def run(cmd: list[str], **kwargs) -> None:
    """Ejecuta un comando externo (gdal*, rio, pdal...) mostrando qué se ejecuta, y aborta con
    un mensaje claro si falla — en vez de dejar que el traceback de subprocess confunda a
    alguien que solo quiere saber qué paso del pipeline se rompió."""
    print(f"$ {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        die(f"El comando falló (código {result.returncode}): {' '.join(str(c) for c in cmd)}")


def require_tool(name: str, hint: str) -> None:
    import shutil

    if shutil.which(name) is None:
        die(f"No se encuentra '{name}' en el PATH. {hint}")
