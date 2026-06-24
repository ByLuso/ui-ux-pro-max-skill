"""
Kindle Converter — PDF/EPUB a MOBI/AZW3
Requiere: customtkinter, Calibre instalado en el sistema
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

# ── Configuración visual ──────────────────────────────────────────────────────
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

APP_NAME = "Kindle Converter"
VERSION  = "1.0.0"
CONFIG_FILE = Path.home() / ".kindle_converter_config.json"

COLORS = {
    "bg":       "#0F1117",
    "surface":  "#1A1D27",
    "card":     "#21253A",
    "border":   "#2E3354",
    "accent":   "#5B6EF7",
    "accent2":  "#7C3AED",
    "success":  "#22C55E",
    "warning":  "#F59E0B",
    "error":    "#EF4444",
    "text":     "#E8EAFF",
    "subtext":  "#8B91B5",
    "dim":      "#4A5080",
}

KINDLE_FORMATS = ["MOBI", "AZW3", "EPUB"]
SOURCE_EXTS    = {".pdf", ".epub"}


# ── Utilidades ────────────────────────────────────────────────────────────────

def find_calibre_convert() -> str | None:
    """Devuelve la ruta a ebook-convert de Calibre, o None si no está."""
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


def load_config() -> dict:
    try:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text())
    except Exception:
        pass
    return {"output_dir": str(Path.home() / "Kindle Converted"), "format": "MOBI"}


def save_config(cfg: dict):
    try:
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    except Exception:
        pass


# ── Widget: fila de archivo ───────────────────────────────────────────────────

class FileRow(ctk.CTkFrame):
    STATES = {
        "pending":    ("⏳", "#8B91B5"),
        "converting": ("⚙️", "#5B6EF7"),
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

        p    = Path(self.filepath)
        icon = "📄" if p.suffix.lower() == ".pdf" else "📖"
        ext  = p.suffix.upper().lstrip(".")

        # badge tipo
        badge = ctk.CTkLabel(self, text=ext, width=46, height=22,
                             fg_color=COLORS["border"], corner_radius=6,
                             text_color=COLORS["subtext"],
                             font=ctk.CTkFont(size=10, weight="bold"))
        badge.grid(row=0, column=0, padx=(10, 6), pady=8, sticky="w")

        # nombre
        name_lbl = ctk.CTkLabel(self, text=f"{icon}  {p.stem}",
                                anchor="w", text_color=COLORS["text"],
                                font=ctk.CTkFont(size=13))
        name_lbl.grid(row=0, column=1, sticky="ew", padx=(0, 6))

        # progreso
        self.prog_bar = ctk.CTkProgressBar(self, height=4,
                                           fg_color=COLORS["border"],
                                           progress_color=COLORS["accent"])
        self.prog_bar.set(0)
        self.prog_bar.grid(row=1, column=0, columnspan=3,
                           padx=10, pady=(0, 6), sticky="ew")

        # estado
        self.state_lbl = ctk.CTkLabel(self, text="⏳  Pendiente",
                                      text_color=COLORS["subtext"],
                                      font=ctk.CTkFont(size=11))
        self.state_lbl.grid(row=0, column=2, padx=(0, 6))

        # botón eliminar
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
            "done":       "Completado",
            "error":      f"Error: {detail}",
        }
        text = f"{icon}  {labels.get(state, state)}"
        if detail and state == "done":
            text = f"{icon}  {detail}"
        self.state_lbl.configure(text=text, text_color=color)
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

    def disable_remove(self):
        self.btn_rm.configure(state="disabled")

    def enable_remove(self):
        self.btn_rm.configure(state="normal")


# ── Ventana principal ─────────────────────────────────────────────────────────

class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title(f"{APP_NAME}  v{VERSION}")
        self.geometry("820x680")
        self.minsize(680, 500)
        self.configure(fg_color=COLORS["bg"])

        self.cfg       = load_config()
        self.rows: list[FileRow] = []
        self.converting = False
        self.queue: queue.Queue = queue.Queue()
        self.calibre    = find_calibre_convert()

        self._build_ui()
        self._check_calibre_warning()
        self.after(100, self._process_queue)

        # habilitar drag & drop (tkinterdnd2 opcional)
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

        ctk.CTkLabel(hdr, text="📚  Kindle Converter",
                     font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=COLORS["text"]).pack(side="left", padx=20)

        ver_lbl = ctk.CTkLabel(hdr, text=f"v{VERSION}",
                               font=ctk.CTkFont(size=11),
                               text_color=COLORS["dim"])
        ver_lbl.pack(side="left", padx=4)

        # barra de estado Calibre
        self.calibre_banner = ctk.CTkFrame(self, fg_color=COLORS["warning"],
                                           corner_radius=0, height=36)
        # (se muestra solo si falta Calibre)

        # contenido principal
        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=20, pady=16)
        body.columnconfigure(0, weight=1)
        body.rowconfigure(1, weight=1)

        # ── zona de drop ─────────────────────────────────────────────────────
        self.drop_zone = ctk.CTkFrame(body, fg_color=COLORS["surface"],
                                      corner_radius=14,
                                      border_width=2,
                                      border_color=COLORS["border"])
        self.drop_zone.grid(row=0, column=0, sticky="ew", pady=(0, 12))

        drop_inner = ctk.CTkFrame(self.drop_zone, fg_color="transparent")
        drop_inner.pack(pady=18)

        ctk.CTkLabel(drop_inner,
                     text="⬆  Arrastra archivos PDF / EPUB aquí",
                     font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=COLORS["subtext"]).pack()

        ctk.CTkLabel(drop_inner, text="o usa el botón para seleccionar",
                     font=ctk.CTkFont(size=12),
                     text_color=COLORS["dim"]).pack(pady=(2, 10))

        ctk.CTkButton(drop_inner, text="+ Agregar archivos",
                      height=38, corner_radius=10,
                      fg_color=COLORS["accent"],
                      hover_color=COLORS["accent2"],
                      font=ctk.CTkFont(size=13, weight="bold"),
                      command=self._browse_files).pack()

        # ── lista de archivos ─────────────────────────────────────────────────
        list_card = ctk.CTkFrame(body, fg_color=COLORS["surface"],
                                 corner_radius=14)
        list_card.grid(row=1, column=0, sticky="nsew")
        list_card.columnconfigure(0, weight=1)
        list_card.rowconfigure(1, weight=1)

        list_hdr = ctk.CTkFrame(list_card, fg_color="transparent", height=42)
        list_hdr.grid(row=0, column=0, sticky="ew", padx=14, pady=(10, 0))
        list_hdr.columnconfigure(0, weight=1)

        ctk.CTkLabel(list_hdr, text="Archivos",
                     font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=COLORS["text"]).grid(row=0, column=0, sticky="w")

        self.clear_btn = ctk.CTkButton(list_hdr, text="Limpiar todo",
                                       width=90, height=28,
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
        scroll.grid(row=1, column=0, sticky="nsew", padx=10, pady=(6, 10))
        scroll.columnconfigure(0, weight=1)
        self.scroll_frame = scroll

        self.empty_lbl = ctk.CTkLabel(scroll,
                                      text="Sin archivos — agrega PDF o EPUB para comenzar",
                                      text_color=COLORS["dim"],
                                      font=ctk.CTkFont(size=12))
        self.empty_lbl.grid(row=0, column=0, pady=40)

        # ── panel inferior ────────────────────────────────────────────────────
        footer = ctk.CTkFrame(body, fg_color=COLORS["surface"],
                              corner_radius=14)
        footer.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        footer.columnconfigure(1, weight=1)

        # formato de salida
        ctk.CTkLabel(footer, text="Formato:",
                     text_color=COLORS["subtext"],
                     font=ctk.CTkFont(size=12)).grid(row=0, column=0,
                                                     padx=(16, 6), pady=14)
        self.fmt_var = ctk.StringVar(value=self.cfg.get("format", "MOBI"))
        fmt_menu = ctk.CTkOptionMenu(footer, values=KINDLE_FORMATS,
                                     variable=self.fmt_var,
                                     width=100, height=34,
                                     fg_color=COLORS["card"],
                                     button_color=COLORS["accent"],
                                     button_hover_color=COLORS["accent2"],
                                     dropdown_fg_color=COLORS["card"],
                                     text_color=COLORS["text"],
                                     corner_radius=8,
                                     command=self._on_format_change)
        fmt_menu.grid(row=0, column=1, sticky="w", padx=(0, 10), pady=14)

        # carpeta de salida
        ctk.CTkLabel(footer, text="Destino:",
                     text_color=COLORS["subtext"],
                     font=ctk.CTkFont(size=12)).grid(row=0, column=2, padx=(0, 6))

        self.out_var = ctk.StringVar(value=self.cfg.get(
            "output_dir", str(Path.home() / "Kindle Converted")))
        out_entry = ctk.CTkEntry(footer, textvariable=self.out_var,
                                 width=220, height=34,
                                 fg_color=COLORS["card"],
                                 border_color=COLORS["border"],
                                 text_color=COLORS["text"],
                                 corner_radius=8)
        out_entry.grid(row=0, column=3, padx=(0, 6))

        ctk.CTkButton(footer, text="…", width=36, height=34,
                      fg_color=COLORS["border"],
                      hover_color=COLORS["accent"],
                      text_color=COLORS["text"],
                      corner_radius=8,
                      command=self._browse_output).grid(row=0, column=4,
                                                        padx=(0, 12))

        # botón convertir
        self.convert_btn = ctk.CTkButton(footer,
                                         text="Convertir  ▶",
                                         height=40, width=150,
                                         corner_radius=10,
                                         fg_color=COLORS["accent"],
                                         hover_color=COLORS["accent2"],
                                         font=ctk.CTkFont(size=14,
                                                          weight="bold"),
                                         command=self._start_conversion)
        self.convert_btn.grid(row=0, column=5, padx=(0, 16))

        # barra de progreso global
        self.global_prog = ctk.CTkProgressBar(body, height=6,
                                              fg_color=COLORS["border"],
                                              progress_color=COLORS["accent"])
        self.global_prog.set(0)
        self.global_prog.grid(row=3, column=0, sticky="ew", pady=(8, 0))
        self.global_prog.grid_remove()

        # estado global
        self.status_lbl = ctk.CTkLabel(body, text="",
                                       text_color=COLORS["subtext"],
                                       font=ctk.CTkFont(size=11))
        self.status_lbl.grid(row=4, column=0, sticky="w", pady=(4, 0))

    def _check_calibre_warning(self):
        if not self.calibre:
            self.calibre_banner.pack(fill="x", before=None)
            self.calibre_banner.pack_configure(after=self.winfo_children()[0])
            ctk.CTkLabel(self.calibre_banner,
                         text="⚠  Calibre no encontrado.  "
                              "Descárgalo en calibre-ebook.com  —  "
                              "es necesario para convertir archivos.",
                         text_color="#1A1D27",
                         font=ctk.CTkFont(size=12, weight="bold")).pack(
                             pady=8)

    # ── Drag & Drop (requiere tkinterdnd2) ────────────────────────────────────

    def _enable_dnd(self):
        from tkinterdnd2 import DND_FILES, TkinterDnD  # type: ignore
        self.drop_zone.drop_target_register(DND_FILES)
        self.drop_zone.dnd_bind("<<Drop>>", self._on_drop)

    def _on_drop(self, event):
        paths = self.tk.splitlist(event.data)
        self._add_files(paths)

    # ── Gestión de archivos ───────────────────────────────────────────────────

    def _browse_files(self):
        paths = filedialog.askopenfilenames(
            title="Seleccionar archivos",
            filetypes=[("Documentos", "*.pdf *.epub"),
                       ("PDF", "*.pdf"), ("EPUB", "*.epub")])
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
        row = FileRow(self.scroll_frame, filepath,
                      on_remove=self._remove_row)
        row.grid(row=len(self.rows), column=0, sticky="ew",
                 padx=4, pady=4)
        self.rows.append(row)

    def _remove_row(self, row: FileRow):
        if self.converting:
            return
        row.destroy()
        self.rows.remove(row)
        self._reindex_rows()
        self._refresh_empty()

    def _reindex_rows(self):
        for i, r in enumerate(self.rows):
            r.grid_configure(row=i)

    def _clear_all(self):
        if self.converting:
            return
        for r in self.rows:
            r.destroy()
        self.rows.clear()
        self._refresh_empty()
        self._set_status("")

    def _refresh_empty(self):
        if self.rows:
            self.empty_lbl.grid_remove()
        else:
            self.empty_lbl.grid()

    # ── Opciones ──────────────────────────────────────────────────────────────

    def _browse_output(self):
        d = filedialog.askdirectory(title="Carpeta de destino",
                                    initialdir=self.out_var.get())
        if d:
            self.out_var.set(d)
            self.cfg["output_dir"] = d
            save_config(self.cfg)

    def _on_format_change(self, val):
        self.cfg["format"] = val
        save_config(self.cfg)

    # ── Conversión ────────────────────────────────────────────────────────────

    def _start_conversion(self):
        if not self.rows:
            messagebox.showwarning("Sin archivos",
                                   "Agrega al menos un archivo PDF o EPUB.")
            return
        if not self.calibre:
            messagebox.showerror(
                "Calibre no encontrado",
                "Instala Calibre desde calibre-ebook.com\n"
                "y vuelve a intentarlo.")
            return
        if self.converting:
            return

        out_dir = Path(self.out_var.get())
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            messagebox.showerror("Error de directorio",
                                 f"No se pudo crear la carpeta:\n{e}")
            return

        self.converting = True
        self.convert_btn.configure(state="disabled", text="Convirtiendo…")
        self.clear_btn.configure(state="disabled")
        for r in self.rows:
            r.disable_remove()
            r.set_state("pending")

        self.global_prog.set(0)
        self.global_prog.grid()

        fmt = self.fmt_var.get().lower()
        thread = threading.Thread(
            target=self._conversion_worker,
            args=(list(self.rows), out_dir, fmt),
            daemon=True)
        thread.start()

    def _conversion_worker(self, rows, out_dir: Path, fmt: str):
        total  = len(rows)
        done   = 0
        errors = 0

        for row in rows:
            self.queue.put(("state", row, "converting", ""))
            src  = Path(row.filepath)
            dest = out_dir / f"{src.stem}.{fmt}"
            try:
                result = subprocess.run(
                    [self.calibre, str(src), str(dest)],
                    capture_output=True, text=True, timeout=300)
                if result.returncode == 0:
                    done += 1
                    self.queue.put(("state", row, "done",
                                    f"Guardado en {dest.name}"))
                else:
                    errors += 1
                    err_msg = (result.stderr or result.stdout or
                               "Error desconocido").strip()[:120]
                    self.queue.put(("state", row, "error", err_msg))
            except subprocess.TimeoutExpired:
                errors += 1
                self.queue.put(("state", row, "error", "Tiempo agotado"))
            except Exception as e:
                errors += 1
                self.queue.put(("state", row, "error", str(e)[:120]))

            self.queue.put(("progress", (done + errors) / total))

        self.queue.put(("done", done, errors, str(out_dir)))

    # ── Cola de eventos UI ────────────────────────────────────────────────────

    def _process_queue(self):
        try:
            while True:
                msg = self.queue.get_nowait()
                if msg[0] == "state":
                    _, row, state, detail = msg
                    row.set_state(state, detail)
                elif msg[0] == "progress":
                    self.global_prog.set(msg[1])
                elif msg[0] == "done":
                    _, done, errors, out_dir = msg
                    self._on_conversion_done(done, errors, out_dir)
        except queue.Empty:
            pass
        self.after(80, self._process_queue)

    def _on_conversion_done(self, done: int, errors: int, out_dir: str):
        self.converting = False
        self.convert_btn.configure(state="normal", text="Convertir  ▶")
        self.clear_btn.configure(state="normal")
        for r in self.rows:
            r.enable_remove()

        if errors == 0:
            self.global_prog.configure(progress_color=COLORS["success"])
            status = f"✓  {done} archivo(s) convertido(s) → {out_dir}"
            messagebox.showinfo("Completado",
                                f"Se convirtieron {done} archivo(s).\n\n"
                                f"Guardados en:\n{out_dir}")
        else:
            self.global_prog.configure(progress_color=COLORS["warning"])
            status = (f"⚠  {done} convertido(s), {errors} con error(es)"
                      f" → {out_dir}")
            messagebox.showwarning(
                "Conversión con errores",
                f"{done} archivo(s) convertido(s) correctamente.\n"
                f"{errors} archivo(s) con error.\n\n"
                f"Revisa cada archivo para ver el detalle.")
        self._set_status(status)

    def _set_status(self, msg: str):
        self.status_lbl.configure(text=msg)


# ── Entrada ───────────────────────────────────────────────────────────────────

def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
