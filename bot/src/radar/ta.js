// Análisis técnico sobre velas de 1 hora: tendencia, momento, rupturas y volumen.
// Devuelve una puntuación de −100 a +100 y la lista de señales que la explican.

export function ema(a, n) {
  const k = 2 / (n + 1);
  let e = a[0];
  return a.map((v) => (e = v * k + e * (1 - k)));
}

export function rsi(c, n = 14) {
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export function atr(h, l, c, n = 14) {
  const tr = c.map((_, i) => (i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]));
  return ema(tr, n).at(-1);
}

const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

// candles: [{t, o, h, l, c, v}] de la más antigua a la más reciente
export function analyze(candles) {
  if (!candles || candles.length < 60) return null;
  const c = candles.map((x) => x.c), h = candles.map((x) => x.h), l = candles.map((x) => x.l), v = candles.map((x) => x.v);
  const n = c.length, price = c[n - 1];
  const e20 = ema(c, 20), e50 = ema(c, 50), e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = e12.map((x, i) => x - e26[i]), sig = ema(macd, 9), hist = macd.map((x, i) => x - sig[i]);
  const r = rsi(c), a = atr(h, l, c);
  const prevHigh = Math.max(...h.slice(n - 49, n - 1)), prevLow = Math.min(...l.slice(n - 49, n - 1));
  const volNow = avg(v.slice(n - 3)), volBase = avg(v.slice(n - 51, n - 3)) || 1e-9;
  const up3 = c[n - 1] > c[n - 4];
  const ch24 = n > 24 ? price / c[n - 25] - 1 : null;

  const S = [];
  const add = (w, txt) => S.push({ w, txt });
  if (price > e50[n - 1] && e20[n - 1] > e50[n - 1]) add(25, "Tendencia alcista (precio sobre EMA 20 y 50)");
  else if (price < e50[n - 1] && e20[n - 1] < e50[n - 1]) add(-25, "Tendencia bajista (precio bajo EMA 20 y 50)");
  if (e20[n - 1] > e20[n - 6]) add(10, "EMA 20 subiendo"); else add(-10, "EMA 20 bajando");
  if (r > 75) add(-15, `RSI ${r.toFixed(0)}: sobrecompra`);
  else if (r >= 50) add(10, `RSI ${r.toFixed(0)}: impulso sano`);
  else if (r < 30) add(5, `RSI ${r.toFixed(0)}: sobreventa, posible rebote`);
  else if (r < 45) add(-5, `RSI ${r.toFixed(0)}: impulso débil`);
  const crossUp = [1, 2, 3].some((k) => hist[n - k] > 0 && hist[n - k - 1] <= 0);
  const crossDn = [1, 2, 3].some((k) => hist[n - k] < 0 && hist[n - k - 1] >= 0);
  if (crossUp) add(15, "MACD cruzó al alza");
  if (crossDn) add(-15, "MACD cruzó a la baja");
  if (price > prevHigh) add(20, "Rompe el máximo de 48 h");
  if (price < prevLow) add(-20, "Pierde el mínimo de 48 h");
  if (volNow / volBase > 2) add(up3 ? 10 : -10, `Volumen ${(volNow / volBase).toFixed(1)}× la media ${up3 ? "con subida" : "con caída"}`);
  if (price > e20[n - 1] + 3 * a) add(-10, "Muy estirado sobre su media (riesgo de retroceso)");

  const score = Math.max(-100, Math.min(100, S.reduce((s, x) => s + x.w, 0)));
  return {
    price, ch24, rsi: r, atr: a, ema20: e20[n - 1], ema50: e50[n - 1],
    support: Math.min(...l.slice(n - 24)), resistance: prevHigh,
    stop: price - 2 * a, target: price + 3 * a,
    signals: S.sort((x, y) => Math.abs(y.w) - Math.abs(x.w)), score,
  };
}
