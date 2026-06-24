@echo off
REM ─────────────────────────────────────────────────────────────────
REM  build.bat — Empaqueta KindleConverter.exe con PyInstaller
REM  Ejecuta este archivo en Windows con doble clic o desde CMD.
REM ─────────────────────────────────────────────────────────────────
title Kindle Converter — Build

echo.
echo  ===================================================
echo   Kindle Converter — Generando .exe
echo  ===================================================
echo.

REM Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python no encontrado.
    echo  Instala Python 3.10+ desde python.org
    pause
    exit /b 1
)

REM Crear entorno virtual si no existe
if not exist "venv\" (
    echo  [1/4] Creando entorno virtual...
    python -m venv venv
)

REM Activar entorno virtual
call venv\Scripts\activate.bat

REM Instalar dependencias
echo  [2/4] Instalando dependencias...
pip install -q -r requirements.txt

REM Limpiar builds anteriores
echo  [3/4] Limpiando builds anteriores...
if exist "dist\" rmdir /s /q dist
if exist "build\" rmdir /s /q build

REM Construir el .exe
echo  [4/4] Compilando KindleConverter.exe ...
echo.
pyinstaller converter.spec

echo.
if exist "dist\KindleConverter.exe" (
    echo  ===================================================
    echo   BUILD EXITOSO
    echo   Archivo: dist\KindleConverter.exe
    echo  ===================================================
    echo.
    echo  Puedes copiar KindleConverter.exe a cualquier
    echo  carpeta de tu PC. No necesita instalacion.
    echo.
    echo  IMPORTANTE: Calibre debe estar instalado en tu PC.
    echo  Descargalo gratis en: calibre-ebook.com
) else (
    echo  [ERROR] El build fallo. Revisa los mensajes arriba.
)

echo.
pause
