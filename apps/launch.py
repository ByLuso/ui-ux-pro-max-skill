#!/usr/bin/env python3
"""Launcher del hub de apps.

Uso:
  python3 launch.py                 # sirve el hub en http://localhost:8000 y lo abre
  python3 launch.py --port 9000     # otro puerto
  python3 launch.py --no-open       # no abrir navegador
  python3 launch.py list            # lista las apps
  python3 launch.py run <slug>      # ejecuta el comando de arranque de una app (spa/native/backend/infra)

Las apps de tipo "static" se abren directamente desde el hub (botón Abrir).
"""
import argparse
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))


def load_apps():
    with open(os.path.join(ROOT, "apps.json"), encoding="utf-8") as f:
        return json.load(f)["apps"]


def cmd_list(_):
    for a in load_apps():
        mark = "🌐" if a["type"] == "static" else "⚙️ "
        entry = a.get("entry") or a.get("run", "")
        print(f"{mark} {a['slug']:24} {a['emoji']}  {a['name']}")
        print(f"      {entry}")


def cmd_run(args):
    apps = {a["slug"]: a for a in load_apps()}
    a = apps.get(args.slug)
    if not a:
        print(f"App desconocida: {args.slug}. Usa 'list' para verlas.")
        sys.exit(1)
    if a["type"] == "static":
        print(f"'{a['slug']}' es una web estática: ábrela desde el hub o sirve la carpeta.")
        return
    run = a.get("run")
    if not run:
        print(f"'{a['slug']}' no tiene comando de arranque definido.")
        return
    appdir = os.path.join(ROOT, a["slug"])
    print(f"→ cd {appdir}\n→ {run}\n")
    subprocess.run(run, shell=True, cwd=appdir)


def cmd_serve(args):
    os.chdir(ROOT)
    handler = http.server.SimpleHTTPRequestHandler

    class Reuse(socketserver.TCPServer):
        allow_reuse_address = True

    with Reuse(("127.0.0.1", args.port), handler) as httpd:
        url = f"http://localhost:{args.port}/index.html"
        print(f"Hub de apps sirviéndose en {url}")
        print("Ctrl+C para parar.")
        if not args.no_open:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nParado.")


def main():
    p = argparse.ArgumentParser(description="Launcher del hub de apps")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--no-open", action="store_true")
    sub = p.add_subparsers(dest="action")
    sub.add_parser("list")
    runp = sub.add_parser("run")
    runp.add_argument("slug")
    args = p.parse_args()

    if args.action == "list":
        cmd_list(args)
    elif args.action == "run":
        cmd_run(args)
    else:
        cmd_serve(args)


if __name__ == "__main__":
    main()
