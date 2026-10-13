# Orbital Bot

Bot de investigación para lanzamientos de pump.fun. Corre en **tu computadora**, mira cada lanzamiento real, predice qué pasará primero (+60%, −30% o nada en 60 minutos), mide lo que pasó de verdad y aprende de eso. Opera en papel por defecto y solo usa dinero real cuando cumple todos los requisitos que pongas.

> **Advertencia.** La mayoría de los tokens de pump.fun se van a cero y compites contra bots más rápidos. Este bot puede perder dinero. Usa solo una wallet nueva con una cantidad que estés dispuesto a perder completa. Nada de esto es consejo financiero.

## Cómo funciona

| Agente | Qué hace en esta versión |
|---|---|
| **SCOUT** | Recibe cada lanzamiento nuevo de pump.fun (PumpPortal) y sus precios y operaciones. |
| **CARTOGRAPHER** | Detecta creadores seriales, compradores que entran en los primeros 3 s (bundles/snipers) y cuánto supply compró el creador. |
| **JUDGE** | Lleva el historial de cada wallet compradora. Si una wallet compra temprano en tokens que suben +60%, pasa a ser "seguida". |
| **QUANT** | Calcula el valor esperado restando comisiones (pump.fun y PumpPortal), el impacto en la curva x·y=k, la comisión de prioridad y un margen por slippage. |
| **GUARD** | Bloquea los lanzamientos con señales de manipulación. Los bloqueados no se usan para aprender. |
| **EXECUTOR** | Abre y cierra posiciones con take-profit, stop-loss o al llegar a los 60 minutos. |

**El Orb** es un modelo de tres resultados que aprende en línea. 45 s después de cada lanzamiento (90 s en modo gratuito) toma una foto de 9 señales y estima P(+60% primero), P(−30% primero) y P(ninguno en 60 min). Cuando se sabe el resultado real, el modelo se actualiza con él, aunque el bot haya decidido no entrar.

El panel muestra la **mejora de información**: cuánto mejor predice el modelo que si solo usara la frecuencia histórica de cada resultado. Si se queda en 0% o es negativa, las señales no sirven y el bot no debería operar con dinero real.

## Radar (otras criptos, con noticias y gráficos)

Abre **http://localhost:8787/radar**. El radar **solo vigila y avisa: no compra ni vende**.

- **Qué monedas mira:** las 40 de más volumen en Binance, los tokens en tendencia de DEX en Solana, Base, Ethereum y BNB Chain (con al menos $50K de liquidez y $100K de volumen diario) y las que añadas tú. Para añadir una, escribe su símbolo (`BTC`, `PEPE`) o la dirección del token.
- **Gráfico (velas de 1 h):** tendencia con EMA 20/50, RSI, cruces de MACD, ruptura de máximos o mínimos de 48 h, picos de volumen y si el precio está demasiado estirado. Cada señal suma o resta puntos.
- **Noticias:** lee Cointelegraph, CoinDesk, Decrypt y The Block cada 10 minutos, detecta qué monedas mencionan y les da un tono positivo o negativo por palabras clave. Es una aproximación: no entiende la noticia como una persona.
- **Puntuación final (−100 a +100):** 70% gráfico y 30% noticias, más un pequeño extra si la moneda está en tendencia en CoinGecko.
- **Stop y objetivo sugeridos:** 2 y 3 veces la volatilidad (ATR) por debajo y por encima del precio actual.
- **Alertas:** cuando una moneda llega a 50 puntos o rompe máximos con noticias positivas.
- **¿Funciona?:** cada hora guarda la puntuación de cada moneda y, 24 h después, mira qué hizo el precio. Si durante semanas las monedas "fuertes" no suben más que la media, la puntuación no sirve para elegir.

Fuentes, todas gratis y sin clave: Binance (data-api.binance.vision), GeckoTerminal, CoinGecko y los RSS de cada medio. Para desactivar el radar, arranca con `RADAR=off`.

## Dos modos de datos

| | Gratuito (por defecto) | Completo |
|---|---|---|
| Qué necesitas | Nada | Clave de PumpPortal con ≥ 0.02 SOL |
| Lanzamientos | En vivo (PumpPortal) | En vivo |
| Precios | DexScreener cada 10 s | Cada operación, al instante |
| Datos por wallet (JUDGE, primeros 3 s, top-10) | No | Sí |

Empieza con el gratuito. Si después de unos días quieres mejores señales, pasa al completo. Cada modo guarda su propio modelo, porque las señales se miden distinto en cada uno.

## Instalación (una sola vez)

### 1. Instala Node.js
Descarga la versión **LTS** (22 o más nueva) desde https://nodejs.org e instálala con las opciones por defecto.

### 2. Descarga el bot
1. En GitHub, abre el repositorio `byluso/ui-ux-pro-max-skill`.
2. Cambia a la rama `ccr-150af661-wvs251` (o a `main` si ya se fusionó).
3. Pulsa **Code → Download ZIP** y descomprímelo.
4. Abre la carpeta `bot`.

### 3. Abre una terminal en la carpeta `bot`
- **Windows:** dentro de la carpeta `bot`, haz clic en la barra de direcciones del Explorador, escribe `cmd` y pulsa Enter.
- **Mac:** clic derecho sobre la carpeta `bot` → *Nuevo terminal en la carpeta*.

### 4. Instala las dependencias
```
npm install
```

### 5. Crea tu configuración
- **Windows:** `copy .env.example .env`
- **Mac/Linux:** `cp .env.example .env`

Puedes abrir `.env` con el Bloc de notas para cambiar valores. Para empezar no hace falta tocar nada.

## Uso diario

```
npm start
```

Abre **http://localhost:8787** en el navegador de esa misma computadora. Para apagar el bot, pulsa `Ctrl + C` en la terminal (guarda lo aprendido antes de cerrarse). El bot solo aprende y opera mientras está encendido.

## Etapas recomendadas

**Etapa 1 · Aprender (sin dinero).** Déjalo en `MODE=paper` el mayor tiempo posible. Necesita al menos 1000 resultados medidos; en modo gratuito eso suele tomar uno o dos días con el bot encendido.

**Etapa 2 · Papel.** Cuando el modelo empiece a dar señales, cada una se simula con costes reales. Revisa el panel *Resultados en papel*. Si después de 30 operaciones o más el resultado acumulado es negativo, el sistema no tiene ventaja y **no** debes pasar a dinero real.

**Etapa 3 · Dinero real (opcional).** Solo cuando el panel *Listo para dinero real* tenga todo resuelto excepto la wallet y `MODE`:

1. Crea una cuenta gratis en https://www.helius.dev, copia tu clave y ponla en `.env`:
   `RPC_URL=https://mainnet.helius-rpc.com/?api-key=TU_CLAVE`
2. Crea la wallet del bot con `npm run wallet`. La terminal te muestra su dirección. **Haz una copia de seguridad de `.env`**: si lo pierdes, pierdes los fondos.
3. Envía a esa dirección una cantidad pequeña, por ejemplo 0.1–0.5 SOL.
4. Cambia `MODE=paper` por `MODE=live` en `.env` y reinicia el bot.

Aun con `MODE=live`, el bot **no opera con dinero real** mientras falte algún requisito: 1000 etiquetas, mejora de información ≥ 2%, 30 operaciones en papel con resultado positivo y saldo suficiente. Si el rendimiento en papel se vuelve negativo, vuelve a operar solo en papel.

### Límites de seguridad (en `.env`)
| Ajuste | Por defecto | Qué hace |
|---|---|---|
| `MAX_SOL_PER_TRADE` | 0.03 | Máximo por operación (el código rechaza más de 1 SOL). |
| `MAX_OPEN` | 2 | Posiciones reales abiertas a la vez. |
| `DAILY_LOSS_LIMIT_SOL` | 0.10 | Si pierde esto en un día, se detiene solo. |
| `WALLET_RESERVE_SOL` | 0.02 | Saldo que nunca usa (para comisiones de venta). |

En el panel tienes **Detener** (no abre nada nuevo) y **Detener y vender todo**. Esa parada se mantiene aunque reinicies el bot, hasta que pulses **Reanudar**.

## Pasar al modo completo (opcional)
1. En https://pumpportal.fun genera una API key. Guarda también la clave privada que te muestra la página.
2. Envía al menos 0.02 SOL a la wallet asociada a esa API key. PumpPortal lo exige para entregar datos de operaciones y puede cobrar por volumen de mensajes; revisa sus precios. El panel muestra cuántos mensajes por hora recibes.
3. Pon `PUMPPORTAL_API_KEY=tu_clave` en `.env` y reinicia el bot.

Para gastar menos datos, baja `TRACK_SAMPLE` (por ejemplo a `0.2` para seguir solo el 20% de los lanzamientos).

## Archivos que crea el bot (carpeta `data/`)
- `model.json` / `model-dex.json`: lo que aprendió el modelo.
- `labels.jsonl`: cada lanzamiento medido, con sus señales y su resultado.
- `paper.jsonl` y `live.jsonl`: operaciones en papel y reales.
- `wallets.json`, `creators.json`: historial de JUDGE y CARTOGRAPHER.

Si borras `data/`, el bot empieza a aprender desde cero.

## Seguridad
- `.env` y `data/` nunca se suben a GitHub (están en `.gitignore`).
- La clave privada solo se usa para firmar en tu computadora. PumpPortal arma la transacción, pero nunca recibe tu clave.
- El panel solo es accesible desde tu propia computadora (`127.0.0.1`).
- Nunca pegues tu clave privada en un chat, ni siquiera conmigo.

## Prueba sin red
```
npm run selftest
```
Simula 4 horas de lanzamientos para comprobar que observación, etiquetas y aprendizaje funcionan.
