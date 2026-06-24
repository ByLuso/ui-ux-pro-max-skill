"""
Kindle Converter API — FastAPI backend
Corre en tu PC; la app móvil le envía archivos para convertir con Calibre.
"""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="Kindle Converter API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CALIBRE_PATH: str | None = None


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
        path = shutil.which(c) or (c if os.path.isfile(c) else None)
        if path:
            return path
    return None


@app.on_event("startup")
async def startup():
    global CALIBRE_PATH
    CALIBRE_PATH = _find_calibre()
    if CALIBRE_PATH:
        print(f"✓ Calibre encontrado: {CALIBRE_PATH}")
    else:
        print("⚠ Calibre no encontrado. Instálalo en calibre-ebook.com")


@app.get("/health")
async def health():
    return {
        "status":       "ok",
        "calibre":      CALIBRE_PATH is not None,
        "calibre_path": CALIBRE_PATH,
    }


@app.post("/convert")
async def convert(
    background_tasks: BackgroundTasks,
    file:   UploadFile = File(...),
    format: str        = Form(default="mobi"),
):
    if not CALIBRE_PATH:
        raise HTTPException(503, "Calibre no está instalado en este servidor.")

    format = format.lower()
    if format not in ("mobi", "azw3", "epub"):
        raise HTTPException(400, f"Formato no válido: {format}")

    filename = file.filename or "documento"
    ext = Path(filename).suffix.lower()
    if ext not in (".pdf", ".epub"):
        raise HTTPException(400, f"Formato de entrada no soportado: {ext}")

    tmpdir = tempfile.mkdtemp(prefix="kindle_")
    try:
        input_path  = os.path.join(tmpdir, filename)
        output_name = f"{Path(filename).stem}.{format}"
        output_path = os.path.join(tmpdir, output_name)

        content = await file.read()
        with open(input_path, "wb") as f:
            f.write(content)

        result = subprocess.run(
            [CALIBRE_PATH, input_path, output_path],
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            err = (result.stderr or result.stdout or "Error desconocido").strip()
            raise HTTPException(500, f"Error de conversión: {err[:300]}")

        if not os.path.exists(output_path):
            raise HTTPException(500, "El archivo convertido no fue generado.")

        background_tasks.add_task(shutil.rmtree, tmpdir, True)
        return FileResponse(
            output_path,
            filename=output_name,
            media_type="application/octet-stream",
        )

    except subprocess.TimeoutExpired:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(504, "Tiempo de conversión agotado (máx. 5 min).")
    except HTTPException:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(500, str(e))
