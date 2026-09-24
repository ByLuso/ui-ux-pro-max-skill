"""
Dashboard web local, de solo lectura, para visualizar el bot en tiempo real.

Lee unicamente los ficheros que main.py ya escribe (logs/state.json,
logs/state_history.jsonl, logs/decisions.jsonl, logs/trades.jsonl).
No se conecta al exchange ni ejecuta nada - puede correr en paralelo al
bot, o solo, sin claves de API.

Uso:
    python dashboard.py
Por defecto escucha en http://127.0.0.1:8787 (solo localhost). Ajusta
DASHBOARD_HOST/DASHBOARD_PORT en .env si necesitas otro puerto.
"""

import json
import logging
import os
import socket
from collections import defaultdict
from functools import wraps

from flask import Flask, Response, jsonify, request, send_from_directory

import config

logger = logging.getLogger("dashboard")

app = Flask(__name__, static_folder="dashboard_static", static_url_path="")


def _auth_enabled():
    return bool(config.DASHBOARD_USERNAME and config.DASHBOARD_PASSWORD)


def _check_auth(auth):
    return (
        auth is not None
        and auth.username == config.DASHBOARD_USERNAME
        and auth.password == config.DASHBOARD_PASSWORD
    )


def require_auth(view):
    """Protege una vista con HTTP Basic Auth si DASHBOARD_USERNAME/PASSWORD
    estan configurados en .env. Sin ellos, el dashboard queda abierto a
    quien alcance el puerto - solo aceptable si escucha en 127.0.0.1."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _auth_enabled() and not _check_auth(request.authorization):
            return Response(
                "Autenticacion requerida", 401,
                {"WWW-Authenticate": 'Basic realm="Trading Bot Dashboard"'},
            )
        return view(*args, **kwargs)
    return wrapped


def _read_jsonl(path, limit=None):
    if not os.path.exists(path):
        return []
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    if limit:
        rows = rows[-limit:]
    return rows


def _default_state():
    return {
        "timestamp": None,
        "dry_run": config.DRY_RUN,
        "use_testnet": config.USE_TESTNET,
        "is_halted": False,
        "halted_reason": "",
        "daily_pnl_pct": 0.0,
        "consecutive_losses": 0,
        "open_positions": {},
        "total_capital_eur": config.TOTAL_CAPITAL_EUR,
        "trading_pairs": config.TRADING_PAIRS,
        "limits": {
            "max_daily_drawdown_pct": config.MAX_DAILY_DRAWDOWN_PCT,
            "max_consecutive_losses": config.MAX_CONSECUTIVE_LOSSES,
            "max_exposure_per_asset_pct": config.MAX_EXPOSURE_PER_ASSET_PCT,
            "max_total_exposure_pct": config.MAX_TOTAL_EXPOSURE_PCT,
        },
    }


@app.route("/")
@require_auth
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/state")
@require_auth
def api_state():
    if os.path.exists(config.STATE_FILE):
        with open(config.STATE_FILE) as f:
            return jsonify(json.load(f))
    return jsonify(_default_state())


@app.route("/api/history")
@require_auth
def api_history():
    rows = _read_jsonl(config.STATE_HISTORY_FILE, limit=500)
    return jsonify(rows)


@app.route("/api/decisions")
@require_auth
def api_decisions():
    rows = _read_jsonl(config.DECISION_LOG_FILE, limit=300)
    rows.reverse()
    return jsonify(rows)


@app.route("/api/trades")
@require_auth
def api_trades():
    rows = _read_jsonl(config.TRADE_LOG_FILE, limit=300)
    rows.reverse()
    return jsonify(rows)


@app.route("/api/summary")
@require_auth
def api_summary():
    decisions = _read_jsonl(config.DECISION_LOG_FILE)
    trades = _read_jsonl(config.TRADE_LOG_FILE)

    approved = sum(1 for d in decisions if d.get("approved"))
    rejected = len(decisions) - approved

    by_symbol = defaultdict(lambda: {"approved": 0, "rejected": 0})
    for d in decisions:
        key = "approved" if d.get("approved") else "rejected"
        by_symbol[d.get("symbol", "?")][key] += 1

    rejection_reasons = defaultdict(int)
    for d in decisions:
        if not d.get("approved"):
            reason = (d.get("reason") or "Desconocido").split(":")[0].strip()
            rejection_reasons[reason] += 1

    return jsonify({
        "total_decisions": len(decisions),
        "approved": approved,
        "rejected": rejected,
        "approval_rate": (approved / len(decisions)) if decisions else 0.0,
        "total_trades_opened": len(trades),
        "by_symbol": by_symbol,
        "rejection_reasons": rejection_reasons,
    })


def _lan_url():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return f"http://{ip}:{config.DASHBOARD_PORT}"
    except OSError:
        return None


if __name__ == "__main__":
    os.makedirs(config.LOG_DIR, exist_ok=True)

    print(f"\nDashboard: http://127.0.0.1:{config.DASHBOARD_PORT}")
    if config.DASHBOARD_HOST != "127.0.0.1":
        lan_url = _lan_url()
        if lan_url:
            print(f"En tu red local (para el movil, misma WiFi): {lan_url}")
        if not _auth_enabled():
            logger.warning(
                "DASHBOARD_HOST no es 127.0.0.1 y no hay DASHBOARD_USERNAME/PASSWORD "
                "configurados: cualquiera en tu red vera capital, posiciones y PnL. "
                "Define ambos en .env para proteger el acceso."
            )
    print()

    app.run(host=config.DASHBOARD_HOST, port=config.DASHBOARD_PORT, debug=False)
