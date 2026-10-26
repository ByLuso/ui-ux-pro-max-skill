"""
Ejecutor de ordenes.
Solo recibe decisiones YA aprobadas por risk_engine. No toma decisiones propias.
"""

import logging
import time
from typing import Optional

import ccxt

import config
from risk_engine import TradeProposal, RiskDecision

logger = logging.getLogger("executor")


class Executor:
    def __init__(self, exchange: ccxt.Exchange, state: config.RuntimeState):
        self.exchange = exchange
        self.state = state

    def execute(self, proposal: TradeProposal, decision: RiskDecision) -> Optional[dict]:
        if not decision.approved:
            logger.info(f"No ejecutado ({proposal.symbol}): {decision.reason}")
            return None

        if config.DRY_RUN:
            logger.info(
                f"[DRY_RUN] Simulando orden {proposal.direction} {proposal.symbol} "
                f"size={decision.position_size_units:.6f} entry={proposal.entry_price:.4f} "
                f"sl={proposal.stop_loss_price:.4f}"
            )
            order = {"id": f"dryrun-{int(time.time())}", "status": "simulated"}
        else:
            side = "buy" if proposal.direction == "long" else "sell"
            try:
                order = self.exchange.create_market_order(
                    symbol=proposal.symbol,
                    side=side,
                    amount=decision.position_size_units,
                )
                self._place_stop_loss(proposal, decision)
            except ccxt.BaseError as e:
                logger.error(f"Error ejecutando orden en {proposal.symbol}: {e}")
                return None

        self.state.open_positions[proposal.symbol] = {
            "direction": proposal.direction,
            "entry_price": proposal.entry_price,
            "stop_loss": proposal.stop_loss_price,
            "size_eur": decision.position_size_eur,
            "size_units": decision.position_size_units,
            "order_id": order.get("id"),
        }

        return order

    def _place_stop_loss(self, proposal: TradeProposal, decision: RiskDecision):
        """Coloca el stop-loss como orden separada en el exchange (nunca operar sin el)."""
        side = "sell" if proposal.direction == "long" else "buy"
        try:
            self.exchange.create_order(
                symbol=proposal.symbol,
                type="STOP_LOSS_LIMIT",
                side=side,
                amount=decision.position_size_units,
                price=proposal.stop_loss_price,
                params={"stopPrice": proposal.stop_loss_price},
            )
        except ccxt.BaseError as e:
            logger.error(f"CRITICO: no se pudo colocar stop-loss para {proposal.symbol}: {e}")
            # Si el stop-loss falla, la posicion queda descubierta: debe alertar y considerarse
            # cerrar la posicion inmediatamente en vez de dejarla sin proteccion.
            raise
