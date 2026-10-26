"""
Motor de senales - aqui entra Claude.

IMPORTANTE: este modulo SOLO propone. No ejecuta nada, no mueve dinero.
La propuesta pasa siempre por risk_engine.py antes de convertirse en orden.

Usa tool-use forzado (tool_choice) de la API de Anthropic para garantizar
una respuesta estructurada valida, en vez de parsear texto libre.
"""

import logging
from typing import Dict, Optional

import anthropic
import pandas as pd

import config
from risk_engine import TradeProposal

logger = logging.getLogger("signal_engine")

client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY or None)

SYSTEM_PROMPT = """Eres un analista tecnico de criptomonedas. Recibes datos de
velas e indicadores (RSI, MACD, Bollinger, ATR) en varios timeframes para un
par. Tu trabajo es dar un analisis objetivo, no optimista por defecto.

Basate solo en los datos que recibes, no inventes niveles. Si no hay una
senal clara usa direction="none" y un confidence_score bajo. Llama siempre
a la herramienta submit_analysis con tu conclusion."""

ANALYSIS_TOOL = {
    "name": "submit_analysis",
    "description": "Registra el analisis tecnico de un par de trading.",
    "input_schema": {
        "type": "object",
        "properties": {
            "direction": {
                "type": "string",
                "enum": ["long", "short", "none"],
            },
            "confidence_score": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
            },
            "is_high_risk_setup": {"type": "boolean"},
            "reasoning": {
                "type": "string",
                "description": "Explicacion breve, maximo 3 frases.",
            },
            "key_levels": {
                "type": "object",
                "properties": {
                    "support": {"type": "number"},
                    "resistance": {"type": "number"},
                },
                "required": ["support", "resistance"],
            },
            "invalidation_note": {
                "type": "string",
                "description": "Que invalidaria esta idea.",
            },
        },
        "required": ["direction", "confidence_score", "is_high_risk_setup", "reasoning", "invalidation_note"],
    },
}


def _summarize_for_prompt(symbol: str, mtf_data: Dict[str, pd.DataFrame]) -> str:
    """Reduce los dataframes a un resumen legible para el prompt (ultimas velas + indicadores)."""
    parts = [f"Par: {symbol}\n"]
    for tf, df in mtf_data.items():
        last = df.iloc[-1]
        parts.append(
            f"[{tf}] close={last['close']:.4f} rsi={last['rsi']:.1f} "
            f"macd_hist={last['macd_hist']:.4f} atr={last['atr']:.4f} "
            f"bb_upper={last['bb_upper']:.4f} bb_lower={last['bb_lower']:.4f}"
        )
    return "\n".join(parts)


def analyze_pair(symbol: str, mtf_data: Dict[str, pd.DataFrame]) -> Optional[TradeProposal]:
    prompt = _summarize_for_prompt(symbol, mtf_data)

    try:
        response = client.messages.create(
            model=config.ANALYSIS_MODEL,
            max_tokens=500,
            system=SYSTEM_PROMPT,
            tools=[ANALYSIS_TOOL],
            tool_choice={"type": "tool", "name": "submit_analysis"},
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as e:
        logger.error(f"Fallo llamando a Claude para {symbol}: {e}")
        return None

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_use is None:
        logger.error(f"Sin tool_use en la respuesta de Claude para {symbol}")
        return None

    result = tool_use.input

    if result.get("direction") == "none":
        return None

    entry_price = float(mtf_data["1h"].iloc[-1]["close"])
    atr = float(mtf_data["1h"].iloc[-1]["atr"])

    if pd.isna(atr):
        logger.warning(f"ATR no disponible aun para {symbol} (pocas velas), se descarta la senal")
        return None

    if result["direction"] == "long":
        stop_loss = entry_price - (atr * config.STOP_LOSS_ATR_MULTIPLIER)
    else:
        stop_loss = entry_price + (atr * config.STOP_LOSS_ATR_MULTIPLIER)

    logger.info(f"{symbol}: {result['direction']} conf={result['confidence_score']:.2f} - {result['reasoning']}")

    return TradeProposal(
        symbol=symbol,
        direction=result["direction"],
        entry_price=entry_price,
        stop_loss_price=stop_loss,
        confidence_score=float(result["confidence_score"]),
        is_high_risk_setup=bool(result.get("is_high_risk_setup", False)),
    )
