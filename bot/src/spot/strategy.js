// Estrategia «Tendencia de mercado» (solo Binance).
// Una moneda solo se compra cuando sube casi todo el mercado a la vez, y solo si está entre las más fuertes de la semana.
// Sale con un stop móvil que sigue al precio: corta pronto lo que va mal y deja correr lo que va bien.
// Se eligió probando varias estrategias con 480 días de historial de 80 monedas de Binance, con comisiones:
// todas las demás perdían de media; esta fue la única claramente por encima de cero (ver README).
import { cfg } from "../config.js";
import { spotFeatures } from "./features.js";

const H1 = 3600e3;
export const TREND = {
  name: "Tendencia de mercado",
  breadth: cfg.spot.trendBreadth, // mínimo de monedas por encima de su EMA 50
  week: cfg.spot.trendWeek,       // mínimo de monedas que suben en 7 días
  top: 0.7,                       // la moneda debe estar en el 30% que más sube en 7 días
  stopAtr: 2, trailAtr: 3, horizonH: 72,
  cost: 2 * cfg.spot.cexFee + 2 * 0.0005,
  design: { days: 480, coins: 80, n: 2120, avg: 0.0023, win: 0.35, monthsUp: 9, months: 16 },
};

// Estado del mercado a partir de las señales de cada moneda en la misma hora: [{ id, s }]
export function regimeOf(list) {
  const l = list.filter((x) => x.s && Number.isFinite(x.s.r168) && Number.isFinite(x.s.dEma50));
  if (l.length < 30) return null;
  const breadth = l.filter((x) => x.s.dEma50 > 0).length / l.length;
  const week = l.filter((x) => x.s.r168 > 0).length / l.length;
  const pct = new Map();
  l.slice().sort((a, b) => a.s.r168 - b.s.r168).forEach((x, j) => pct.set(x.id, j / (l.length - 1)));
  return { n: l.length, breadth, week, on: breadth > TREND.breadth && week > TREND.week, pct };
}

export const coinOk = (s, pct) => s.dEma50 > 0 && pct >= TREND.top;

// Salida con stop móvil sobre velas de 1 h (si una vela toca el stop, sale al stop o a la apertura si abrió por debajo)
export function simulate(h, i, s) {
  const e = s.px;
  let stop = e - TREND.stopAtr * s.atr, peak = e;
  for (let j = i + 1; j < h.length; j++) {
    const k = h[j];
    let px = null;
    if (k.l <= stop) px = Math.min(k.o, stop);
    else if (j - i >= TREND.horizonH) px = k.c;
    if (px != null) return { ret: px / e - 1 - TREND.cost, out: k.t + H1 };
    peak = Math.max(peak, k.h);
    stop = Math.max(stop, peak - TREND.trailAtr * s.atr);
  }
  return null;
}

// Prueba con el historial que se descarga al arrancar (velas de 1 h, ~41 días). Sin mirar el futuro.
export function backtest(coins) {
  const rows = new Map();
  for (const c of coins) {
    const h = c.h1 || [];
    for (let i = 200; i < h.length - 1; i++) {
      const s = spotFeatures(h.slice(i - 199, i + 1), {});
      if (!s || !(s.atr > 0)) continue;
      s.r168 = h[i].c / h[i - 168].c - 1;
      const t = h[i].t;
      if (!rows.has(t)) rows.set(t, []);
      rows.get(t).push({ id: c.id, c, i, s });
    }
  }
  const busy = new Map(), trades = [];
  let hours = 0, active = 0;
  for (const t of [...rows.keys()].sort((a, b) => a - b)) {
    const R = regimeOf(rows.get(t));
    if (!R) continue;
    hours++;
    if (!R.on) continue;
    active++;
    for (const x of rows.get(t)) {
      if (!coinOk(x.s, R.pct.get(x.id) ?? 0) || (busy.get(x.id) || 0) > t) continue;
      const r = simulate(x.c.h1, x.i, x.s);
      if (!r) continue;
      busy.set(x.id, r.out);
      trades.push(r.ret);
    }
  }
  const n = trades.length;
  return { n, avg: n ? trades.reduce((a, b) => a + b, 0) / n : null, wins: trades.filter((r) => r > 0).length, hours, active, days: hours / 24, t: Date.now() };
}
