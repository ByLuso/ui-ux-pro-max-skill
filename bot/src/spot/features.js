// Señales para el modelo, calculadas solo con velas ANTERIORES al momento de decidir (sin mirar el futuro).
import { ema, rsi, atr } from "../radar/ta.js";

export const SPOT_SIGNALS = [
  { k: "r1", ag: "CHT", name: "Cambio última hora" },
  { k: "r4", ag: "CHT", name: "Cambio últimas 4 h" },
  { k: "r24", ag: "CHT", name: "Cambio últimas 24 h" },
  { k: "rsi", ag: "CHT", name: "RSI 14 (1 h)" },
  { k: "dEma20", ag: "CHT", name: "Distancia a la EMA 20" },
  { k: "dEma50", ag: "CHT", name: "Distancia a la EMA 50" },
  { k: "slope", ag: "CHT", name: "Pendiente de la EMA 20" },
  { k: "macd", ag: "CHT", name: "Histograma MACD" },
  { k: "atrPct", ag: "CHT", name: "Volatilidad (ATR %)" },
  { k: "volRatio", ag: "CHT", name: "Volumen frente a su media" },
  { k: "breakout", ag: "CHT", name: "Precio frente al máximo de 48 h" },
  { k: "bbWidth", ag: "CHT", name: "Anchura de las bandas de Bollinger" },
  { k: "btc4", ag: "MKT", name: "BTC últimas 4 h" },
  { k: "btc24", ag: "MKT", name: "BTC últimas 24 h" },
  { k: "news", ag: "NWS", name: "Tono de las noticias" },
  { k: "alpha", ag: "MKT", name: "Token de Binance Wallet" },
  { k: "liq", ag: "MKT", name: "Volumen / liquidez (log)" },
];

const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const std = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((v) => (v - m) ** 2))); };

// h: velas de 1 h cerradas, de la más antigua a la más reciente (mínimo 60)
export function spotFeatures(h, ctx) {
  if (!h || h.length < 60) return null;
  const c = h.map((x) => x.c), hi = h.map((x) => x.h), lo = h.map((x) => x.l), v = h.map((x) => x.v);
  const n = c.length, px = c[n - 1];
  const e20 = ema(c, 20), e50 = ema(c, 50), e12 = ema(c, 12), e26 = ema(c, 26);
  const macd = e12.map((x, i) => x - e26[i]), sig = ema(macd, 9);
  const a = atr(hi, lo, c);
  const ret = (k) => (n > k ? px / c[n - 1 - k] - 1 : 0);
  const last20 = c.slice(n - 20);
  const s = {
    r1: ret(1), r4: ret(4), r24: ret(24),
    rsi: rsi(c.slice(-100)),
    dEma20: px / e20[n - 1] - 1, dEma50: px / e50[n - 1] - 1,
    slope: e20[n - 1] / e20[n - 6] - 1,
    macd: (macd[n - 1] - sig[n - 1]) / px,
    atrPct: a / px,
    volRatio: avg(v.slice(n - 3)) / (avg(v.slice(n - 51, n - 3)) || 1e-9),
    breakout: px / Math.max(...hi.slice(n - 49, n - 1)) - 1,
    bbWidth: (4 * std(last20)) / avg(last20),
    btc4: ctx.btc4 ?? NaN, btc24: ctx.btc24 ?? NaN,
    news: Number.isFinite(ctx.news) ? ctx.news : NaN,
    alpha: ctx.alpha ? 1 : 0,
    liq: Math.log10(1 + (ctx.liq || 0)),
    px, atr: a,
  };
  return s;
}

// Vector numérico para el modelo; NaN = dato desconocido (el modelo lo coloca en la media)
export function spotVector(s) {
  return [
    s.r1 * 100, s.r4 * 100, s.r24 * 100, s.rsi, s.dEma20 * 100, s.dEma50 * 100, s.slope * 100, s.macd * 1000,
    s.atrPct * 100, Math.log(s.volRatio + 1e-3), s.breakout * 100, s.bbWidth * 100,
    s.btc4 * 100, s.btc24 * 100, s.news, s.alpha, s.liq,
  ].map((x) => (Number.isFinite(x) ? x : NaN));
}

// Retorno de BTC en las últimas k horas, en el momento `until`
export function btcContext(btcHourly, until) {
  const h = btcHourly.filter((x) => x.t + 3600000 <= until);
  const n = h.length;
  if (n < 25) return {};
  return { btc4: h[n - 1].c / h[n - 5].c - 1, btc24: h[n - 1].c / h[n - 25].c - 1 };
}
