@echo off
title Kindle Converter API

echo.
echo  ========================================
echo   Kindle Converter — Servidor de la API
echo  ========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python no encontrado. Instala Python 3.10+
    pause & exit /b 1
)

if not exist "venv\" (
    echo  Creando entorno virtual...
    python -m venv venv
)
call venv\Scripts\activate.bat

echo  Instalando dependencias...
pip install -q -r requirements.txt

echo.
echo  Buscando tu IP local...
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%i
    goto :found
)
:found
set IP=%IP: =%
echo.
echo  =============================================
echo   Servidor corriendo en: http://%IP%:8000
echo   Ingresa esta URL en la app movil (Ajustes)
echo  =============================================
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
