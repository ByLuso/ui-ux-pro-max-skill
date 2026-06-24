#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  build_mac_linux.sh — Empaqueta KindleConverter con PyInstaller
#  macOS / Linux
# ─────────────────────────────────────────────────────────────────
set -e

echo ""
echo " ==================================================="
echo "  Kindle Converter — Generando ejecutable"
echo " ==================================================="
echo ""

# Verificar Python 3
if ! command -v python3 &>/dev/null; then
    echo " [ERROR] Python 3 no encontrado. Instálalo primero."
    exit 1
fi

# Entorno virtual
if [ ! -d "venv" ]; then
    echo " [1/4] Creando entorno virtual..."
    python3 -m venv venv
fi

source venv/bin/activate

# Dependencias
echo " [2/4] Instalando dependencias..."
pip install -q -r requirements.txt

# Limpiar
echo " [3/4] Limpiando builds anteriores..."
rm -rf dist build

# Build
echo " [4/4] Compilando..."
echo ""
pyinstaller converter.spec

echo ""
if [ -f "dist/KindleConverter" ] || [ -f "dist/KindleConverter.app/Contents/MacOS/KindleConverter" ]; then
    echo " ==================================================="
    echo "  BUILD EXITOSO → dist/"
    echo " ==================================================="
else
    echo " [ERROR] El build falló. Revisa los mensajes arriba."
    exit 1
fi
