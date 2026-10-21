// Cartera agresiva: rotación de momentum (solo Binance), con dinero ficticio.
// Mientras BTC está por encima de su media de 30 días, mantiene las 8 monedas más fuertes de la semana entre las 80
// con más volumen (solo las que están sobre su EMA 50). Si BTC cae por debajo, pasa a liquidez.
// El capital se reparte en 72 tramos; cada hora rota solo uno (cada tramo cambia de monedas cada 72 h). Así el
// resultado no depende de la hora a la que se rota, que era pura suerte al probarlo con un solo tramo.
// Probada con 480 días de velas de 1 h de 80 monedas de Binance (ver README). Más rentabilidad y más riesgo que la prudente.
import { cfg } from "../config.js";
import { loadJSON, saveJSON } from "../store.js";
import { ema } from "../radar/ta.js";
import { btcTrend } from "./strategy.js";
import { fmtPx } from "./wallet.js";

const H1 = 3600e3;
export const AGGRO = {
  name: "Rotación de momentum",
  top: cfg.spot.aggroTop, every: cfg.spot.aggroEvery, universe: 80,
  fee: cfg.spot.cexFee + 0.0005, // comisión + deslizamiento por lado
  // Cartera simulada con 480 días (BTC −25%), partida en mitades y tercios; ver README
  design: { days: 480, ret: 0.43, maxDD: 0.26, btc: -0.25, bear: { ret: -0.09, btc: -0.41 }, bull: { ret: 0.57, btc: 0.28 } },
};

// Las `top` más fuertes en 7 días entre las 80 de más volumen, solo si están sobre su EMA 50: [{ id, r168 }]
export function pick(list) {
  return list.slice().sort((a, b) => b.vol - a.vol).slice(0, AGGRO.universe)
    .filter((x) => x.dEma50 > 0 && Number.isFinite(x.r168)).sort((a, b) => b.r168 - a.r168).slice(0, AGGRO.top);
}

export class RotationWallet {
  constructor() {
    const s = loadJSON("spot-rotation.json", null);
    if (s && s.startEur === cfg.spot.aggroStartEur && s.tranches?.length === AGGRO.every) Object.assign(this, s);
    else this.reset();
  }

  reset(eurUsdt = null) {
    const fx = eurUsdt || 1.1, usd = cfg.spot.aggroStartEur * fx;
    Object.assign(this, {
      startEur: cfg.spot.aggroStartEur, fx0: fx, fxOk: !!eurUsdt, started: Date.now(),
      tranches: Array.from({ length: AGGRO.every }, () => ({ cash: usd / AGGRO.every, hold: {} })), // hold: { coinId: cantidad }
      last: {}, events: [], curve: [{ t: Date.now(), v: cfg.spot.aggroStartEur }], peak: cfg.spot.aggroStartEur, maxDD: 0, rotations: 0,
    });
    this.save();
  }

  // Si se creó antes de conocer el cambio EUR/USDT, ajusta la liquidez inicial para que valga exactamente lo prometido
  fixFx(eurUsdt) {
    if (this.fxOk || !eurUsdt) return;
    if (this.tranches.every((t) => !Object.keys(t.hold).length)) for (const t of this.tranches) t.cash *= eurUsdt / this.fx0;
    this.fxOk = true;
  }

  px(coins, id) { const c = coins.get(id); if (c && c.px > 0) this.last[id] = c.px; return this.last[id] || 0; }
  usd(coins) { let v = 0; for (const t of this.tranches) { v += t.cash; for (const [id, q] of Object.entries(t.hold)) v += q * this.px(coins, id); } return v; }

  // Rota el tramo que toca a la hora H: vende lo que ya no está entre las elegidas y reparte entre las que entran
  rotate(H, coins, picks, on, eurUsdt) {
    const j = Math.floor(H / H1) % AGGRO.every, t = this.tranches[j];
    const want = on ? picks.map((x) => x.id) : [];
    const sold = [], bought = [];
    for (const [id, q] of Object.entries(t.hold)) {
      if (want.includes(id)) continue;
      t.cash += q * this.px(coins, id) * (1 - AGGRO.fee);
      delete t.hold[id]; sold.push(coins.get(id)?.sym || id.slice(4, -4));
    }
    const value = t.cash + Object.entries(t.hold).reduce((a, [id, q]) => a + q * this.px(coins, id), 0);
    const add = want.filter((id) => !(id in t.hold) && this.px(coins, id) > 0);
    for (const id of add) {
      const usd = Math.min(t.cash, value / want.length);
      if (usd <= 0) break;
      t.cash -= usd; t.hold[id] = (usd * (1 - AGGRO.fee)) / this.px(coins, id); bought.push(coins.get(id)?.sym || id);
    }
    this.rotations++;
    if (sold.length || bought.length) {
      const share = 100 / AGGRO.every;
      this.event(`tramo ${j + 1}/${AGGRO.every} (${share.toFixed(1)}% del capital)${bought.length ? ` · compra ${bought.join(", ")}` : ""}${sold.length ? ` · vende ${sold.join(", ")}` : ""}${!on ? " · BTC bajo su media: pasa a liquidez" : ""}`);
    }
    this.sample(coins, eurUsdt);
    return { j, sold, bought };
  }

  event(txt) { this.events.unshift({ t: Date.now(), txt }); if (this.events.length > 150) this.events.pop(); }

  sample(coins, eurUsdt) {
    if (!this.fxOk) return;
    const v = this.usd(coins) / (eurUsdt || 1.1);
    this.peak = Math.max(this.peak, v); this.maxDD = Math.max(this.maxDD, 1 - v / this.peak);
    this.curve.push({ t: Date.now(), v });
    if (this.curve.length > 3000) this.curve.splice(0, this.curve.length - 3000);
    this.save();
  }

  save() { saveJSON("spot-rotation.json", this); }

  state(coins, eurUsdt) {
    const fx = eurUsdt || 1.1, total = this.usd(coins), by = {};
    let cash = 0;
    for (const t of this.tranches) { cash += t.cash; for (const [id, q] of Object.entries(t.hold)) by[id] = (by[id] || 0) + q; }
    const hold = Object.entries(by).map(([id, q]) => {
      const c = coins.get(id), v = q * this.px(coins, id);
      return { id, sym: c?.sym || id, px: this.px(coins, id), pxTxt: fmtPx(this.px(coins, id)), eur: v / fx, share: v / total, ch24: c?.ch24 ?? null };
    }).sort((a, b) => b.eur - a.eur);
    const eq = total / fx;
    return { startEur: this.startEur, equity: eq, pnl: eq - this.startEur, pnlPct: eq / this.startEur - 1, started: this.started, cashEur: cash / fx, cashShare: cash / total,
      maxDD: this.maxDD, ddNow: 1 - eq / this.peak, hold, events: this.events.slice(0, 30), curve: this.curve.slice(-500), rotations: this.rotations };
  }
}

// Prueba escalonada con el historial que se descarga al arrancar (velas de 1 h). Mismas reglas que en vivo.
export function backtest(coins) {
  const btc = coins.find((c) => c.pair === "BTCUSDT"), bt = btcTrend(btc?.h1);
  const series = coins.filter((c) => c.h1 && c.h1.length > 300).map((c) => {
    const cl = c.h1.map((k) => k.c), e50 = ema(cl, 50), at = new Map(c.h1.map((k, i) => [k.t, i]));
    return { id: c.id, h: c.h1, cl, e50, at, vol: c.vol24 || 0 };
  });
  if (!btc || series.length < 30) return null;
  const times = btc.h1.slice(200).map((k) => k.t);
  const price = (s, t) => { const i = s.at.get(t); return i == null ? null : s.cl[i]; };
  const byId = new Map(series.map((s) => [s.id, s]));
  const tr = Array.from({ length: AGGRO.every }, () => ({ eq: 1, hold: [] }));
  let prev = null, pk = 1, dd = 0, v = 1;
  for (const t of times) {
    if (prev != null) for (const x of tr) if (x.hold.length) {
      let g = 0; for (const id of x.hold) { const s = byId.get(id), a = price(s, prev), b = price(s, t); g += (a && b ? b / a : 1) / x.hold.length; } x.eq *= g;
    }
    prev = t;
    v = tr.reduce((a, x) => a + x.eq, 0) / tr.length; pk = Math.max(pk, v); dd = Math.max(dd, 1 - v / pk);
    const x = tr[Math.floor(t / H1) % AGGRO.every];
    const list = series.map((s) => { const i = s.at.get(t); return i == null || i < 168 ? null : { id: s.id, vol: s.vol, dEma50: s.cl[i] / s.e50[i] - 1, r168: s.cl[i] / s.cl[i - 168] - 1 }; }).filter(Boolean);
    const want = bt.get(t)?.up ? pick(list).map((p) => p.id) : [];
    const changed = x.hold.filter((id) => !want.includes(id)).length + want.filter((id) => !x.hold.includes(id)).length;
    if (changed) x.eq *= 1 - (AGGRO.fee * changed) / AGGRO.top;
    x.hold = want;
  }
  const btcRet = btc.h1.at(-1).c / btc.h1[200].c - 1;
  return { ret: v - 1, maxDD: dd, btc: btcRet, days: times.length / 24, t: Date.now() };
}

// Serie horaria del mercado con el historial (para los minigráficos al arrancar): amplitud, semana, BTC y fuerza de las líderes
export function marketSeries(coins, hours = 72) {
  const btc = coins.find((c) => c.pair === "BTCUSDT"), bt = btcTrend(btc?.h1);
  if (!btc?.h1?.length) return [];
  const series = coins.filter((c) => c.h1 && c.h1.length > 300).map((c) => {
    const cl = c.h1.map((k) => k.c), e50 = ema(cl, 50);
    return { id: c.id, cl, e50, at: new Map(c.h1.map((k, i) => [k.t, i])), vol: c.vol24 || 0 };
  });
  const out = [];
  for (const k of btc.h1.slice(-hours)) {
    const list = series.map((s) => { const i = s.at.get(k.t); return i == null || i < 168 ? null : { id: s.id, vol: s.vol, dEma50: s.cl[i] / s.e50[i] - 1, r168: s.cl[i] / s.cl[i - 168] - 1 }; }).filter(Boolean);
    if (list.length < 30) continue;
    const top = pick(list), b = bt.get(k.t);
    out.push({ t: k.t + H1, breadth: list.filter((x) => x.dEma50 > 0).length / list.length, week: list.filter((x) => x.r168 > 0).length / list.length,
      btc: k.c, btcVs: b ? k.c / b.ema - 1 : null, lead: top.length ? top.reduce((a, x) => a + x.r168, 0) / top.length : null, news: null, ups: null });
  }
  return out;
}
