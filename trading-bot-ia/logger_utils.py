"""
Logging estructurado + alertas. Cada operacion y cada parada del bot
debe quedar registrada y notificada - nada de "cajas negras".
"""

import json
import logging
import os
from datetime import datetime, timezone

import requests

import config


def setup_logging():
    os.makedirs(config.LOG_DIR, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(config.ERROR_LOG_FILE),
        ],
    )


def log_decision(payload: dict):
    payload["timestamp"] = datetime.now(timezone.utc).isoformat()
    with open(config.DECISION_LOG_FILE, "a") as f:
        f.write(json.dumps(payload) + "\n")


def log_trade(payload: dict):
    payload["timestamp"] = datetime.now(timezone.utc).isoformat()
    with open(config.TRADE_LOG_FILE, "a") as f:
        f.write(json.dumps(payload) + "\n")


def write_state_snapshot(state: "config.RuntimeState"):
    """Vuelca el estado actual a disco para que el dashboard lo lea.
    Sobrescribe state.json (foto actual) y añade una linea a
    state_history.jsonl (serie temporal para graficas)."""
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dry_run": config.DRY_RUN,
        "use_testnet": config.USE_TESTNET,
        "is_halted": state.is_halted,
        "halted_reason": state.halted_reason,
        "daily_pnl_pct": state.daily_pnl_pct,
        "consecutive_losses": state.consecutive_losses,
        "open_positions": state.open_positions,
        "total_capital_eur": config.TOTAL_CAPITAL_EUR,
        "trading_pairs": config.TRADING_PAIRS,
        "limits": {
            "max_daily_drawdown_pct": config.MAX_DAILY_DRAWDOWN_PCT,
            "max_consecutive_losses": config.MAX_CONSECUTIVE_LOSSES,
            "max_exposure_per_asset_pct": config.MAX_EXPOSURE_PER_ASSET_PCT,
            "max_total_exposure_pct": config.MAX_TOTAL_EXPOSURE_PCT,
        },
    }
    os.makedirs(config.LOG_DIR, exist_ok=True)
    with open(config.STATE_FILE, "w") as f:
        json.dump(payload, f, indent=2)
    with open(config.STATE_HISTORY_FILE, "a") as f:
        f.write(json.dumps(payload) + "\n")


def send_alert(message: str):
    """Manda una alerta por Telegram. Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID."""
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        logging.getLogger("alerts").warning(f"Telegram no configurado. Alerta perdida: {message}")
        return
    url = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        requests.post(url, data={"chat_id": config.TELEGRAM_CHAT_ID, "text": message}, timeout=10)
    except requests.RequestException as e:
        logging.getLogger("alerts").error(f"Fallo enviando alerta Telegram: {e}")
