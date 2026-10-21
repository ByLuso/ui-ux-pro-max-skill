// Radar de Binance + Binance Wallet: datos en tiempo real gratis, análisis por hora, modelo que aprende y cartera de prueba.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { cfg, ROOT } from "../config.js";
import { loadJSON, saveJSON, appendLine, readLines } from "../store.js";
import { Model, TP, SL, TM } from "../model.js";
import { analyze } from "../radar/ta.js";
import { News, matcher } from "../radar/news.js";
import { checkSecurity } from "../radar/security.js";
import { Market, hourly } from "./market.js";
import { SPOT_SIGNALS, spotFeatures, spotVector, btcContext } from "./features.js";
import { SpotWallet, slipOf, pc, fmtPx } from "./wallet.js";
import { Calib } from "./calib.js";
import { TREND, regimeOf, coinOk, btcTrend, backtest as trendBacktest } from "./strategy.js";
import { AGGRO, RotationWallet, pick as aggroPick, backtest as aggroBacktest, marketSeries } from "./rotation.js";

const H1 = 3600000, M15 = 15 * 60000, H = cfg.spot.horizonH * H1;
const RR = cfg.spot.targetAtr / cfg.spot.stopAtr; // ganancia del objetivo medida en "riesgos" (R)
const NF = SPOT_SIGNALS.length;
const VER = 2; // al cambiar, se rehace el aprendizaje inicial con el historial (p. ej. al ampliar la lista de monedas)
const MATURE = 2000; // casos a partir de los cuales la calibración ya es fiable

// ---------- estado ----------
const market = new Market();
const news = new News();
const wallet = new SpotWallet();
const rot = new RotationWallet();
const saved = loadJSON("spot-model.json", null);
const fresh = !saved || saved.nf !== NF || loadJSON("spot-backtest.json", null)?.ver !== VER;
let model = Model.from(saved, NF);
if (fresh) { model = new Model(NF); model.tpRet = RR; model.slRet = -1; model.timeRet = 0; } // retornos en R
const calib = new Calib(fresh ? null : loadJSON("spot-calib.json", null));
const views = new Map((loadJSON("spot-views.json", []) || []).map((v) => [v.id, v])); // casos esperando resultado
const S = {
  started: Date.now(), paused: loadJSON("spot-state.json", {}).paused || false,
  decisions: [], log: [], backtest: fresh ? null : loadJSON("spot-backtest.json", null), sec: new Map(),
  agents: Object.fromEntries(["SCT", "CHT", "NWS", "ORB", "GRD", "QNT", "EXE"].map((k) => [k, { txt: "esperando…", t: 0, n: 0 }])),
  signalsToday: 0, warm: null,
};
const eur = () => market.eurUsdt || 1.08;
function agent(k, txt) { const a = S.agents[k]; a.txt = txt; a.t = Date.now(); a.n++; }
function log(tag, msg) { S.log.unshift({ t: Date.now(), tag, msg }); if (S.log.length > 80) S.log.pop(); console.log(new Date().toLocaleTimeString(), `[${tag}]`, msg); }

// ---------- noticias por moneda ----------
const matchers = new Map();
function newsFor(c) {
  if (!matchers.has(c.id)) matchers.set(c.id, matcher(c.sym.toUpperCase(), c.kind === "alpha" ? c.name : ""));
  return news.forCoin(matchers.get(c.id));
}

// ---------- evaluación de una moneda al cerrar una hora ----------
function evaluate(c, hourEnd, opts = {}) {
  const all = opts.hours || hourly(c.c15, hourEnd);
  const h = all.slice(-200);
  const btc = market.coins.get("cex:BTCUSDT");
  // La liquidez/volumen solo se conoce la de ahora: en el historial queda como desconocida (si no, miraría el futuro)
  const ctx = { ...(btc ? btcContext(opts.btcHours || hourly(btc.c15, hourEnd), hourEnd) : {}), alpha: c.kind === "alpha", liq: opts.history ? NaN : c.kind === "alpha" ? c.liq : c.vol24 };
  if (!opts.history) { const n = newsFor(c); ctx.news = n.count ? n.score : NaN; }
  const s = spotFeatures(h, ctx);
  if (!s || !(s.atr > 0)) return null;
  s.r168 = all.length > 168 ? s.px / all[all.length - 169].c - 1 : NaN;
  const f = spotVector(s);
  let p = null, pRaw = null;
  if (!opts.noModel) { model.observe(f); pRaw = model.predict(f); p = calib.apply(pRaw); }
  const risk = (cfg.spot.stopAtr * s.atr) / s.px;
  const v = { id: `${c.id}:${hourEnd}`, coin: c.id, sym: c.sym, t: hourEnd, end: hourEnd + H, entry: s.px, atr: s.atr, risk,
    stop: s.px - cfg.spot.stopAtr * s.atr, target: s.px + cfg.spot.targetAtr * s.atr, f, p, pRaw };
  return { v, s, h };
}

// Beneficio esperado en %: probabilidades × resultados medidos (en R) × riesgo − costes + corrección por realidad
function quant(c, v, bias) {
  const tpR = Math.min(model.tpRet, RR), slR = Math.min(model.slRet, -1), tmR = model.timeRet;
  const evR = v.p[0] * tpR + v.p[1] * slR + v.p[2] * tmR;
  const fee = c.kind === "cex" ? cfg.spot.cexFee : cfg.spot.alphaFee;
  const costs = 2 * fee + 2 * slipOf(c, cfg.paperTradeEur * eur());
  const evRaw = evR * v.risk - costs;
  return { evR, costs, evRaw, ev: evRaw + bias };
}

function guard(c, s) {
  if (c.kind === "alpha") {
    const sec = S.sec.get(c.id);
    if (sec && !sec.ok) return `seguridad: ${sec.reasons[0]}`;
    if ((c.liq || 0) < cfg.spot.alphaMinLiq) return `liquidez baja ($${Math.round((c.liq || 0) / 1000)}K)`;
  }
  const n = newsFor(c);
  if (n.count && n.score <= -50) return `noticias muy negativas (${n.score})`;
  if (s.atrPct < 0.002) return "se mueve demasiado poco para cubrir comisiones";
  if (s.atrPct > 0.08) return `volatilidad extrema (${(s.atrPct * 100).toFixed(1)}% por hora)`;
  if (c.cooldown && Date.now() < c.cooldown) return "enfriamiento tras un stop reciente";
  return null;
}

function decide(c, hourEnd, live) {
  const t0 = performance.now(), T = [];
  const step = (ag, txt) => T.push({ ag, ms: performance.now() - t0, txt });
  const r = evaluate(c, hourEnd);
  if (!r) return;
  const { v, s, h } = r;
  step("SCT", `vela de 1 h cerrada · precio ${fmtPx(s.px)} · ${pc(s.r24)} en 24 h · ${Number.isFinite(s.r168) ? pc(s.r168) : "—"} en 7 días · volumen ${Math.round((c.vol24 || 0) / 1e6)} M$`);
  views.set(v.id, v);
  const ta = analyze(h);
  const bias = evBias().bias;
  const q = quant(c, v, bias);
  c.view = v;
  c.last = { t: hourEnd, p: v.p, ev: q.ev, evR: q.evR, evRaw: q.evRaw, risk: v.risk, stop: v.stop, target: v.target, s, ta: ta ? { score: ta.score, top: ta.signals.slice(0, 3), rsi: ta.rsi } : null };
  step("CHT", `RSI ${s.rsi.toFixed(0)} · ${s.dEma50 >= 0 ? "sobre" : "bajo"} la EMA 50 (${pc(s.dEma50)}) · ATR ${(s.atrPct * 100).toFixed(2)}%/h${ta && ta.signals[0] ? " · " + ta.signals[0].txt : ""}`);
  { const n = newsFor(c); step("NWS", n.count ? `${n.count} noticias en 48 h · tono ${n.score > 0 ? "+" : ""}${n.score}` : "sin noticias en 48 h"); }
  step("ORB", `estado · objetivo ${v.p[0].toFixed(2)} · stop ${v.p[1].toFixed(2)} · nada en ${cfg.spot.horizonH} h ${v.p[2].toFixed(2)} (modelo ${v.pRaw[0].toFixed(2)} → calibrado)`);
  agent("CHT", `${c.sym}: RSI ${s.rsi.toFixed(0)} · ${s.dEma50 >= 0 ? "sobre" : "bajo"} la EMA 50 · ATR ${(s.atrPct * 100).toFixed(2)}%/h${ta && ta.signals[0] ? " · " + ta.signals[0].txt : ""}`);
  agent("ORB", `${c.sym}: P(objetivo) ${v.p[0].toFixed(2)} · P(stop) ${v.p[1].toFixed(2)} · P(nada en ${cfg.spot.horizonH} h) ${v.p[2].toFixed(2)}`);
  const block = guard(c, s);
  c.last.guard = block;
  let dec = "skip", reason = `EV ${pc(q.ev)} tras costes · mínimo ${pc(cfg.spot.evMin, 0)}`;
  step("GRD", block ? `BLOQUEA · ${block}` : `pasa · ${c.kind === "alpha" ? (S.sec.get(c.id)?.ok ? "contrato revisado con GoPlus" : "contrato pendiente de revisar") : "listada en Binance"} · volatilidad ${(s.atrPct * 100).toFixed(2)}%/h`);
  step("QNT", `${pc(q.evR * v.risk)} esperado − costes ${(q.costs * 100).toFixed(2)}%${bias ? ` ${pc(bias)} corrección` : ""} = EV ${pc(q.ev)} (mínimo ${pc(cfg.spot.evMin, 0)})`);
  if (block) { dec = "block"; reason = block; agent("GRD", `bloquea ${c.sym}: ${block}`); }
  else {
    agent("GRD", `${c.sym} pasa los filtros`);
    agent("QNT", `${c.sym}: ${pc(q.evR * v.risk)} esperado − costes ${(q.costs * 100).toFixed(2)}%${bias ? ` ${pc(bias)} corrección` : ""} = EV ${pc(q.ev)}`);
    if (q.ev >= cfg.spot.evMin) {
      if (!live) reason = "señal con datos atrasados (tras un corte): no se opera";
      else if (model.labels < cfg.spot.minLabels) reason = `señal, pero el modelo aún aprende (${model.labels}/${cfg.spot.minLabels} casos)`;
      else if (S.paused) reason = "señal, pero las señales están en pausa";
      else {
        const why = wallet.open(c, v, q, eur());
        dec = "entry"; reason = why ? `señal · no compra: ${why}` : `señal · compra en la cartera de prueba · EV ${pc(q.ev)}`;
        if (!why) { S.signalsToday++; log("EXE", `compra ${c.sym} · EV ${pc(q.ev)} · objetivo ${fmtPx(v.target)} · stop ${fmtPx(v.stop)}`); }
        agent("EXE", why ? `${c.sym}: no compra (${why})` : `compra ${c.sym} en la cartera de prueba`);
      }
    }
  }
  step("EXE", dec === "entry" ? `ENTRADA · ${reason}` : dec === "block" ? "no opera: bloqueada por GUARD" : `salta · ${reason}`);
  c.trace = { t: hourEnd, sym: c.sym, dec, reason, steps: T, src: "modelo (Orb)" };
  S.decisions.unshift({ t: Date.now(), coin: c.id, sym: c.sym, kind: c.kind, dec, reason, p: v.p, ev: q.ev });
  if (S.decisions.length > 80) S.decisions.pop();
}

// Corrección del EV: lo que de verdad dieron las señales frente a lo que el modelo esperaba.
// Con 15+ operaciones de la cartera en vivo se usan esas; antes, lo medido en la prueba con historial. Solo resta.
function evBias() {
  const w = wallet.bias();
  if (w.n >= 15) return { ...w, src: "cartera en vivo" };
  if (S.backtest && Number.isFinite(S.backtest.bias)) return { bias: Math.min(0, S.backtest.bias), n: S.backtest.n, src: "prueba con historial" };
  return { bias: 0, n: w.n, src: null };
}

// ---------- resultado de cada caso: objetivo, stop o tiempo ----------
const byCoin = () => { const m = new Map(); for (const v of views.values()) { if (!m.has(v.coin)) m.set(v.coin, []); m.get(v.coin).push(v); } return m; };
function outcome(v, k) {
  if (k.t < v.t) return null;
  if (k.l <= v.stop) return [SL, v.stop / v.entry - 1]; // si en la misma vela tocó ambos, se asume el stop (prudente)
  if (k.h >= v.target) return [TP, v.target / v.entry - 1];
  if (k.t + M15 >= v.end) return [TM, k.c / v.entry - 1];
  return null;
}
function resolve(v, y, ret, quiet) {
  views.delete(v.id);
  const retR = ret / v.risk;
  model.learn(v.f, y, retR);
  calib.add(v.pRaw || v.p, y);
  appendLine("spot-labels.jsonl", { t: Date.now(), coin: v.coin, sym: v.sym, at: v.t, y, ret, retR, f: v.f, p: v.p });
  if (!quiet) agent("ORB", `aprende de ${v.sym}: ${["llegó al objetivo", "tocó el stop", `nada en ${cfg.spot.horizonH} h`][y]} (${pc(ret)})`);
}

market.on("candle", (c, k) => {
  for (const v of [...views.values()]) if (v.coin === c.id) { const o = outcome(v, k); if (o) resolve(v, o[0], o[1]); }
  const before = wallet.positions.get(c.id);
  wallet.onCandle(c, k, eur());
  if (before && !wallet.positions.has(c.id)) afterSell(c);
});
market.on("tick", (c, px) => {
  const before = wallet.positions.get(c.id);
  wallet.onTick(c, px, eur());
  if (before && !wallet.positions.has(c.id)) afterSell(c);
});
function afterSell(c) {
  const r = wallet.closed.at(-1);
  if (!r) return;
  agent("EXE", `vende ${c.sym}: ${r.why} · ${r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(2)} €`);
  log("EXE", `vende ${c.sym} · ${r.why} · ${pc(r.ret)}`);
  if (r.why === "stop" || r.explore) c.cooldown = Date.now() + 6 * H1;
}

// ---------- exploración: pequeñas compras de prueba en las mejores candidatas ----------
// Si ninguna moneda llega al EV mínimo, la cartera no compra nada y no hay forma de comprobar en vivo si el modelo acierta.
// Con poco dinero ficticio y un máximo de posiciones, compra la mejor candidata del momento (la de más ventaja por
// unidad de riesgo) aunque no sea una señal. Sus resultados corrigen el EV con datos reales. Nunca cuentan como señal.
function explore() {
  const ex = cfg.spot.explore;
  if (!ex || S.paused || model.labels < cfg.spot.minLabels || market.status.ws !== "conectado") return;
  if ([...wallet.positions.values()].filter((p) => p.explore).length >= ex) return;
  const fresh = Date.now() - 75 * 60000;
  const best = [...market.coins.values()]
    .filter((c) => c.last && c.view && c.last.t > fresh && !c.last.guard && Number.isFinite(c.last.evR) && !wallet.positions.has(c.id) && !(c.cooldown > Date.now())
      && Math.abs(c.px - c.view.entry) < 0.5 * c.view.atr) // el precio sigue cerca del calculado: stop y objetivo valen
    .sort((a, b) => b.last.evR - a.last.evR)[0];
  if (!best) return;
  const q = { evR: best.last.evR, evRaw: best.last.evRaw, ev: best.last.ev };
  const why = wallet.open(best, best.view, q, eur(), { eur: cfg.spot.exploreEur, explore: true });
  if (why) return;
  log("EXE", `exploración: compra ${best.sym} con ${cfg.spot.exploreEur} € (mejor candidata · EV ${pc(q.ev)})`);
  agent("EXE", `exploración: prueba ${best.sym} con ${cfg.spot.exploreEur} € ficticios`);
  S.decisions.unshift({ t: Date.now(), coin: best.id, sym: best.sym, kind: best.kind, dec: "explore", reason: `exploración con ${cfg.spot.exploreEur} €: la mejor candidata ahora, aunque no llega al EV mínimo`, p: best.last.p, ev: q.ev });
}
setInterval(explore, 5 * 60000);

// ---------- estrategia «Tendencia de mercado» (la que opera la cartera) ----------
// Una vez por hora, cuando ya han llegado las velas de Binance: mira si sube casi todo el mercado y, si es así,
// compra las monedas más fuertes de la semana que pasan los filtros, con stop móvil.
// Serie horaria de lo que mira el bot (para los minigráficos del Orb)
function pushObs(H, R, bt, lead) {
  const btc = market.coins.get("cex:BTCUSDT");
  const pt = { t: H, breadth: R?.breadth ?? null, week: R?.week ?? null, btc: btc?.px ?? null, btcVs: bt && btc?.px ? btc.px / bt.ema - 1 : null, lead, news: news.market().score, ups: market.perHour() };
  S.obs = (S.obs || []).filter((x) => x.t !== H); S.obs.push(pt);
  if (S.obs.length > 96) S.obs.splice(0, S.obs.length - 96);
}

function trendPass(H) {
  const list = [...market.coins.values()].filter((c) => c.kind === "cex" && c.last && c.last.t === H).map((c) => ({ id: c.id, c, s: c.last.s }));
  const R = regimeOf(list);
  if (!R) return;
  const cands = list.filter((x) => coinOk(x.s, R.pct.get(x.id) ?? 0) && !x.c.last.guard).sort((a, b) => b.s.r168 - a.s.r168);
  const btc = market.coins.get("cex:BTCUSDT"), bt = btcTrend(btc?.h1).get(H - H1) || null;
  // Freno de emergencia decidido de antemano: si la cartera cae un 25% desde su máximo, deja de comprar
  const peak = Math.max(wallet.startEur, ...wallet.curve.map((x) => x.v)), dd = 1 - wallet.equity(market.coins, eur()) / peak;
  const halt = dd > cfg.spot.maxDD;
  const on = R.on && !!bt?.up && !halt;
  S.regime = { t: H, n: R.n, breadth: R.breadth, week: R.week, btcUp: bt ? bt.up : null, btcEma: bt?.ema ?? null, dd, halt, on, cands: cands.map((x) => x.c.sym).slice(0, 12) };
  for (const x of list) x.c.trendOk = on && cands.includes(x);
  const pctTxt = `${Math.round(R.breadth * 100)}% de monedas sobre su media · ${Math.round(R.week * 100)}% suben en 7 días · BTC ${bt?.up ? "sobre" : "bajo"} su media de 30 días`;
  if (halt) { agent("GRD", `freno de emergencia: la cartera ha caído un ${Math.round(dd * 100)}% desde su máximo; no compra hasta que la reinicies`); return; }
  if (!on) { agent("QNT", `mercado sin fuerza (${pctTxt}): no compra`); return; }
  agent("QNT", `mercado fuerte (${pctTxt}) · ${cands.length} candidatas: ${cands.slice(0, 5).map((x) => x.c.sym).join(", ") || "ninguna"}`);
  if (!cfg.spot.trend || S.paused || Date.now() - H > 60 * 60000 || market.status.ws !== "conectado") return;
  for (const x of cands) {
    const c = x.c, s = x.s;
    if (wallet.positions.has(c.id) || c.cooldown > Date.now() || !(c.px > 0) || Math.abs(c.px - s.px) > 0.5 * s.atr) continue;
    const view = { entry: s.px, atr: s.atr, stop: s.px - TREND.stopAtr * s.atr, target: null, p: [NaN, NaN, NaN] };
    const why = wallet.open(c, view, { evRaw: NaN, ev: NaN }, eur(), { trail: TREND.trailAtr, strat: TREND.name });
    if (why) { if (/llena|saldo/.test(why)) break; continue; }
    S.signalsToday++;
    c.trace = { t: H, sym: c.sym, dec: "entry", src: TREND.name, reason: `${TREND.name}: compra`, steps: [
      { ag: "SCT", ms: 0, txt: `vela de 1 h cerrada · precio ${fmtPx(s.px)} · ${pc(s.r168)} en 7 días` },
      { ag: "QNT", ms: 0.1, txt: `mercado: ${Math.round(R.breadth * 100)}% sobre su media · ${Math.round(R.week * 100)}% suben en 7 días · BTC sobre su media de 30 días` },
      { ag: "QNT", ms: 0.2, txt: `${c.sym} está en el ${Math.round((1 - (R.pct.get(c.id) ?? 0)) * 100) || 1}% más fuerte de la semana y sobre su EMA 50` },
      { ag: "GRD", ms: 0.3, txt: "pasa los filtros" },
      { ag: "EXE", ms: 0.4, txt: `ENTRADA · ${cfg.paperTradeEur} € · stop ${fmtPx(view.stop)} que sube a ${TREND.trailAtr} ATR del máximo` },
    ] };
    log("EXE", `${TREND.name}: compra ${c.sym} (sube ${pc(s.r168)} en 7 días) · stop ${fmtPx(view.stop)} móvil`);
    agent("EXE", `compra ${c.sym} en la cartera de prueba (${TREND.name})`);
    S.decisions.unshift({ t: Date.now(), coin: c.id, sym: c.sym, kind: c.kind, dec: "entry", reason: `${TREND.name}: el mercado sube y ${c.sym} está entre las más fuertes de la semana (${pc(s.r168)})`, p: c.last.p, ev: c.last.ev });
  }
}
// ---------- cartera agresiva: rotación de momentum ----------
function aggroPass(H) {
  const btc = market.coins.get("cex:BTCUSDT"), bt = btcTrend(btc?.h1).get(H - H1);
  const list = [...market.coins.values()].filter((c) => c.kind === "cex" && c.last && c.last.t === H && c.last.s)
    .map((c) => ({ id: c.id, sym: c.sym, vol: c.vol24 || 0, dEma50: c.last.s.dEma50, r168: c.last.s.r168 }));
  if (list.length < 30 || !bt) return;
  const picks = aggroPick(list), on = bt.up;
  S.aggro = { t: H, on, picks: picks.map((x) => ({ sym: x.sym, r168: x.r168 })) };
  { const ls = [...market.coins.values()].filter((c) => c.kind === "cex" && c.last && c.last.t === H).map((c) => ({ id: c.id, s: c.last.s })); pushObs(H, regimeOf(ls), bt, picks.length ? picks.reduce((a, x) => a + x.r168, 0) / picks.length : null); }
  if (!cfg.spot.aggro || S.paused || Date.now() - H > 60 * 60000 || market.status.ws !== "conectado") return;
  const r = rot.rotate(H, market.coins, picks, on, eur());
  if (r.bought.length || r.sold.length) log("EXE", `Agresiva · tramo ${r.j + 1}: ${r.bought.length ? "compra " + r.bought.join(", ") : ""}${r.sold.length ? " vende " + r.sold.join(", ") : ""}`);
  agent("EXE", on ? `Agresiva: mantiene ${picks.slice(0, 4).map((x) => x.sym).join(", ")}… (las más fuertes de la semana)` : "Agresiva: BTC bajo su media de 30 días, pasa a liquidez poco a poco");
}

setInterval(() => {
  const H = Math.floor(Date.now() / H1) * H1;
  rot.fixFx(market.eurUsdt); // el cambio EUR/USDT real (no el provisional) fija el saldo inicial de la cartera agresiva
  // Espera a tener WebSocket: si no, la primera hora tras arrancar se daba por hecha sin poder operar
  if (S.trendDone !== H && Date.now() - H > 90000 && S.ready && market.status.ws === "conectado") { S.trendDone = H; trendPass(H); aggroPass(H); }
}, 20000);
market.on("hour", (c, end) => {
  if (c.h1) { const k = hourly(c.c15, end).at(-1); if (k && k.t + H1 === end && (!c.h1.length || k.t > c.h1.at(-1).t)) { c.h1.push(k); if (c.h1.length > 1200) c.h1.shift(); } }
  const live = Date.now() - end < 30 * 60000; // una hora que llega tarde (corte o suspensión) solo sirve para aprender
  decide(c, end, live);
});
market.on("status", () => agent("SCT", `Binance WebSocket ${market.status.ws}`));

// ---------- arranque en caliente: aprende del historial que ya existe ----------
// Recorre las horas pasadas de cada moneda en orden cronológico. En cada momento, el modelo solo ha aprendido de
// casos que ya se habían resuelto antes (sin mirar el futuro). Así empieza con miles de casos y una prueba honesta.
function warmStart() {
  const t0 = Date.now(), ev = [];
  const btc = market.coins.get("cex:BTCUSDT"), btcH = btc ? hourly(btc.c15, Date.now()) : [];
  // 1) Para cada hora pasada de cada moneda: sus señales (con velas hasta ese momento) y qué pasó después
  for (const c of market.coins.values()) {
    const hs = hourly(c.c15, Date.now());
    let k0 = 0;
    for (let i = 60; i < hs.length; i++) {
      const end = hs[i].t + H1;
      let bi = btcH.length; while (bi > 0 && btcH[bi - 1].t + H1 > end) bi--;
      const r = evaluate(c, end, { hours: hs.slice(0, i + 1), btcHours: btcH.slice(Math.max(0, bi - 30), bi), history: true, noModel: true });
      if (!r) continue;
      const { v } = r;
      while (k0 < c.c15.length && c.c15[k0].t < v.t) k0++;
      let res = null;
      for (let k = k0; k < c.c15.length; k++) { const o = outcome(v, c.c15[k]); if (o) { res = { y: o[0], ret: o[1], when: c.c15[k].t + M15 }; break; } }
      ev.push({ time: v.t, kind: 1, c, v, res }); // 1 = momento de decidir
      if (res) ev.push({ time: res.when, kind: 0, c, v, res }); // 0 = se conoce el resultado (va antes a igual hora)
    }
  }
  // 2) Se reproduce en orden: el modelo predice cada caso sabiendo solo los resultados anteriores a ese momento
  ev.sort((a, b) => a.time - b.time || a.kind - b.kind);
  const bt = { n: 0, sum: 0, wins: 0, gap: 0 };
  let learned = 0;
  for (const e of ev) {
    if (e.kind === 0) { model.learn(e.v.f, e.res.y, e.res.ret / e.v.risk); calib.add(e.v.pRaw, e.res.y); learned++; continue; }
    model.observe(e.v.f);
    e.v.pRaw = model.predict(e.v.f);
    e.v.p = calib.apply(e.v.pRaw);
    if (!e.res) { views.set(e.v.id, e.v); continue; } // aún sin resultado: se sigue en vivo
    // Prueba con historial: ¿qué habría pasado operando las señales que el modelo daba en ese momento?
    // Solo cuenta cuando la calibración ya está madura, como la que se usa en vivo (si no, la corrección sale exagerada)
    if (learned >= Math.max(cfg.spot.minLabels, MATURE)) {
      const q = quant(e.c, e.v, 0);
      if (q.ev >= cfg.spot.evMin) { const net = e.res.ret - q.costs; bt.n++; bt.sum += net; bt.gap += net - q.ev; if (net > 0) bt.wins++; }
    }
  }
  S.backtest = { n: bt.n, avg: bt.n ? bt.sum / bt.n : null, wins: bt.wins, bias: bt.n >= 15 ? bt.gap / bt.n : null, labels: learned, t: Date.now(), ver: VER };
  saveJSON("spot-backtest.json", S.backtest);
  saveJSON("spot-model.json", model);
  saveJSON("spot-calib.json", calib);
  log("ORB", `aprendizaje inicial: ${learned} casos del historial en ${((Date.now() - t0) / 1000).toFixed(0)} s · prueba: ${bt.n} señales, media ${bt.n ? pc(bt.sum / bt.n) : "—"}`);
}

market.on("ready", () => {
  if (fresh || !model.labels) { S.warm = "aprendiendo del historial…"; warmStart(); S.warm = null; }
  // Casos guardados de antes de reiniciar: se resuelven con las velas reales del historial
  const m = byCoin();
  for (const [coin, vs] of m) {
    const c = market.coins.get(coin);
    if (!c) { vs.forEach((v) => views.delete(v.id)); continue; }
    for (const v of vs) for (const k of c.c15) { const o = outcome(v, k); if (o) { resolve(v, o[0], o[1], true); break; } }
  }
  // Primera evaluación de cada moneda con la última hora cerrada (para el ranking; no opera con ella)
  for (const c of market.coins.values()) { const hs = hourly(c.c15, Date.now()); if (hs.length) decide(c, hs.at(-1).t + H1, false); }
  agent("SCT", `vigilando ${market.coins.size} monedas · WebSocket ${market.status.ws}`);
  const t0 = Date.now();
  S.trendBt = trendBacktest([...market.coins.values()].filter((c) => c.kind === "cex"));
  log("QNT", `${TREND.name}, prueba con ${S.trendBt.days.toFixed(0)} días: ${S.trendBt.n} operaciones, media ${S.trendBt.n ? pc(S.trendBt.avg, 2) : "—"} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  S.obs = marketSeries([...market.coins.values()].filter((c) => c.kind === "cex"), 72);
  S.aggroBt = aggroBacktest([...market.coins.values()].filter((c) => c.kind === "cex"));
  if (S.aggroBt) log("QNT", `${AGGRO.name}, prueba con ${S.aggroBt.days.toFixed(0)} días: ${pc(S.aggroBt.ret)} (BTC ${pc(S.aggroBt.btc)}), caída máxima ${(S.aggroBt.maxDD * 100).toFixed(0)}%`);
  S.ready = true;
});

// ---------- tareas periódicas ----------
async function newsLoop() { agent("NWS", "leyendo Cointelegraph, CoinDesk, Decrypt y The Block"); try { await news.refresh(); const m = news.market(); agent("NWS", `${news.items.size} noticias en 48 h · ánimo ${m.score > 0 ? "+" : ""}${m.score}`); } catch {} setTimeout(newsLoop, 10 * 60000); }
async function securityLoop() {
  for (;;) {
    const c = [...market.coins.values()].find((x) => x.kind === "alpha" && x.contract && !(S.sec.get(x.id)?.t > Date.now() - 6 * H1));
    if (c) {
      agent("GRD", `revisando el contrato de ${c.sym} (GoPlus)`);
      try { const r = await checkSecurity({ net: "bsc", token: c.contract, created: c.listed }); if (r) S.sec.set(c.id, r); } catch (e) { S.sec.set(c.id, { ok: true, reasons: [], warns: ["no se pudo revisar: " + e.message], t: Date.now() }); }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}
setInterval(() => { saveJSON("spot-model.json", model); saveJSON("spot-calib.json", calib); saveJSON("spot-views.json", [...views.values()]); }, 5 * 60000);
setInterval(() => { wallet.sample(market.coins, eur()); rot.sample(market.coins, eur()); }, 60000);
for (const sg of ["SIGINT", "SIGTERM"]) process.on(sg, () => { console.log("\nGuardando…"); saveJSON("spot-model.json", model); saveJSON("spot-calib.json", calib); saveJSON("spot-views.json", [...views.values()]); wallet.save(); rot.save(); process.exit(0); });

// ---------- panel ----------
function state() {
  const sc = model.score(), coins = market.coins;
  const list = [...coins.values()].map((c) => ({
    id: c.id, kind: c.kind, sym: c.sym, name: c.name, url: c.url, px: c.px, ch24: c.ch24, vol24: c.vol24, liq: c.liq, holders: c.holders, mine: market.isMine(c),
    p: c.last?.p || null, ev: c.last?.ev ?? null, guard: c.last?.guard || null, ta: c.last?.ta || null, at: c.last?.t || null, open: wallet.positions.has(c.id), trendOk: !!c.trendOk, r7: c.last?.s?.r168 ?? null,
    sec: c.kind === "alpha" ? (S.sec.get(c.id) ? { ok: S.sec.get(c.id).ok, why: S.sec.get(c.id).reasons[0] || S.sec.get(c.id).warns[0] || null } : null) : "binance",
  })).sort((a, b) => b.open - a.open || b.trendOk - a.trendOk || (b.r7 ?? -9) - (a.r7 ?? -9)); // primero lo que la estrategia compraría
  return {
    bot: "spot", paused: S.paused, warm: S.warm,
    market: { ...market.status, perHour: market.perHour(), coins: coins.size, cex: list.filter((c) => c.kind === "cex").length, alpha: list.filter((c) => c.kind === "alpha").length, eurUsdt: market.eurUsdt, newsMood: news.market() },
    model: { labels: model.labels, counts: model.counts, ...sc, calib: calib.table(), tpR: model.tpRet, slR: model.slRet, tmR: model.timeRet, pending: views.size },
    backtest: S.backtest, evBias: evBias(), regime: S.regime || null, trendBt: S.trendBt || null,
    obs: S.obs || [],
    agentM: agentMetrics(),
    aggro: { on: !!cfg.spot.aggro, name: AGGRO.name, top: AGGRO.top, every: AGGRO.every, design: AGGRO.design, bt: S.aggroBt || null, now: S.aggro || null, wallet: rot.state(market.coins, eur()) },
    trend: { on: !!cfg.spot.trend, name: TREND.name, breadth: TREND.breadth, week: TREND.week, maxDD: cfg.spot.maxDD, design: TREND.design,
      live: (() => { const r = wallet.closed.filter((x) => x.strat === TREND.name); return { n: r.length, wins: r.filter((x) => x.pnl > 0).length, avg: r.length ? r.reduce((a, b) => a + b.ret, 0) / r.length : null }; })() }, wallet: wallet.state(coins, eur()), agents: S.agents, decisions: S.decisions.slice(0, 40), log: S.log.slice(0, 30),
    list, news: news.latest(15),
    cfg: { explore: cfg.spot.explore, exploreEur: cfg.spot.exploreEur, horizonH: cfg.spot.horizonH, stopAtr: cfg.spot.stopAtr, targetAtr: cfg.spot.targetAtr, beAtr: cfg.spot.beAtr, evMin: cfg.spot.evMin, minLabels: cfg.spot.minLabels },
  };
}
function agentMetrics() {
  const d = S.decisions, rw = rot.state(market.coins, eur());
  return {
    SCT: market.perHour(), CHT: [...market.coins.values()].filter((c) => c.last && Date.now() - c.last.t < 2 * H1).length, NWS: news.items.size, ORB: model.labels,
    GRD: d.length ? d.filter((x) => x.dec === "block").length / d.length : 0, QNT: S.regime?.on ? S.regime.cands.length : 0, EXE: wallet.positions.size + rw.hold.length,
  };
}

function detail(id) {
  const c = market.coins.get(id);
  if (!c) return null;
  const n = newsFor(c);
  let explain = null;
  if (c.view?.f) {
    const e = model.explain(c.view.f), s = c.last?.s || {};
    explain = { prior: e.prior, pRaw: c.view.pRaw, p: c.view.p,
      sig: SPOT_SIGNALS.map((g, i) => ({ k: g.k, name: g.name, ag: g.ag, v: s[g.k] ?? null, d: e.steps[i] })) };
  }
  const last = model.hist.slice(-60), meas = [0, 0, 0]; for (const x of last) meas[x.y]++;
  return { id, sym: c.sym, name: c.name, kind: c.kind, url: c.url, px: c.px, liq: c.liq, holders: c.holders, last: c.last || null, trace: c.trace || null, explain,
    measured: { n: last.length, counts: meas, all: model.counts }, candles: hourly(c.c15).slice(-120),
    news: n.items, newsScore: n.score, sec: S.sec.get(id) || null, pos: wallet.positions.get(id) || null };
}

const page = (f) => fs.readFileSync(path.join(ROOT, "public", f));
const body = (req) => new Promise((ok) => { let b = ""; req.on("data", (x) => { if (b.length < 2000) b += x; }); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); });
const json = (res, code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(page("spot.html")); }
  if (req.method === "GET" && u.pathname === "/api/state") return json(res, 200, state());
  if (req.method === "GET" && u.pathname === "/api/coin") return json(res, 200, detail(u.searchParams.get("id")));
  // Las acciones exigen una cabecera propia: una web ajena no puede enviarla a tu localhost
  if (req.method === "POST" && req.headers["x-orbital"] === "1") {
    try {
      if (u.pathname === "/api/watch") return json(res, 200, { ok: true, sym: await market.addWatch((await body(req)).q) });
      if (u.pathname === "/api/unwatch") { market.removeWatch((await body(req)).id); return json(res, 200, { ok: true }); }
      if (u.pathname === "/api/pause" || u.pathname === "/api/resume") { S.paused = u.pathname === "/api/pause"; saveJSON("spot-state.json", { paused: S.paused }); log("GRD", S.paused ? "señales en pausa" : "señales reanudadas"); return json(res, 200, { ok: true }); }
      if (u.pathname === "/api/aggro-reset") { rot.reset(eur()); log("EXE", `cartera agresiva reiniciada con ${cfg.spot.aggroStartEur} €`); return json(res, 200, { ok: true }); }
      if (u.pathname === "/api/wallet-reset") { wallet.reset(); log("EXE", `cartera de prueba reiniciada con ${cfg.paperStartEur} €`); return json(res, 200, { ok: true }); }
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  }
  res.writeHead(404); res.end();
}).listen(cfg.port, "127.0.0.1", () => {
  console.log(`\n  Orbital · radar de Binance + Binance Wallet · solo papel`);
  console.log(`  Panel: http://localhost:${cfg.port}\n`);
});

log("SCT", "cargando monedas e historial de Binance…");
market.start().catch((e) => log("SCT", "error al arrancar: " + e.message));
newsLoop();
securityLoop();
