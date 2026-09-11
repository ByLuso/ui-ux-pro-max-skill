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
import os
from collections import defaultdict

from flask import Flask, jsonify, send_from_directory

import config

app = Flask(__name__, static_folder="dashboard_static", static_url_path="")


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
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/state")
def api_state():
    if os.path.exists(config.STATE_FILE):
        with open(config.STATE_FILE) as f:
            return jsonify(json.load(f))
    return jsonify(_default_state())


@app.route("/api/history")
def api_history():
    rows = _read_jsonl(config.STATE_HISTORY_FILE, limit=500)
    return jsonify(rows)


@app.route("/api/decisions")
def api_decisions():
    rows = _read_jsonl(config.DECISION_LOG_FILE, limit=300)
    rows.reverse()
    return jsonify(rows)


@app.route("/api/trades")
def api_trades():
    rows = _read_jsonl(config.TRADE_LOG_FILE, limit=300)
    rows.reverse()
    return jsonify(rows)


@app.route("/api/summary")
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


if __name__ == "__main__":
    os.makedirs(config.LOG_DIR, exist_ok=True)
    app.run(host=config.DASHBOARD_HOST, port=config.DASHBOARD_PORT, debug=False)
