"""
Backtesting simplificado. NO usa la API de Claude en cada vela (seria caro y lento);
aplica la logica de indicadores directamente para validar la estrategia base antes
de fiarte del analisis de Claude en vivo.

Esto valida el ESQUELETO (sizing, stops, circuit breakers). El analisis cualitativo
de Claude se valida aparte, en paper trading (main.py con DRY_RUN=True).

Uso:
    python backtest.py --symbol BTC/USDT --days 365
"""

import argparse
import logging

import pandas as pd

import config
import data_feed
from risk_engine import RiskEngine, TradeProposal

logger = logging.getLogger("backtest")


def simple_signal(row) -> str:
    """Estrategia base para backtest: cruce RSI + MACD. Sustituye por tu logica real."""
    if row["rsi"] < 35 and row["macd_hist"] > 0:
        return "long"
    if row["rsi"] > 65 and row["macd_hist"] < 0:
        return "short"
    return "none"


def run_backtest(symbol: str, days: int):
    exchange = data_feed.get_exchange()
    df = data_feed.fetch_ohlcv(exchange, symbol, "1h", limit=min(days * 24, 1000))
    df = data_feed.add_indicators(df).dropna().reset_index(drop=True)

    state = config.RuntimeState()
    risk_engine = RiskEngine(state)

    capital = config.TOTAL_CAPITAL_EUR or 10000.0  # capital de prueba si no hay real configurado
    equity_curve = [capital]
    trades = []

    for i in range(len(df) - 1):
        row = df.iloc[i]
        direction = simple_signal(row)
        if direction == "none":
            equity_curve.append(equity_curve[-1])
            continue

        entry = row["close"]
        atr = row["atr"]
        sl = entry - atr * config.STOP_LOSS_ATR_MULTIPLIER if direction == "long" else entry + atr * config.STOP_LOSS_ATR_MULTIPLIER

        proposal = TradeProposal(
            symbol=symbol, direction=direction, entry_price=entry,
            stop_loss_price=sl, confidence_score=0.6,
        )
        decision = risk_engine.evaluate(proposal)

        if not decision.approved:
            equity_curve.append(equity_curve[-1])
            continue

        # Simula el resultado mirando la siguiente vela (simplificado - no sustituye un backtest completo con TPs escalonados)
        next_close = df.iloc[i + 1]["close"]
        pnl_pct = (next_close - entry) / entry if direction == "long" else (entry - next_close) / entry
        pnl_eur = decision.position_size_eur * pnl_pct

        capital += pnl_eur
        equity_curve.append(capital)
        risk_engine.register_trade_result(pnl_pct)
        trades.append({"timestamp": row["timestamp"], "direction": direction, "pnl_eur": pnl_eur})

    trades_df = pd.DataFrame(trades)
    if trades_df.empty:
        print("Sin operaciones generadas en el periodo.")
        return

    win_rate = (trades_df["pnl_eur"] > 0).mean()
    total_return_pct = (capital - (config.TOTAL_CAPITAL_EUR or 10000.0)) / (config.TOTAL_CAPITAL_EUR or 10000.0)
    max_drawdown = _max_drawdown(equity_curve)

    print(f"\n-- Resultados backtest {symbol} ({days} dias) --")
    print(f"Operaciones: {len(trades_df)}")
    print(f"Win rate: {win_rate:.1%}")
    print(f"Retorno total: {total_return_pct:.1%}")
    print(f"Maximo drawdown: {max_drawdown:.1%}")
    print(f"Capital final: {capital:.2f}EUR (inicial: {config.TOTAL_CAPITAL_EUR or 10000.0:.2f}EUR)")


def _max_drawdown(equity_curve):
    peak = equity_curve[0]
    max_dd = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        dd = (peak - value) / peak if peak > 0 else 0
        max_dd = max(max_dd, dd)
    return max_dd


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default="BTC/USDT")
    parser.add_argument("--days", type=int, default=180)
    args = parser.parse_args()
    run_backtest(args.symbol, args.days)
