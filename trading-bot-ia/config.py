"""
Configuracion central del bot.
Ajusta estos valores ANTES de conectar a real. No hay valores magicos:
cada numero aqui es una decision de riesgo que debes entender.
"""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

load_dotenv()

# -- Modo de ejecucion --------------------------------------------------
DRY_RUN = os.environ.get("DRY_RUN", "true").lower() != "false"   # True = simula ordenes, no las manda al exchange
USE_TESTNET = os.environ.get("USE_TESTNET", "true").lower() != "false"  # True = Binance Testnet

# -- Credenciales (nunca hardcodear, usar variables de entorno) --------
BINANCE_API_KEY = os.environ.get("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.environ.get("BINANCE_API_SECRET", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANALYSIS_MODEL = os.environ.get("ANALYSIS_MODEL", "claude-sonnet-5")

# -- Capital y riesgo ----------------------------------------------------
TOTAL_CAPITAL_EUR = float(os.environ.get("BOT_CAPITAL_EUR", "0"))  # define via env var
RISK_PER_TRADE_PCT = 0.015          # 1.5% del capital total por operacion
MAX_EXPOSURE_PER_ASSET_PCT = 0.25   # max 25% del capital en un solo activo
MAX_TOTAL_EXPOSURE_PCT = 0.60       # max 60% del capital desplegado a la vez
MAX_HIGH_RISK_ALLOC_PCT = 0.25      # setups de alta volatilidad: tope 25%

# -- Circuit breakers (parada automatica) --------------------------------
MAX_DAILY_DRAWDOWN_PCT = 0.05       # -5% en el dia -> el bot se apaga solo
MAX_CONSECUTIVE_LOSSES = 4          # 4 perdidas seguidas -> pausa y revision manual
COOLDOWN_AFTER_STOP_MINUTES = 120   # tiempo minimo antes de poder reactivar

# -- Pares a monitorizar (5-8 iniciales) ---------------------------------
TRADING_PAIRS = [
    "BTC/USDT",
    "ETH/USDT",
    "SOL/USDT",
    "BNB/USDT",
    "SUI/USDT",
]

# -- Timeframes para analisis multi-timeframe ----------------------------
TIMEFRAMES = ["1h", "4h", "1d"]

# -- Stop-loss / Take-profit ----------------------------------------------
STOP_LOSS_ATR_MULTIPLIER = 1.5      # SL a 1.5x ATR del punto de entrada
TAKE_PROFIT_LEVELS = [              # salidas escalonadas, no un solo TP
    {"pct_of_position": 0.4, "r_multiple": 1.5},
    {"pct_of_position": 0.4, "r_multiple": 2.5},
    {"pct_of_position": 0.2, "r_multiple": 4.0},
]

# -- Correlacion entre activos ---------------------------------------------
# Si dos pares superan esta correlacion, se tratan como una sola
# exposicion a efectos de limite de riesgo (evita duplicar riesgo)
CORRELATION_THRESHOLD = 0.75

# -- Confianza minima para considerar una senal ----------------------------
MIN_CONFIDENCE_SCORE = 0.55

# -- Alertas -----------------------------------------------------------------
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# -- Logging -------------------------------------------------------------------
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
TRADE_LOG_FILE = os.path.join(LOG_DIR, "trades.jsonl")
DECISION_LOG_FILE = os.path.join(LOG_DIR, "decisions.jsonl")
ERROR_LOG_FILE = os.path.join(LOG_DIR, "errors.log")
STATE_FILE = os.path.join(LOG_DIR, "state.json")             # ultima foto del estado (para el dashboard)
STATE_HISTORY_FILE = os.path.join(LOG_DIR, "state_history.jsonl")  # serie temporal del estado

# -- Ciclo principal -------------------------------------------------------------
CYCLE_INTERVAL_MINUTES = 15

# -- Dashboard (solo lectura, no ejecuta nada) -----------------------------------
DASHBOARD_HOST = os.environ.get("DASHBOARD_HOST", "127.0.0.1")  # no exponer fuera de localhost sin auth
DASHBOARD_PORT = int(os.environ.get("DASHBOARD_PORT", "8787"))


@dataclass
class RuntimeState:
    """Estado mutable en memoria durante la ejecucion del bot."""
    daily_pnl_pct: float = 0.0
    consecutive_losses: int = 0
    is_halted: bool = False
    halted_reason: str = ""
    open_positions: dict = field(default_factory=dict)
