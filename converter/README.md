# Kindle Converter — PDF / EPUB → MOBI / AZW3

Aplicación de escritorio con interfaz gráfica moderna (dark mode) para convertir archivos PDF y EPUB al formato Kindle.

## Capturas

```
╔══════════════════════════════════════════════════╗
║  📚 Kindle Converter                    v1.0.0   ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  ┌──────────────────────────────────────────┐   ║
║  │  ⬆ Arrastra archivos PDF / EPUB aquí     │   ║
║  │      o usa el botón para seleccionar     │   ║
║  │          [ + Agregar archivos ]          │   ║
║  └──────────────────────────────────────────┘   ║
║                                                  ║
║  Archivos                        [Limpiar todo]  ║
║  ┌──────────────────────────────────────────┐   ║
║  │ PDF  📄 mi-libro           ✓ Completado  │   ║
║  │      ████████████████████████ 100%       │   ║
║  │ EPUB 📖 otro-libro         ⏳ Pendiente  │   ║
║  │      ░░░░░░░░░░░░░░░░░░░░░░░░  0%       │   ║
║  └──────────────────────────────────────────┘   ║
║                                                  ║
║  Formato: [MOBI ▾]  Destino: C:\... […]         ║
║                              [ Convertir ▶ ]     ║
╚══════════════════════════════════════════════════╝
```

## Características

- **Formatos de entrada:** PDF, EPUB
- **Formatos de salida:** MOBI, AZW3, EPUB
- **Conversión por lotes** — convierte múltiples archivos de una vez
- **Drag & Drop** — arrastra archivos directamente a la ventana
- **Progreso en tiempo real** por archivo y global
- **Dark mode** moderno
- **Sin instalación** — un solo `.exe` portable

## Requisitos

### 1. Calibre (obligatorio)
Kindle Converter usa el motor de conversión de **Calibre** (`ebook-convert`).

**Descarga gratuita:** [calibre-ebook.com](https://calibre-ebook.com/download)

> Calibre no necesita estar abierto; solo debe estar instalado.

### 2. Python 3.10+ (solo para construir desde fuente)
Para generar el `.exe` tú mismo necesitas Python.

## Uso rápido (solo el .exe)

1. Descarga `KindleConverter.exe` desde la carpeta `dist/`
2. Asegúrate de tener Calibre instalado
3. Abre `KindleConverter.exe` — sin instalación adicional

## Construir el .exe desde fuente

### Windows

```bat
git clone <este-repo>
cd converter
build.bat
```

El archivo `.exe` aparecerá en `dist\KindleConverter.exe`.

### macOS / Linux

```bash
cd converter
chmod +x build_mac_linux.sh
./build_mac_linux.sh
```

## Instalación manual de dependencias

```bash
pip install customtkinter>=5.2.2 tkinterdnd2>=0.3.0 pyinstaller>=6.0.0
```

## Ejecutar sin empaquetar

```bash
pip install customtkinter tkinterdnd2
python main.py
```

## Estructura del proyecto

```
converter/
├── main.py              # Aplicación principal (UI + lógica)
├── requirements.txt     # Dependencias Python
├── converter.spec       # Configuración de PyInstaller
├── build.bat            # Script de build para Windows
├── build_mac_linux.sh   # Script de build para macOS/Linux
└── README.md            # Esta guía
```

## Tecnologías

| Componente | Librería |
|---|---|
| UI / Widgets | [CustomTkinter](https://github.com/TomSchimansky/CustomTkinter) |
| Drag & Drop | [tkinterdnd2](https://github.com/pmgagne/tkinterdnd2) |
| Motor de conversión | [Calibre ebook-convert](https://calibre-ebook.com) |
| Empaquetado .exe | [PyInstaller](https://pyinstaller.org) |

## Formatos compatibles

| Entrada | Salida |
|---|---|
| PDF | MOBI (Kindle clásico) |
| EPUB | AZW3 (Kindle moderno) |
| | EPUB (redistribución) |

## Notas

- La calidad de conversión depende de Calibre. Los PDF con texto seleccionable se convierten mucho mejor que los escaneados.
- Los EPUB se convierten con alta fidelidad.
- Archivos muy grandes (>50 MB) pueden tardar varios minutos.
