"""
Punto de entrada. Bucle principal del bot.

Uso:
    python main.py

Con config.DRY_RUN=True (por defecto) no se manda dinero real a ningun sitio.
Cambia DRY_RUN y USE_TESTNET solo cuando hayas validado con backtest.py
y varias semanas de paper trading.
"""

import logging
import time

import config
import data_feed
import signal_engine
import logger_utils
from risk_engine import RiskEngine

logger = logging.getLogger("main")


def run_cycle(exchange, risk_engine: RiskEngine, executor):
    for symbol in config.TRADING_PAIRS:
        try:
            mtf_data = data_feed.get_multi_timeframe_data(exchange, symbol)
        except Exception as e:
            logger.error(f"Fallo obteniendo datos de {symbol}: {e}")
            continue

        try:
            proposal = signal_engine.analyze_pair(symbol, mtf_data)
        except Exception as e:
            logger.error(f"Fallo analizando {symbol}: {e}")
            continue

        if proposal is None:
            continue

        decision = risk_engine.evaluate(proposal)
        logger_utils.log_decision({
            "symbol": symbol,
            "direction": proposal.direction,
            "confidence": proposal.confidence_score,
            "approved": decision.approved,
            "reason": decision.reason,
        })

        if decision.approved:
            order = executor.execute(proposal, decision)
            if order:
                logger_utils.log_trade({
                    "symbol": symbol,
                    "direction": proposal.direction,
                    "size_eur": decision.position_size_eur,
                    "entry_price": proposal.entry_price,
                    "stop_loss": proposal.stop_loss_price,
                })
                logger_utils.send_alert(
                    f"Orden {proposal.direction.upper()} {symbol} "
                    f"| {decision.position_size_eur:.2f}EUR | SL {proposal.stop_loss_price:.4f}"
                )

        if risk_engine.state.is_halted:
            logger_utils.write_state_snapshot(risk_engine.state)
            logger_utils.send_alert(f"BOT DETENIDO: {risk_engine.state.halted_reason}")
            break

    logger_utils.write_state_snapshot(risk_engine.state)


def main():
    logger_utils.setup_logging()
    logger.info(f"Iniciando bot. DRY_RUN={config.DRY_RUN} TESTNET={config.USE_TESTNET}")

    if config.TOTAL_CAPITAL_EUR <= 0:
        logger.error("BOT_CAPITAL_EUR no configurado. Define la variable de entorno antes de arrancar.")
        return

    from executor import Executor

    exchange = data_feed.get_exchange()
    state = config.RuntimeState()
    risk_engine = RiskEngine(state)
    executor = Executor(exchange, state)
    logger_utils.write_state_snapshot(state)

    last_reset_day = time.strftime("%Y-%m-%d")

    while True:
        current_day = time.strftime("%Y-%m-%d")
        if current_day != last_reset_day:
            risk_engine.reset_daily_state()
            last_reset_day = current_day
            logger.info("Estado diario reseteado.")

        if state.is_halted:
            # Requiere revision manual: no se reactiva solo, ni siquiera tras el cooldown.
            # COOLDOWN_AFTER_STOP_MINUTES marca el minimo antes de que un humano lo reactive.
            logger.warning(f"Bot en pausa: {state.halted_reason}. Esperando revision manual.")
            time.sleep(config.COOLDOWN_AFTER_STOP_MINUTES * 60)
            continue

        run_cycle(exchange, risk_engine, executor)

        time.sleep(config.CYCLE_INTERVAL_MINUTES * 60)


if __name__ == "__main__":
    main()
