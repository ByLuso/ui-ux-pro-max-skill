"""
Kindle KFX Converter API
Convierte cualquier formato de libro a KFX, AZW3 o MOBI usando
Calibre + Plugin KFX Output  o  Kindle Previewer 3.
"""

import os
import glob
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="Kindle KFX Converter API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Formatos de entrada soportados por Calibre
SUPPORTED_INPUT = {
    ".epub", ".mobi", ".azw", ".azw3", ".pdf",
    ".doc", ".docx", ".txt", ".html", ".htm",
    ".rtf", ".lit", ".odt", ".fb2", ".djvu",
    ".cbz", ".cbr", ".htmlz", ".pdb",
}

SUPPORTED_OUTPUT = {"kfx", "azw3", "mobi", "epub"}

CALIBRE_PATH: str | None      = None
KFX_PLUGIN_AVAILABLE: bool    = False
KINDLE_PREVIEWER: str | None  = None


# ── Detección de herramientas ─────────────────────────────────────────────────

def _find_calibre() -> str | None:
    candidates = [
        "ebook-convert",
        r"C:\Program Files\Calibre2\ebook-convert.exe",
        r"C:\Program Files (x86)\Calibre2\ebook-convert.exe",
        "/usr/bin/ebook-convert",
        "/usr/local/bin/ebook-convert",
        "/Applications/calibre.app/Contents/MacOS/ebook-convert",
    ]
    for c in candidates:
        p = shutil.which(c) or (c if os.path.isfile(c) else None)
        if p:
            return p
    return None


def _check_kfx_plugin() -> bool:
    plugin_dirs = [
        Path.home() / "AppData" / "Roaming" / "calibre" / "plugins",
        Path.home() / ".config" / "calibre" / "plugins",
        Path.home() / "Library" / "Preferences" / "calibre" / "plugins",
    ]
    for d in plugin_dirs:
        if d.exists() and (any(d.glob("KFX*")) or (d / "KFX Output.zip").exists()):
            return True
    return False


def _find_kindle_previewer() -> str | None:
    user = Path.home()
    candidates = [
        user / "AppData" / "Local" / "Amazon" / "Kindle Previewer 3" / "Kindle Previewer 3.exe",
        Path("/Applications/Kindle Previewer 3.app/Contents/MacOS/Kindle Previewer 3"),
        Path(shutil.which("kindlepreviewer") or ""),
        Path(shutil.which("Kindle Previewer 3") or ""),
    ]
    for c in candidates:
        if c and c.is_file():
            return str(c)
    return None


@app.on_event("startup")
async def startup():
    global CALIBRE_PATH, KFX_PLUGIN_AVAILABLE, KINDLE_PREVIEWER
    CALIBRE_PATH         = _find_calibre()
    KFX_PLUGIN_AVAILABLE = _check_kfx_plugin() if CALIBRE_PATH else False
    KINDLE_PREVIEWER     = _find_kindle_previewer()

    print(f"Calibre:          {CALIBRE_PATH or 'NO encontrado'}")
    print(f"Plugin KFX:       {'instalado' if KFX_PLUGIN_AVAILABLE else 'NO instalado'}")
    print(f"Kindle Previewer: {KINDLE_PREVIEWER or 'NO encontrado'}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status":         "ok",
        "calibre":        CALIBRE_PATH is not None,
        "kfx_plugin":     KFX_PLUGIN_AVAILABLE,
        "kindle_previewer": KINDLE_PREVIEWER is not None,
        "can_make_kfx":   KFX_PLUGIN_AVAILABLE or (KINDLE_PREVIEWER is not None),
        "supported_input":  sorted(SUPPORTED_INPUT),
        "supported_output": sorted(SUPPORTED_OUTPUT),
    }


@app.post("/convert")
async def convert(
    background_tasks: BackgroundTasks,
    file:   UploadFile = File(...),
    format: str        = Form(default="kfx"),
):
    fmt = format.lower().strip(".")
    if fmt not in SUPPORTED_OUTPUT:
        raise HTTPException(400, f"Formato de salida no soportado: {format}. "
                                 f"Opciones: {', '.join(sorted(SUPPORTED_OUTPUT))}")

    filename = file.filename or "libro"
    ext      = Path(filename).suffix.lower()
    if ext not in SUPPORTED_INPUT:
        raise HTTPException(400, f"Formato de entrada no soportado: {ext}")

    # Fallback automático: KFX → AZW3 si no hay herramientas KFX
    used_fallback = False
    if fmt == "kfx" and not KFX_PLUGIN_AVAILABLE and not KINDLE_PREVIEWER:
        if CALIBRE_PATH:
            fmt          = "azw3"
            used_fallback = True
        else:
            raise HTTPException(503,
                "Calibre no encontrado. Instálalo en calibre-ebook.com\n"
                "Para KFX además instala el plugin 'KFX Output' en Calibre.")
    elif fmt != "kfx" and not CALIBRE_PATH:
        raise HTTPException(503, "Calibre no está instalado.")

    tmpdir = tempfile.mkdtemp(prefix="kfxapi_")
    try:
        # Guardar archivo de entrada
        input_path = os.path.join(tmpdir, filename)
        content    = await file.read()
        with open(input_path, "wb") as f:
            f.write(content)

        stem        = Path(filename).stem
        output_name = f"{stem}.{fmt}"
        output_path = os.path.join(tmpdir, output_name)

        # Estrategia de conversión
        if fmt == "kfx" and KINDLE_PREVIEWER and not KFX_PLUGIN_AVAILABLE:
            # Opción A: Kindle Previewer 3
            kp3_outdir = os.path.join(tmpdir, "kp3out")
            os.makedirs(kp3_outdir)
            result = subprocess.run(
                [KINDLE_PREVIEWER, input_path, "-convert", "-output", kp3_outdir],
                capture_output=True, text=True, timeout=300)
            kfx_files = (glob.glob(os.path.join(kp3_outdir, "*.kfx")) +
                         glob.glob(os.path.join(kp3_outdir, "**", "*.kfx"),
                                   recursive=True))
            if not kfx_files:
                err = (result.stderr or result.stdout or "Sin salida").strip()[:200]
                raise HTTPException(500,
                    f"Kindle Previewer no generó .kfx. {err}\n"
                    "Prueba instalar el plugin KFX Output en Calibre.")
            shutil.copy(kfx_files[0], output_path)

        else:
            # Opción B: Calibre (con plugin KFX si es necesario)
            tool = CALIBRE_PATH or ""
            result = subprocess.run(
                [tool, input_path, output_path],
                capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                err = (result.stderr or result.stdout or "Error desconocido").strip()[:300]
                raise HTTPException(500, f"Error de conversión: {err}")

        if not os.path.exists(output_path):
            raise HTTPException(500, "El archivo convertido no fue generado.")

        background_tasks.add_task(shutil.rmtree, tmpdir, True)

        # Cabecera informativa si se usó fallback
        headers = {}
        if used_fallback:
            headers["X-Fallback-Format"] = "azw3"
            headers["X-Fallback-Reason"]  = "KFX tools not available; converted to AZW3"

        return FileResponse(
            output_path,
            filename=output_name,
            media_type="application/octet-stream",
            headers=headers,
        )

    except subprocess.TimeoutExpired:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(504, "Tiempo agotado (máx. 5 min).")
    except HTTPException:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(500, str(e))
