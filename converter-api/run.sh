#!/usr/bin/env bash
set -e

echo ""
echo " ========================================"
echo "  Kindle Converter — Servidor de la API"
echo " ========================================"
echo ""

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo " ============================================="
echo "  Servidor en: http://${LOCAL_IP}:8000"
echo "  Ingresa esta URL en la app (Ajustes)"
echo " ============================================="
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
