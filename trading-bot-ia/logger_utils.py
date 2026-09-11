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
