# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — genera un único .exe sin consola

import sys
from pathlib import Path

block_cipher = None

# Rutas de customtkinter y tkinterdnd2
import customtkinter
CTK_PATH = Path(customtkinter.__file__).parent

try:
    import tkinterdnd2
    DND_PATH = Path(tkinterdnd2.__file__).parent
    dnd_datas = [(str(DND_PATH), "tkinterdnd2")]
except ImportError:
    dnd_datas = []

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=[
        (str(CTK_PATH), "customtkinter"),
        *dnd_datas,
    ],
    hiddenimports=[
        "customtkinter",
        "tkinterdnd2",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["matplotlib", "numpy", "pandas", "PIL"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="KindleConverter",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # sin ventana de consola negra
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon="icon.ico",      # descomenta y coloca tu .ico aquí
)
