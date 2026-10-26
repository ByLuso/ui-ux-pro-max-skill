"""
Kindle KFX Converter — Conversor universal a formato KFX
Entrada: EPUB, MOBI, AZW, AZW3, PDF, DOC, DOCX, TXT, HTML, RTF, FB2, LIT, ODT, CBZ, CBR
Salida : KFX (Kindle Format X), AZW3, MOBI
Requiere: Calibre + Plugin KFX Output  O  Kindle Previewer 3
"""

import os
import sys
import json
import queue
import shutil
import threading
import subprocess
import tkinter as tk
from tkinter import filedialog, messagebox
from pathlib import Path

import customtkinter as ctk

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

APP_NAME = "Kindle KFX Converter"
VERSION  = "2.0.0"
CONFIG_FILE = Path.home() / ".kindle_kfx_converter.json"

COLORS = {
    "bg":      "#0F1117",
    "surface": "#1A1D27",
    "card":    "#21253A",
    "border":  "#2E3354",
    "accent":  "#5B6EF7",
    "accent2": "#7C3AED",
    "success": "#22C55E",
    "warning": "#F59E0B",
    "error":   "#EF4444",
    "text":    "#E8EAFF",
    "subtext": "#8B91B5",
    "dim":     "#4A5080",
}

# Todos los formatos de entrada soportados por Calibre
SOURCE_EXTS = {
    ".epub", ".mobi", ".azw", ".azw3", ".pdf",
    ".doc", ".docx", ".txt", ".html", ".htm",
    ".rtf", ".lit", ".odt", ".fb2", ".djvu",
    ".cbz", ".cbr", ".htmlz", ".pdb", ".pml",
    ".lrf", ".rb", ".snb", ".tcr",
}

SOURCE_LABELS = {
    ".epub": "EPUB", ".mobi": "MOBI", ".azw": "AZW",
    ".azw3": "AZW3", ".pdf": "PDF", ".doc": "DOC",
    ".docx": "DOCX", ".txt": "TXT", ".html": "HTML",
    ".htm": "HTML", ".rtf": "RTF", ".lit": "LIT",
    ".odt": "ODT", ".fb2": "FB2", ".djvu": "DJVU",
    ".cbz": "CBZ", ".cbr": "CBR", ".htmlz": "HTMLZ",
    ".pdb": "PDB",
}

OUTPUT_FORMATS = ["KFX", "AZW3", "MOBI"]


# ── Detección de herramientas ─────────────────────────────────────────────────

def find_calibre() -> str | None:
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


def check_kfx_plugin() -> bool:
    """Busca el plugin KFX Output en las carpetas de plugins de Calibre."""
    plugin_dirs = [
        Path.home() / "AppData" / "Roaming" / "calibre" / "plugins",
        Path.home() / ".config" / "calibre" / "plugins",
        Path.home() / "Library" / "Preferences" / "calibre" / "plugins",
    ]
    for d in plugin_dirs:
        if d.exists() and (any(d.glob("KFX*")) or (d / "KFX Output.zip").exists()):
            return True
    return False


def find_kindle_previewer() -> str | None:
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


def detect_tools():
    calibre = find_calibre()
    kfx_plugin = check_kfx_plugin() if calibre else False
    kp3 = find_kindle_previewer()
    return calibre, kfx_plugin, kp3


def can_make_kfx(calibre, kfx_plugin, kp3) -> bool:
    return bool(kfx_plugin) or bool(kp3)


# ── Configuración ─────────────────────────────────────────────────────────────

def load_config() -> dict:
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text())
    except Exception:
        pass
    return {"output_dir": str(Path.home() / "Kindle KFX"), "format": "KFX"}


def save_config(cfg: dict):
    try:
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    except Exception:
        pass


# ── Widget: tarjeta de archivo ────────────────────────────────────────────────

class FileCard(ctk.CTkFrame):
    STATES = {
        "pending":    ("⏳", "#8B91B5"),
        "converting": ("⚙",  "#5B6EF7"),
        "done":       ("✓",  "#22C55E"),
        "error":      ("✕",  "#EF4444"),
    }

    def __init__(self, master, filepath: str, on_remove, **kw):
        super().__init__(master, fg_color=COLORS["card"],
                         corner_radius=10, **kw)
        self.filepath  = filepath
        self.on_remove = on_remove
        self._build()

    def _build(self):
        self.columnconfigure(1, weight=1)
        p   = Path(self.filepath)
        ext = p.suffix.lower()
        lbl = SOURCE_LABELS.get(ext, ext.upper().lstrip("."))

        badge = ctk.CTkLabel(self, text=lbl, width=52, height=22,
                             fg_color=COLORS["border"], corner_radius=6,
                             text_color=COLORS["subtext"],
                             font=ctk.CTkFont(size=10, weight="bold"))
        badge.grid(row=0, column=0, padx=(10, 6), pady=(10, 2), sticky="w")

        name_lbl = ctk.CTkLabel(self, text=f"  {p.stem}",
                                anchor="w", text_color=COLORS["text"],
                                font=ctk.CTkFont(size=13))
        name_lbl.grid(row=0, column=1, sticky="ew", padx=(0, 6), pady=(10, 2))

        self.prog_bar = ctk.CTkProgressBar(self, height=4,
                                           fg_color=COLORS["border"],
                                           progress_color=COLORS["accent"])
        self.prog_bar.set(0)
        self.prog_bar.grid(row=1, column=0, columnspan=3,
                           padx=10, pady=(2, 4), sticky="ew")

        self.state_lbl = ctk.CTkLabel(self, text="⏳  Pendiente",
                                      text_color=COLORS["subtext"],
                                      font=ctk.CTkFont(size=11))
        self.state_lbl.grid(row=0, column=2, padx=(0, 6))

        self.btn_rm = ctk.CTkButton(self, text="✕", width=28, height=28,
                                    fg_color="transparent",
                                    text_color=COLORS["dim"],
                                    hover_color=COLORS["error"],
                                    corner_radius=6,
                                    command=lambda: self.on_remove(self))
        self.btn_rm.grid(row=0, column=3, padx=(0, 8))

    def set_state(self, state: str, detail: str = ""):
        icon, color = self.STATES.get(state, ("?", COLORS["subtext"]))
        labels = {
            "pending":    "Pendiente",
            "converting": "Convirtiendo…",
            "done":       f"✓  {detail}" if detail else "Completado",
            "error":      f"Error: {detail}",
        }
        self.state_lbl.configure(text=f"{icon}  {labels.get(state, state)}" if state not in ("done", "error") else labels.get(state, state),
                                  text_color=color)
        if state == "done":
            self.state_lbl.configure(text=labels["done"])
        if state == "converting":
            self.prog_bar.configure(mode="indeterminate",
                                    progress_color=COLORS["accent"])
            self.prog_bar.start()
        elif state == "done":
            self.prog_bar.stop()
            self.prog_bar.configure(mode="determinate",
                                    progress_color=COLORS["success"])
            self.prog_bar.set(1)
        elif state == "error":
            self.prog_bar.stop()
            self.prog_bar.configure(mode="determinate",
                                    progress_color=COLORS["error"])
            self.prog_bar.set(1)

    def disable_remove(self): self.btn_rm.configure(state="disabled")
    def enable_remove(self):  self.btn_rm.configure(state="normal")


# ── Panel de herramientas ─────────────────────────────────────────────────────

class ToolStatusPanel(ctk.CTkFrame):
    def __init__(self, master, calibre, kfx_plugin, kp3, **kw):
        super().__init__(master, fg_color=COLORS["surface"],
                         corner_radius=10, border_width=1,
                         border_color=COLORS["border"], **kw)
        self._build(calibre, kfx_plugin, kp3)

    def _build(self, calibre, kfx_plugin, kp3):
        ctk.CTkLabel(self, text="Herramientas detectadas",
                     font=ctk.CTkFont(size=11, weight="bold"),
                     text_color=COLORS["subtext"]).pack(
                         anchor="w", padx=10, pady=(8, 4))

        tools = [
            ("Calibre",           bool(calibre),  "Necesario para conversión"),
            ("Plugin KFX Output", kfx_plugin,     "Para generar KFX via Calibre"),
            ("Kindle Previewer 3", bool(kp3),     "Alternativa para KFX"),
        ]
        for name, ok, hint in tools:
            row = ctk.CTkFrame(self, fg_color="transparent")
            row.pack(fill="x", padx=10, pady=2)
            dot = "●"
            color = COLORS["success"] if ok else COLORS["error"]
            ctk.CTkLabel(row, text=dot, text_color=color,
                         font=ctk.CTkFont(size=12)).pack(side="left")
            ctk.CTkLabel(row, text=f"  {name}",
                         text_color=COLORS["text"] if ok else COLORS["dim"],
                         font=ctk.CTkFont(size=12)).pack(side="left")
            ctk.CTkLabel(row, text=f"  — {hint}",
                         text_color=COLORS["dim"],
                         font=ctk.CTkFont(size=10)).pack(side="left")

        if not kfx_plugin and not kp3:
            warn = ctk.CTkFrame(self, fg_color="#2A1800", corner_radius=8)
            warn.pack(fill="x", padx=10, pady=(6, 8))
            msg = (
                "⚠  Para exportar KFX instala una de estas opciones:\n"
                "  A) Calibre → Preferencias → Complementos → busca 'KFX Output' e instala\n"
                "  B) Kindle Previewer 3 (gratis en amazon.com/kindleformat/kindlepreviewer)"
            )
            ctk.CTkLabel(warn, text=msg, text_color=COLORS["warning"],
                         font=ctk.CTkFont(size=11), justify="left",
                         wraplength=560).pack(padx=10, pady=6, anchor="w")
        else:
            ctk.CTkFrame(self, fg_color="transparent", height=4).pack()


# ── Ventana principal ─────────────────────────────────────────────────────────

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title(f"{APP_NAME}  v{VERSION}")
        self.geometry("860x740")
        self.minsize(700, 540)
        self.configure(fg_color=COLORS["bg"])

        self.cfg       = load_config()
        self.rows: list[FileCard] = []
        self.converting = False
        self.q: queue.Queue = queue.Queue()

        self.calibre, self.kfx_plugin, self.kp3 = detect_tools()

        self._build_ui()
        self.after(100, self._process_queue)

        try:
            self._enable_dnd()
        except Exception:
            pass

    # ── UI ───────────────────────────────────────────────────────────────────

    def _build_ui(self):
        # header
        hdr = ctk.CTkFrame(self, fg_color=COLORS["surface"],
                            corner_radius=0, height=64)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        ctk.CTkLabel(hdr, text="⚡  Kindle KFX Converter",
                     font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=COLORS["text"]).pack(side="left", padx=20)
        ctk.CTkLabel(hdr, text=f"v{VERSION}",
                     font=ctk.CTkFont(size=11),
                     text_color=COLORS["dim"]).pack(side="left")

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=20, pady=12)
        body.columnconfigure(0, weight=1)
        body.rowconfigure(2, weight=1)

        # panel de herramientas
        tool_panel = ToolStatusPanel(body, self.calibre,
                                      self.kfx_plugin, self.kp3)
        tool_panel.grid(row=0, column=0, sticky="ew", pady=(0, 10))

        # zona de drop
        drop = ctk.CTkFrame(body, fg_color=COLORS["surface"],
                             corner_radius=14, border_width=2,
                             border_color=COLORS["border"])
        drop.grid(row=1, column=0, sticky="ew", pady=(0, 10))
        inner = ctk.CTkFrame(drop, fg_color="transparent")
        inner.pack(pady=14)

        supported_txt = "EPUB · MOBI · AZW3 · PDF · DOC · TXT · FB2 · CBZ · RTF · ODT…"
        ctk.CTkLabel(inner,
                     text="⬆  Arrastra libros de cualquier formato",
                     font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=COLORS["subtext"]).pack()
        ctk.CTkLabel(inner, text=supported_txt,
                     font=ctk.CTkFont(size=11),
                     text_color=COLORS["dim"]).pack(pady=(2, 8))
        ctk.CTkButton(inner, text="+ Seleccionar archivos",
                      height=36, corner_radius=10,
                      fg_color=COLORS["accent"],
                      hover_color=COLORS["accent2"],
                      font=ctk.CTkFont(size=13, weight="bold"),
                      command=self._browse_files).pack()
        self.drop_zone = drop

        # lista
        list_card = ctk.CTkFrame(body, fg_color=COLORS["surface"],
                                  corner_radius=14)
        list_card.grid(row=2, column=0, sticky="nsew")
        list_card.columnconfigure(0, weight=1)
        list_card.rowconfigure(1, weight=1)

        list_hdr = ctk.CTkFrame(list_card, fg_color="transparent", height=40)
        list_hdr.grid(row=0, column=0, sticky="ew", padx=14, pady=(8, 0))
        list_hdr.columnconfigure(0, weight=1)
        ctk.CTkLabel(list_hdr, text="Archivos",
                     font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=COLORS["text"]).grid(row=0, column=0, sticky="w")
        self.clear_btn = ctk.CTkButton(list_hdr, text="Limpiar",
                                       width=80, height=26,
                                       fg_color=COLORS["border"],
                                       hover_color=COLORS["error"],
                                       text_color=COLORS["subtext"],
                                       corner_radius=8,
                                       font=ctk.CTkFont(size=11),
                                       command=self._clear_all)
        self.clear_btn.grid(row=0, column=1)

        scroll = ctk.CTkScrollableFrame(list_card,
                                         fg_color="transparent",
                                         scrollbar_button_color=COLORS["border"])
        scroll.grid(row=1, column=0, sticky="nsew", padx=10, pady=(4, 8))
        scroll.columnconfigure(0, weight=1)
        self.scroll_frame = scroll

        self.empty_lbl = ctk.CTkLabel(
            scroll,
            text="Sin archivos — arrastra o selecciona libros para comenzar",
            text_color=COLORS["dim"],
            font=ctk.CTkFont(size=12))
        self.empty_lbl.grid(row=0, column=0, pady=40)

        # footer
        footer = ctk.CTkFrame(body, fg_color=COLORS["surface"],
                               corner_radius=14)
        footer.grid(row=3, column=0, sticky="ew", pady=(10, 0))
        footer.columnconfigure(2, weight=1)

        ctk.CTkLabel(footer, text="Formato salida:",
                     text_color=COLORS["subtext"],
                     font=ctk.CTkFont(size=12)).grid(
                         row=0, column=0, padx=(16, 6), pady=14)

        self.fmt_var = ctk.StringVar(value=self.cfg.get("format", "KFX"))
        fmt_menu = ctk.CTkOptionMenu(footer, values=OUTPUT_FORMATS,
                                     variable=self.fmt_var,
                                     width=100, height=34,
                                     fg_color=COLORS["card"],
                                     button_color=COLORS["accent"],
                                     button_hover_color=COLORS["accent2"],
                                     dropdown_fg_color=COLORS["card"],
                                     text_color=COLORS["text"],
                                     corner_radius=8,
                                     command=self._on_format_change)
        fmt_menu.grid(row=0, column=1, pady=14)

        ctk.CTkLabel(footer, text="Destino:",
                     text_color=COLORS["subtext"],
                     font=ctk.CTkFont(size=12)).grid(
                         row=0, column=2, padx=(16, 6))
        self.out_var = ctk.StringVar(value=self.cfg.get(
            "output_dir", str(Path.home() / "Kindle KFX")))
        ctk.CTkEntry(footer, textvariable=self.out_var,
                     width=210, height=34,
                     fg_color=COLORS["card"],
                     border_color=COLORS["border"],
                     text_color=COLORS["text"],
                     corner_radius=8).grid(row=0, column=3, padx=(0, 6))
        ctk.CTkButton(footer, text="…", width=36, height=34,
                      fg_color=COLORS["border"],
                      hover_color=COLORS["accent"],
                      text_color=COLORS["text"],
                      corner_radius=8,
                      command=self._browse_output).grid(row=0, column=4, padx=(0, 6))

        self.convert_btn = ctk.CTkButton(
            footer, text="Convertir  ▶",
            height=40, width=150, corner_radius=10,
            fg_color=COLORS["accent"],
            hover_color=COLORS["accent2"],
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self._start_conversion)
        self.convert_btn.grid(row=0, column=5, padx=(0, 16))

        self.global_prog = ctk.CTkProgressBar(body, height=6,
                                               fg_color=COLORS["border"],
                                               progress_color=COLORS["accent"])
        self.global_prog.set(0)
        self.global_prog.grid(row=4, column=0, sticky="ew", pady=(8, 0))
        self.global_prog.grid_remove()

        self.status_lbl = ctk.CTkLabel(body, text="",
                                        text_color=COLORS["subtext"],
                                        font=ctk.CTkFont(size=11))
        self.status_lbl.grid(row=5, column=0, sticky="w", pady=(4, 0))

    # ── DnD ──────────────────────────────────────────────────────────────────

    def _enable_dnd(self):
        from tkinterdnd2 import DND_FILES  # type: ignore
        self.drop_zone.drop_target_register(DND_FILES)
        self.drop_zone.dnd_bind("<<Drop>>", self._on_drop)

    def _on_drop(self, event):
        self._add_files(self.tk.splitlist(event.data))

    # ── Archivos ──────────────────────────────────────────────────────────────

    def _browse_files(self):
        filetypes = [
            ("Libros electrónicos",
             "*.epub *.mobi *.azw *.azw3 *.pdf *.doc *.docx *.txt "
             "*.html *.htm *.rtf *.lit *.odt *.fb2 *.djvu *.cbz *.cbr *.pdb"),
            ("EPUB",  "*.epub"),
            ("MOBI",  "*.mobi"),
            ("AZW3",  "*.azw3"),
            ("PDF",   "*.pdf"),
            ("Word",  "*.doc *.docx"),
            ("Todos", "*.*"),
        ]
        paths = filedialog.askopenfilenames(
            title="Seleccionar libros", filetypes=filetypes)
        if paths:
            self._add_files(paths)

    def _add_files(self, paths):
        existing = {r.filepath for r in self.rows}
        added = 0
        for p in paths:
            p = str(p)
            if Path(p).suffix.lower() in SOURCE_EXTS and p not in existing:
                self._add_row(p)
                existing.add(p)
                added += 1
        if added:
            self._refresh_empty()
            self._set_status(f"{added} archivo(s) agregado(s). Total: {len(self.rows)}")

    def _add_row(self, filepath: str):
        row = FileCard(self.scroll_frame, filepath, on_remove=self._remove_row)
        row.grid(row=len(self.rows), column=0, sticky="ew", padx=4, pady=3)
        self.rows.append(row)

    def _remove_row(self, row: FileCard):
        if self.converting: return
        row.destroy()
        self.rows.remove(row)
        for i, r in enumerate(self.rows):
            r.grid_configure(row=i)
        self._refresh_empty()

    def _clear_all(self):
        if self.converting: return
        for r in self.rows: r.destroy()
        self.rows.clear()
        self._refresh_empty()
        self._set_status("")

    def _refresh_empty(self):
        if self.rows: self.empty_lbl.grid_remove()
        else:         self.empty_lbl.grid()

    def _browse_output(self):
        d = filedialog.askdirectory(title="Carpeta destino",
                                    initialdir=self.out_var.get())
        if d:
            self.out_var.set(d)
            self.cfg["output_dir"] = d
            save_config(self.cfg)

    def _on_format_change(self, val):
        if val == "KFX" and not can_make_kfx(self.calibre, self.kfx_plugin, self.kp3):
            messagebox.showwarning(
                "KFX no disponible",
                "Para convertir a KFX necesitas:\n\n"
                "  A) Calibre + Plugin 'KFX Output'\n"
                "     Calibre → Preferencias → Complementos → busca KFX Output\n\n"
                "  B) Kindle Previewer 3 (gratis de Amazon)\n\n"
                "Puedes convertir a AZW3 o MOBI sin plugins adicionales.")
        self.cfg["format"] = val
        save_config(self.cfg)

    # ── Conversión ────────────────────────────────────────────────────────────

    def _start_conversion(self):
        if not self.rows:
            messagebox.showwarning("Sin archivos", "Agrega al menos un libro.")
            return
        fmt = self.fmt_var.get()
        if fmt == "KFX" and not can_make_kfx(self.calibre, self.kfx_plugin, self.kp3):
            messagebox.showerror(
                "Herramienta KFX no encontrada",
                "Instala el Plugin 'KFX Output' en Calibre\n"
                "o Kindle Previewer 3 de Amazon para generar KFX.")
            return
        if not self.calibre and not self.kp3:
            messagebox.showerror("Sin herramientas",
                                  "Instala Calibre desde calibre-ebook.com")
            return
        if self.converting: return

        out_dir = Path(self.out_var.get())
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo crear la carpeta:\n{e}")
            return

        self.converting = True
        self.convert_btn.configure(state="disabled", text="Convirtiendo…")
        self.clear_btn.configure(state="disabled")
        for r in self.rows:
            r.disable_remove()
            r.set_state("pending")

        self.global_prog.set(0)
        self.global_prog.grid()

        fmt_lower = fmt.lower()
        t = threading.Thread(
            target=self._worker,
            args=(list(self.rows), out_dir, fmt_lower),
            daemon=True)
        t.start()

    def _worker(self, rows, out_dir: Path, fmt: str):
        total  = len(rows)
        done   = 0
        errors = 0

        for row in rows:
            self.q.put(("state", row, "converting", ""))
            src  = Path(row.filepath)
            dest = out_dir / f"{src.stem}.{fmt}"

            try:
                if fmt == "kfx" and self.kp3:
                    # Kindle Previewer 3 convierte a KFX
                    import tempfile
                    tmpdir = tempfile.mkdtemp(prefix="kfxconv_")
                    result = subprocess.run(
                        [self.kp3, str(src), "-convert", "-output", tmpdir],
                        capture_output=True, text=True, timeout=300)
                    # Buscar el .kfx generado
                    kfx_files = list(Path(tmpdir).glob("*.kfx")) + \
                                list(Path(tmpdir).glob("**/*.kfx"))
                    if kfx_files:
                        shutil.copy(str(kfx_files[0]), str(dest))
                        done += 1
                        self.q.put(("state", row, "done", dest.name))
                    else:
                        errors += 1
                        self.q.put(("state", row, "error",
                                    "KP3 no generó .kfx — prueba con AZW3"))
                    shutil.rmtree(tmpdir, ignore_errors=True)
                else:
                    # Calibre (con o sin plugin KFX)
                    tool = self.calibre or ""
                    result = subprocess.run(
                        [tool, str(src), str(dest)],
                        capture_output=True, text=True, timeout=300)
                    if result.returncode == 0 and dest.exists():
                        done += 1
                        self.q.put(("state", row, "done", dest.name))
                    elif fmt == "kfx":
                        # Fallback automático KFX → AZW3
                        fallback_dest = out_dir / f"{src.stem}.azw3"
                        result2 = subprocess.run(
                            [tool, str(src), str(fallback_dest)],
                            capture_output=True, text=True, timeout=300)
                        if result2.returncode == 0 and fallback_dest.exists():
                            done += 1
                            self.q.put(("state", row, "done",
                                        f"{fallback_dest.name}  (AZW3, sin plugin KFX)"))
                        else:
                            err = (result.stderr or result.stdout or
                                   "Error desconocido").strip()[:120]
                            errors += 1
                            self.q.put(("state", row, "error", err))
                    else:
                        err = (result.stderr or result.stdout or
                               "Error desconocido").strip()[:120]
                        errors += 1
                        self.q.put(("state", row, "error", err))
            except subprocess.TimeoutExpired:
                errors += 1
                self.q.put(("state", row, "error", "Tiempo agotado"))
            except Exception as e:
                errors += 1
                self.q.put(("state", row, "error", str(e)[:120]))

            self.q.put(("progress", (done + errors) / total))

        self.q.put(("done", done, errors, str(out_dir)))

    def _process_queue(self):
        try:
            while True:
                msg = self.q.get_nowait()
                if msg[0] == "state":
                    _, row, state, detail = msg
                    row.set_state(state, detail)
                elif msg[0] == "progress":
                    self.global_prog.set(msg[1])
                elif msg[0] == "done":
                    _, done, errors, out_dir = msg
                    self._on_done(done, errors, out_dir)
        except queue.Empty:
            pass
        self.after(80, self._process_queue)

    def _on_done(self, done, errors, out_dir):
        self.converting = False
        self.convert_btn.configure(state="normal", text="Convertir  ▶")
        self.clear_btn.configure(state="normal")
        for r in self.rows: r.enable_remove()

        if errors == 0:
            self.global_prog.configure(progress_color=COLORS["success"])
            self._set_status(f"✓  {done} libro(s) convertido(s) → {out_dir}")
            messagebox.showinfo("Completado",
                                f"{done} libro(s) convertido(s) correctamente.\n\nGuardados en:\n{out_dir}")
        else:
            self.global_prog.configure(progress_color=COLORS["warning"])
            self._set_status(f"⚠  {done} OK, {errors} con error → {out_dir}")
            messagebox.showwarning("Terminado con errores",
                                   f"{done} convertido(s) · {errors} con error\n"
                                   "Revisa cada archivo para ver el detalle.")

    def _set_status(self, msg: str):
        self.status_lbl.configure(text=msg)


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
