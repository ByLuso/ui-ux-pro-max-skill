"""
Motor de riesgo.

REGLA DE ORO: este modulo tiene la ultima palabra. El analisis de Claude
(signal_engine.py) puede recomendar lo que quiera - este modulo puede
vetar, reducir o modificar cualquier operacion. Nunca al reves.
"""

import logging
from dataclasses import dataclass
from typing import Optional

import config

logger = logging.getLogger("risk_engine")


@dataclass
class TradeProposal:
    """Lo que propone el motor de senales."""
    symbol: str
    direction: str          # "long" | "short"
    entry_price: float
    stop_loss_price: float
    confidence_score: float  # 0-1, de Claude
    is_high_risk_setup: bool = False


@dataclass
class RiskDecision:
    approved: bool
    reason: str
    position_size_eur: float = 0.0
    position_size_units: float = 0.0


class RiskEngine:
    def __init__(self, state: config.RuntimeState):
        self.state = state

    def check_circuit_breakers(self) -> Optional[str]:
        """Devuelve un motivo de parada si algun circuit breaker ha saltado."""
        if self.state.daily_pnl_pct <= -config.MAX_DAILY_DRAWDOWN_PCT:
            return (f"Drawdown diario alcanzado: {self.state.daily_pnl_pct:.2%} "
                    f"<= -{config.MAX_DAILY_DRAWDOWN_PCT:.2%}")
        if self.state.consecutive_losses >= config.MAX_CONSECUTIVE_LOSSES:
            return (f"{self.state.consecutive_losses} perdidas consecutivas "
                    f"(limite: {config.MAX_CONSECUTIVE_LOSSES})")
        return None

    def _current_total_exposure_eur(self) -> float:
        return sum(p["size_eur"] for p in self.state.open_positions.values())

    def _current_asset_exposure_eur(self, symbol: str) -> float:
        pos = self.state.open_positions.get(symbol)
        return pos["size_eur"] if pos else 0.0

    def evaluate(self, proposal: TradeProposal) -> RiskDecision:
        # 1. Circuit breakers primero: si el bot debe estar parado, no se evalua nada mas
        halt_reason = self.check_circuit_breakers()
        if halt_reason:
            self.state.is_halted = True
            self.state.halted_reason = halt_reason
            return RiskDecision(approved=False, reason=f"Bot detenido: {halt_reason}")

        if self.state.is_halted:
            return RiskDecision(approved=False, reason=f"Bot ya detenido: {self.state.halted_reason}")

        # 2. Stop-loss obligatorio, sin excepcion
        if proposal.stop_loss_price is None or proposal.stop_loss_price == proposal.entry_price:
            return RiskDecision(approved=False, reason="Propuesta rechazada: sin stop-loss valido")

        # 3. Confianza minima del analisis (filtra senales debiles) antes de calcular tamano
        if proposal.confidence_score < config.MIN_CONFIDENCE_SCORE:
            return RiskDecision(approved=False, reason=f"Confianza insuficiente ({proposal.confidence_score:.2f})")

        # 4. Calcular tamano de posicion segun riesgo fijo por operacion
        risk_amount_eur = config.TOTAL_CAPITAL_EUR * config.RISK_PER_TRADE_PCT
        price_risk_pct = abs(proposal.entry_price - proposal.stop_loss_price) / proposal.entry_price
        if price_risk_pct == 0:
            return RiskDecision(approved=False, reason="Distancia a stop-loss invalida (0%)")

        position_size_eur = risk_amount_eur / price_risk_pct

        # 5. Limite de exposicion por activo
        max_asset_eur = config.TOTAL_CAPITAL_EUR * config.MAX_EXPOSURE_PER_ASSET_PCT
        current_asset_exp = self._current_asset_exposure_eur(proposal.symbol)
        if current_asset_exp + position_size_eur > max_asset_eur:
            position_size_eur = max(0, max_asset_eur - current_asset_exp)
            if position_size_eur <= 0:
                return RiskDecision(approved=False, reason=f"Limite por activo alcanzado en {proposal.symbol}")

        # 6. Limite de exposicion total
        max_total_eur = config.TOTAL_CAPITAL_EUR * config.MAX_TOTAL_EXPOSURE_PCT
        current_total_exp = self._current_total_exposure_eur()
        if current_total_exp + position_size_eur > max_total_eur:
            position_size_eur = max(0, max_total_eur - current_total_exp)
            if position_size_eur <= 0:
                return RiskDecision(approved=False, reason="Limite de exposicion total del bot alcanzado")

        # 7. Limite extra para setups de alto riesgo
        if proposal.is_high_risk_setup:
            max_high_risk_eur = config.TOTAL_CAPITAL_EUR * config.MAX_HIGH_RISK_ALLOC_PCT
            if position_size_eur > max_high_risk_eur:
                position_size_eur = max_high_risk_eur

        position_size_units = position_size_eur / proposal.entry_price

        logger.info(f"Aprobado {proposal.symbol}: {position_size_eur:.2f}EUR "
                    f"({price_risk_pct:.2%} riesgo hasta SL)")

        return RiskDecision(
            approved=True,
            reason="OK",
            position_size_eur=position_size_eur,
            position_size_units=position_size_units,
        )

    def register_trade_result(self, pnl_pct: float):
        """Actualiza el estado tras cerrar una operacion."""
        self.state.daily_pnl_pct += pnl_pct
        if pnl_pct < 0:
            self.state.consecutive_losses += 1
        else:
            self.state.consecutive_losses = 0

    def reset_daily_state(self):
        self.state.daily_pnl_pct = 0.0
        self.state.consecutive_losses = 0
        self.state.is_halted = False
        self.state.halted_reason = ""
