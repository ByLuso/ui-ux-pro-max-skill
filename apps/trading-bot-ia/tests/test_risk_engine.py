"""
Tests del motor de riesgo. Sin dependencias externas (solo stdlib unittest).
Ejecutar con: python -m unittest discover -s trading-bot-ia/tests
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config
from risk_engine import RiskEngine, TradeProposal


class RiskEngineTests(unittest.TestCase):
    def setUp(self):
        config.TOTAL_CAPITAL_EUR = 10000.0
        self.state = config.RuntimeState()
        self.engine = RiskEngine(self.state)

    def _proposal(self, **overrides):
        base = dict(
            symbol="BTC/USDT",
            direction="long",
            entry_price=100.0,
            stop_loss_price=95.0,
            confidence_score=0.8,
        )
        base.update(overrides)
        return TradeProposal(**base)

    def test_rejects_without_stop_loss(self):
        decision = self.engine.evaluate(self._proposal(stop_loss_price=100.0))
        self.assertFalse(decision.approved)

    def test_rejects_low_confidence(self):
        decision = self.engine.evaluate(self._proposal(confidence_score=0.1))
        self.assertFalse(decision.approved)

    def test_approves_valid_proposal_and_sizes_by_risk(self):
        # SL al 10% de distancia para que el sizing por riesgo no choque con
        # el limite de exposicion por activo (25% del capital) y se pueda
        # comprobar la formula de sizing de forma aislada.
        decision = self.engine.evaluate(self._proposal(stop_loss_price=90.0))
        self.assertTrue(decision.approved)
        expected_risk_eur = config.TOTAL_CAPITAL_EUR * config.RISK_PER_TRADE_PCT
        expected_size_eur = expected_risk_eur / 0.10  # 10% de distancia al SL
        self.assertAlmostEqual(decision.position_size_eur, expected_size_eur, places=2)

    def test_caps_exposure_per_asset(self):
        self.state.open_positions["BTC/USDT"] = {"size_eur": 2400.0}
        decision = self.engine.evaluate(self._proposal())
        max_asset_eur = config.TOTAL_CAPITAL_EUR * config.MAX_EXPOSURE_PER_ASSET_PCT
        self.assertLessEqual(decision.position_size_eur, max_asset_eur - 2400.0 + 1e-6)

    def test_daily_drawdown_halts_bot(self):
        self.state.daily_pnl_pct = -config.MAX_DAILY_DRAWDOWN_PCT
        decision = self.engine.evaluate(self._proposal())
        self.assertFalse(decision.approved)
        self.assertTrue(self.state.is_halted)

    def test_consecutive_losses_halt_bot(self):
        self.state.consecutive_losses = config.MAX_CONSECUTIVE_LOSSES
        decision = self.engine.evaluate(self._proposal())
        self.assertFalse(decision.approved)
        self.assertTrue(self.state.is_halted)

    def test_halted_state_blocks_further_trades_even_after_reason_clears(self):
        self.state.is_halted = True
        self.state.halted_reason = "prueba manual"
        decision = self.engine.evaluate(self._proposal())
        self.assertFalse(decision.approved)

    def test_reset_daily_state_clears_halt(self):
        self.state.is_halted = True
        self.state.halted_reason = "prueba"
        self.state.daily_pnl_pct = -0.1
        self.state.consecutive_losses = 9
        self.engine.reset_daily_state()
        self.assertFalse(self.state.is_halted)
        self.assertEqual(self.state.daily_pnl_pct, 0.0)
        self.assertEqual(self.state.consecutive_losses, 0)


if __name__ == "__main__":
    unittest.main()
