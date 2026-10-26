"""
Capa de datos: obtiene velas (OHLCV) e indicadores desde Binance.
Usa ccxt para no depender de una sola libreria especifica del exchange.
"""

import logging
from typing import Dict, List

import ccxt
import pandas as pd
import numpy as np

import config

logger = logging.getLogger("data_feed")


def get_exchange() -> ccxt.Exchange:
    exchange = ccxt.binance({
        "apiKey": config.BINANCE_API_KEY,
        "secret": config.BINANCE_API_SECRET,
        "enableRateLimit": True,
        "options": {"defaultType": "spot"},
    })
    if config.USE_TESTNET:
        exchange.set_sandbox_mode(True)
    return exchange


def fetch_ohlcv(exchange: ccxt.Exchange, symbol: str, timeframe: str, limit: int = 200) -> pd.DataFrame:
    raw = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    return df


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """RSI, MACD, Bollinger Bands, ATR."""
    df = df.copy()

    # RSI (14)
    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - (100 / (1 + rs))

    # MACD (12, 26, 9)
    ema12 = df["close"].ewm(span=12, adjust=False).mean()
    ema26 = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"] = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"] = df["macd"] - df["macd_signal"]

    # Bollinger Bands (20, 2)
    sma20 = df["close"].rolling(20).mean()
    std20 = df["close"].rolling(20).std()
    df["bb_upper"] = sma20 + 2 * std20
    df["bb_lower"] = sma20 - 2 * std20
    df["bb_mid"] = sma20

    # ATR (14) - se usa para el stop-loss dinamico
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    df["atr"] = tr.rolling(14).mean()

    return df


def get_multi_timeframe_data(exchange: ccxt.Exchange, symbol: str) -> Dict[str, pd.DataFrame]:
    """Devuelve velas + indicadores para todos los timeframes configurados."""
    data = {}
    for tf in config.TIMEFRAMES:
        df = fetch_ohlcv(exchange, symbol, tf)
        data[tf] = add_indicators(df)
    return data


def compute_correlation_matrix(exchange: ccxt.Exchange, symbols: List[str], timeframe: str = "1d") -> pd.DataFrame:
    """Correlacion entre pares - para no duplicar riesgo en activos que se mueven juntos."""
    closes = {}
    for symbol in symbols:
        df = fetch_ohlcv(exchange, symbol, timeframe, limit=90)
        closes[symbol] = df.set_index("timestamp")["close"]
    price_df = pd.DataFrame(closes)
    return price_df.pct_change().corr()
