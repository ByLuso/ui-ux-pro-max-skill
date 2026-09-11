# Trading Bot IA — Binance + Claude

Bot de trading automatizado. Claude analiza cada par y propone senales;
el motor de riesgo (`risk_engine.py`) tiene siempre la ultima palabra sobre
si se ejecuta, con cuanto tamano, y puede parar el bot entero solo.

## Estructura

```
config.py         -> toda la configuracion de riesgo y capital, un solo sitio
data_feed.py       -> conexion a Binance, velas e indicadores tecnicos
signal_engine.py    -> aqui Claude analiza cada par y propone (no ejecuta)
risk_engine.py      -> reglas duras: sizing, limites, circuit breakers
executor.py          -> manda las ordenes ya aprobadas al exchange
backtest.py           -> valida el esqueleto de la estrategia con historico
logger_utils.py       -> logs de decisiones/trades + snapshots de estado + alertas Telegram
main.py                -> bucle principal
dashboard.py            -> servidor web local de solo lectura (visualiza logs/)
dashboard_static/       -> frontend del dashboard (HTML/CSS/JS, un solo fichero)
tests/                  -> tests del motor de riesgo (sin dependencias externas)
```

## Puesta en marcha

1. `pip install -r requirements.txt`
2. Copia `.env.example` a `.env` y rellena tus claves (nunca subir `.env` a git)
3. Crea la API key de Binance con permisos **SOLO trading**, **NUNCA retiro**, con IP whitelist
4. Ejecuta primero el backtest:
   ```
   python backtest.py --symbol BTC/USDT --days 365
   ```
   Repite para cada par de `config.TRADING_PAIRS`. Si el drawdown maximo o el
   win rate no te convencen, ajusta `config.py` antes de seguir.
5. Deja el bot corriendo en modo simulado (`DRY_RUN=true` en `.env`, el valor
   por defecto) minimo 2-4 semanas y revisa `logs/decisions.jsonl` y
   `logs/trades.jsonl` a diario
6. Solo entonces: `USE_TESTNET=false`, `DRY_RUN=false` en `.env`, y empieza con
   capital reducido real las primeras semanas

## Dashboard

Visualiza el bot en marcha (o el histórico de paper trading) en el navegador:

```
python dashboard.py
```

Abre `http://127.0.0.1:8787`. Es de **solo lectura**: lee `logs/state.json`,
`logs/state_history.jsonl`, `logs/decisions.jsonl` y `logs/trades.jsonl` — no
se conecta al exchange ni ejecuta nada, así que puedes correrlo en paralelo a
`main.py` (o solo, para revisar un histórico) sin ningún riesgo. Muestra:

- Estado en vivo: en marcha / detenido (y por qué), DRY_RUN/TESTNET, capital
- Circuit breakers con barra de progreso hacia su límite (drawdown diario,
  pérdidas consecutivas, exposición total)
- Gráfica de PnL diario en el tiempo, con la línea del límite de drawdown
- Gráfica de señales aprobadas vs rechazadas por par
- Posiciones abiertas, con filtros y búsqueda sobre el feed de señales y
  la tabla de órdenes
- Auto-refresco configurable (5/10/30/60s), pausable

Por defecto solo escucha en `127.0.0.1` (no lo expongas en red sin añadir
autenticación delante — muestra tu capital y PnL).

## Tests

```
python -m unittest discover -s tests
```

Cubren el motor de riesgo: stop-loss obligatorio, confianza minima, sizing
por riesgo fijo, limites de exposicion por activo/total, y los circuit
breakers de drawdown diario y perdidas consecutivas.

## Checklist antes de pasar a real (no te saltes ninguno)

- [ ] Backtest de al menos 1 ano en cada par, con drawdown maximo aceptable
- [ ] 2-4 semanas de paper trading sin sorpresas ni errores no controlados
- [ ] API key sin permiso de retiro, verificado
- [ ] Alertas de Telegram funcionando y probadas
- [ ] Kill switch probado: sabes parar el bot manualmente en segundos
- [ ] `BOT_CAPITAL_EUR` reflejando solo el capital que puedes permitirte perder,
      no tus ahorros totales
- [ ] Revisado `MAX_DAILY_DRAWDOWN_PCT` y `MAX_CONSECUTIVE_LOSSES` — son tu red
      de seguridad, no los subas "para que opere mas"

## Notas importantes

- **`risk_engine.py` es la unica fuente de verdad sobre riesgo.** Si algun dia
  metes mas logica de Claude en el bucle, que siga proponiendo, nunca
  ejecutando directamente.
- El backtest de `backtest.py` usa una estrategia simplificada (RSI+MACD) para
  validar el esqueleto de sizing y stops — NO reproduce el analisis cualitativo
  de Claude en vivo. Eso solo se valida con paper trading real.
- Cuando el bot se detiene por un circuit breaker (drawdown diario o perdidas
  consecutivas), se queda parado hasta revision manual — no se reactiva solo
  aunque pase el cooldown. Es una decision deliberada de diseno: un stop de
  seguridad no debe deshacerse sin que un humano lo revise.
- Nada aqui garantiza rentabilidad. El objetivo del diseno es limitar cuanto
  puedes perder, no prometer cuanto vas a ganar.
