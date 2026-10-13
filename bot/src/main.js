import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { cfg, ROOT, DATA } from "./config.js";
import { now, loadJSON, saveJSON, appendLine, readLines } from "./store.js";
import { Feed, DexPoller } from "./feed.js";
import { Tracker } from "./tracker.js";
import { Model, OUT, TP, SL, TM } from "./model.js";
import { SIGNALS, featureVector, Judge, Creators, guard, quant, buyOnCurve } from "./agents.js";
import * as live from "./trade.js";
import { Radar } from "./radar/radar.js";
import { Exit, STRATS } from "./exits.js";
import { PaperWallet } from "./wallet.js";

// ---------- estado ----------
// Sin clave de PumpPortal → modo gratuito con DexScreener. Cada modo mide las señales distinto, así que guarda su propio modelo.
const SOURCE = cfg.apiKey ? "pumpportal" : "dexscreener";
const MODEL_FILE = SOURCE === "pumpportal" ? "model.json" : "model-dex.json";
const savedModel = loadJSON(MODEL_FILE, null);
let model = Model.from(savedModel, SIGNALS.length);
let repairNote = null;
const upgraded = savedModel && savedModel.nf && savedModel.nf !== SIGNALS.length;
if (model.corrupted() || upgraded) {
  // Un dato inválido dañó el modelo en una versión anterior: se reentrena desde las etiquetas guardadas.
  // Los valores que se guardaron como null se recuperan como 0, igual que hace ahora featureVector con los datos nuevos
  // Si la versión nueva tiene más señales, las etiquetas antiguas se completan con 0 en las señales que no existían
  const rows = readLines("labels.jsonl").filter((r) => (r.src || "pumpportal") === SOURCE && Array.isArray(r.f) && r.f.length <= SIGNALS.length && [0, 1, 2].includes(r.y))
    .map((r) => ({ ...r, f: Array.from({ length: SIGNALS.length }, (_, i) => (Number.isFinite(r.f[i]) ? r.f[i] : 0)) }));
  model = new Model(SIGNALS.length);
  for (const r of rows) model.observe(r.f);
  for (const r of rows) model.learn(r.f, r.y, r.ret);
  // Las operaciones en papel de ese periodo se abrieron con predicciones inválidas: se apartan para no falsear los resultados
  const pf = path.join(DATA, "paper.jsonl");
  if (!upgraded && fs.existsSync(pf)) fs.renameSync(pf, path.join(DATA, `paper-invalido-${Date.now()}.jsonl`));
  saveJSON(MODEL_FILE, model);
  repairNote = upgraded
    ? `modelo actualizado a ${SIGNALS.length} señales: reentrenado con ${rows.length} etiquetas guardadas`
    : `modelo reparado: reentrenado con ${rows.length} etiquetas válidas; operaciones en papel anteriores apartadas`;
  console.log("  " + repairNote);
}
const wallet = new PaperWallet();
const judge = new Judge();
const creators = new Creators();
const feed = new Feed(cfg.apiKey);
let tracker;
const dex = SOURCE === "dexscreener" ? new DexPoller(() => tracker.mints()) : null;
tracker = new Tracker(feed, judge, creators, dex);

const S = {
  started: now(),
  halted: loadJSON("state.json", {}).halted || null,
  decisions: [], log: [],
  counts: { blocked: 0, skipped: 0, signals: 0, liveEntries: 0 },
  paper: readLines("paper.jsonl"),
  liveClosed: readLines("live.jsonl"),
  positions: new Map(),   // posiciones reales abiertas
  paperOpen: new Map(),   // señales en papel esperando resultado
  wallet: { address: null, balance: null },
  gate: { ok: false, reasons: [] },
};

function log(tag, msg) {
  const line = { t: now(), tag, msg };
  S.log.unshift(line); if (S.log.length > 60) S.log.pop();
  console.log(new Date(line.t).toLocaleTimeString(), `[${tag}]`, msg);
}
function decide(t, dec, reason, p, ev) {
  S.decisions.unshift({ t: now(), mint: t.mint, sym: t.sym, dec, reason, p, ev, sig: t.sig, explain: model.explain(featureVector(t.sig)) });
  if (S.decisions.length > 60) S.decisions.pop();
}
const today = () => new Date().toISOString().slice(0, 10);
const liveToday = () => S.liveClosed.filter((c) => c.day === today()).reduce((s, c) => s + (c.pnl || 0), 0);
// Resultados en papel por estrategia de salida (los registros antiguos no tienen "strat": eran salidas fijas)
const stratOf = (c) => c.strat || "fixed";
function paperStats(k) {
  const g = S.paper.filter((c) => stratOf(c) === k), n = g.length, net = g.reduce((s, c) => s + c.ret, 0);
  return { n, net, avg: n ? net / n : null, wins: g.filter((c) => c.ret > 0).length };
}
// Estrategia que se usaría con dinero real: la forzada en .env o, en "auto", la de mejor media con suficientes operaciones
function chosenStrat() {
  if (cfg.exitStrategy !== "auto") return cfg.exitStrategy;
  const ok = Object.keys(STRATS).map((k) => [k, paperStats(k)]).filter(([, st]) => st.n >= cfg.minPaperTradesLive);
  if (!ok.length) return "ladder";
  return ok.sort((a, b) => b[1].avg - a[1].avg)[0][0];
}
const paperNet = () => paperStats(chosenStrat()).net;
function setHalted(reason) { S.halted = reason; saveJSON("state.json", { halted: reason }); log("GRD", reason ? "DETENIDO · " + reason : "reanudado"); }

// ---------- compuerta para dinero real ----------
function computeGate() {
  const r = [], sc = model.score();
  if (cfg.mode !== "live") r.push("MODE=paper en .env (cámbialo a live cuando todo lo demás esté en verde)");
  if (model.labels < cfg.minLabelsLive) r.push(`etiquetas ${model.labels} / ${cfg.minLabelsLive}`);
  if (sc.gain == null || sc.gain < cfg.minGainLive) r.push(`mejora de información ${sc.gain == null ? "—" : (sc.gain * 100).toFixed(1) + "%"} (mínimo ${(cfg.minGainLive * 100).toFixed(0)}%)`);
  const cs = chosenStrat(), st = paperStats(cs);
  if (st.n < cfg.minPaperTradesLive) r.push(`operaciones en papel con salida "${STRATS[cs].name}" ${st.n} / ${cfg.minPaperTradesLive}`);
  else if (st.net <= 0) r.push(`resultado en papel negativo con salida "${STRATS[cs].name}" (${(st.avg * 100).toFixed(1)}% por operación)`);
  if (!cfg.privateKey) r.push("falta PRIVATE_KEY (npm run wallet)");
  if (!cfg.rpcUrl) r.push("falta RPC_URL");
  if (S.wallet.balance != null && S.wallet.balance < cfg.maxSolPerTrade + cfg.reserveSol) r.push(`saldo ${S.wallet.balance.toFixed(3)} SOL insuficiente`);
  if (S.halted) r.push("bot detenido: " + S.halted);
  S.gate = { ok: r.length === 0, reasons: r };
}
const isLive = () => S.gate.ok;

// ---------- agentes en directo: qué está haciendo cada uno ahora ----------
S.agents = Object.fromEntries(["SCT", "MAP", "JDG", "ORB", "QNT", "GRD", "EXE"].map((k) => [k, { txt: "esperando…", t: 0, n: 0 }]));
function agent(k, txt) { const a = S.agents[k]; a.txt = txt; a.t = now(); a.n++; }
const pctS = (x) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(1) + "%";
feed.on("create", (d) => agent("SCT", `nuevo lanzamiento ${String(d.symbol || "?").slice(0, 16)} · ${tracker.launchRate().toFixed(1)} por minuto`));
if (dex) dex.on("pair", () => { S.agents.SCT.n++; });

// ---------- narrativa: palabras de moda (noticias, tendencias y tokens que acaban de pegar fuerte) ----------
const STOPW = new Set("the and for with from that this will have after over into about more than what when your their they been were coin token crypto price market says said new news inu sol pump fun meme".split(" "));
const wordsOf = (t) => `${t.name || ""} ${t.sym || ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPW.has(w));
const recentWinners = [];
const hot = { words: new Set(), t: 0 };
function refreshHot() {
  const w = new Set();
  const cut = now() - 6 * 3600e3;
  while (recentWinners.length && recentWinners[0].t < cut) recentWinners.shift();
  for (const r of recentWinners) r.words.forEach((x) => w.add(x));
  if (radar) {
    for (const n of radar.news.latest(200)) if (Date.now() - n.t < 24 * 3600e3) n.title.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 4 && !STOPW.has(x)).forEach((x) => w.add(x));
    radar.trending.forEach((x) => w.add(String(x).toLowerCase()));
  }
  hot.words = w; hot.t = now();
}
function narrativeScore(t) {
  if (now() - hot.t > 5 * 60e3) refreshHot();
  return new Set(wordsOf(t).filter((x) => hot.words.has(x))).size;
}

// ---------- mercado: tendencia de SOL en la última hora (Binance) ----------
const market = { solTrend: 0 };
async function refreshMarket() {
  try {
    const k = await (await fetch("https://data-api.binance.vision/api/v3/klines?symbol=SOLUSDT&interval=5m&limit=13")).json();
    const a = +k[0][1], b = +k.at(-1)[4];
    if (a > 0 && b > 0) market.solTrend = b / a - 1;
  } catch {}
}
refreshMarket();
setInterval(refreshMarket, 5 * 60e3);

// ---------- decisión (GUARD → QUANT → EXECUTOR) ----------
// Cada "vista" es un token evaluado en un momento concreto (90 s, 3, 5 o 10 min desde su lanzamiento)
tracker.on("observe", (t) => {
  const tok = t.t;
  // Señales de contexto: narrativa de moda y ambiente del mercado
  t.sig.narrative = narrativeScore(tok);
  const hr = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  Object.assign(t.sig, { launchRate: tracker.launchRate(), solTrend: market.solTrend, hourSin: Math.sin((hr / 24) * 2 * Math.PI), hourCos: Math.cos((hr / 24) * 2 * Math.PI) });
  const f = featureVector(t.sig);
  model.observe(f);
  const p = model.predict(f);
  t.p = p;
  const when = t.idx === 0 ? `a los ${Math.round(t.sig.ageMin * 60)} s` : `a los ${Math.round(t.sig.ageMin)} min`;
  agent("SCT", `toma la foto de ${t.sym} ${when} · ${t.sig.buyersPerMin.toFixed(1)} compras/min · precio ${pctS(Math.exp(t.sig.velocity) - 1)}`);
  agent("MAP", `${t.sym}: creador ${(t.sig.devShare * 100).toFixed(1)}% · ${t.sig.creatorPrior} lanzamientos previos · ${t.sig.socials} redes${t.sig.socialReuse ? " (copiadas)" : ""}${t.sig.narrative ? " · encaja con temas de moda" : ""}`);
  agent("JDG", `${t.sym}: ${t.sig.followed} wallets seguidas entre sus compradores · ${judge.count()} wallets seguidas en total`);
  agent("ORB", `${t.sym}: P(+60%) ${p[0].toFixed(2)} · P(−30%) ${p[1].toFixed(2)} · P(nada) ${p[2].toFixed(2)}`);
  const block = guard(t.sig);
  if (block) { t.blocked = true; S.counts.blocked++; agent("GRD", `bloquea ${t.sym}: ${block}`); decide(t, "block", block, p, null); return; }
  agent("GRD", `${t.sym} pasa los filtros de riesgo`);
  const q = quant(p, t.sig, model.timeRet, isLive());
  t.q = q;
  agent("QNT", `${t.sym}: bruto ${pctS(q.gross)} − costes ${(q.costs * 100).toFixed(1)}% = EV ${pctS(q.ev)} ${q.ev >= cfg.evMin ? "→ SEÑAL" : `→ salta (mínimo +${(cfg.evMin * 100).toFixed(0)}%)`}`);
  if (!(q.ev >= cfg.evMin)) { /* también descarta un EV inválido (NaN) */ S.counts.skipped++; decide(t, "skip", `EV ${(q.ev * 100).toFixed(1)}% tras costes · bajo +${(cfg.evMin * 100).toFixed(0)}%`, p, q.ev); return; }
  S.counts.signals++;
  // Toda señal se registra en papel (sin límite de posiciones) para medir si el sistema tiene ventaja
  // Las dos estrategias de salida se simulan sobre la MISMA entrada, para compararlas en igualdad de condiciones
  tracker.hold(t);
  if (!S.paperOpen.has(t.mint)) S.paperOpen.set(t.mint, { t: now(), sym: t.sym, tObs: t.tObs, size: q.size, tokens: buyOnCurve(t.sig.vSol, t.sig.vTok, q.size, cfg.pumpFee).tokens, impact: q.impact, ev: q.ev,
    exits: Object.fromEntries(Object.keys(STRATS).map((k) => [k, new Exit(k, t.pxEntry)])) });
  const wwhy = wallet.tryOpen({ mint: t.mint, sym: t.sym, p, px: t.pxEntry, vSol: t.sig.vSol, vTok: t.sig.vTok }, chosenStrat(), q);
  agent("EXE", wwhy ? `${t.sym}: no compra en la cartera de prueba (${wwhy})` : `compra ${t.sym} en la cartera de prueba`);
  if (wwhy && !wwhy.startsWith("cartera llena")) log("EXE", `cartera de prueba no compra ${t.sym}: ${wwhy}`);
  if (!isLive()) { decide(t, "entry", `señal · EV ${(q.ev * 100).toFixed(1)}% · en papel`, p, q.ev); log("QNT", `señal en papel ${t.sym} · EV ${q.ev >= 0 ? "+" : ""}${(q.ev * 100).toFixed(1)}%`); return; }
  if (S.positions.has(t.mint)) return;
  if (S.positions.size >= cfg.maxOpen) { decide(t, "skip", `libro lleno · ${cfg.maxOpen}/${cfg.maxOpen}`, p, q.ev); return; }
  openLive(t, q);
  decide(t, "entry", `ENTRADA REAL · ${q.size} SOL · EV ${(q.ev * 100).toFixed(1)}%`, p, q.ev);
});

async function openLive(t, q) {
  tracker.hold(t);
  const strat = chosenStrat();
  const pos = { mint: t.mint, sym: t.sym, size: q.size, t: now(), status: "abriendo", ev: q.ev, p: t.p, strat, sells: [], queue: Promise.resolve() };
  S.positions.set(t.mint, pos);
  S.counts.liveEntries++;
  try {
    const r = await live.buy(t.mint, q.size);
    pos.buySig = r.sig; pos.buyDelta = r.delta; pos.status = "abierta";
    pos.exit = new Exit(strat, t.t.px); // la referencia es el precio cuando se confirmó la compra
    log("EXE", `compra real ${t.sym} · ${q.size} SOL · salida "${STRATS[strat].name}" · ${r.sig.slice(0, 10)}…`);
    if (pos.closeWhenOpen) closeLive(pos, pos.closeWhenOpen);
  } catch (e) {
    S.positions.delete(t.mint);
    log("EXE", `compra fallida ${t.sym}: ${e.message}`);
  }
}

// Ventas reales en cola: una detrás de otra, cada una como % del saldo que queda
function liveSell(pos, frac, why) {
  pos.queue = pos.queue.then(async () => {
    if (pos.status === "cerrada") return;
    const last = frac >= 0.999;
    for (let i = 0; i < 3; i++) {
      try {
        const r = last ? await live.sellAll(pos.mint) : await live.sellPct(pos.mint, frac * 100);
        pos.sells.push({ why, sig: r.sig, delta: r.delta ?? 0 });
        log("EXE", `venta real ${pos.sym} · ${last ? "todo" : Math.round(frac * 100) + "% de lo que queda"} · ${why}`);
        if (last) finishLive(pos);
        return;
      } catch (e) {
        log("EXE", `venta fallida ${pos.sym} (intento ${i + 1}): ${e.message}`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    log("EXE", `NO se pudo vender ${pos.sym}. Usa "Detener y vender todo" o revisa la wallet.`);
  });
  return pos.queue;
}

function finishLive(pos) {
  pos.status = "cerrada";
  const pnl = (pos.buyDelta ?? -pos.size) + pos.sells.reduce((s, x) => s + x.delta, 0);
  const rec = { day: today(), t: now(), mint: pos.mint, sym: pos.sym, size: pos.size, pnl, ret: pnl / pos.size, strat: pos.strat,
    out: pos.sells.map((x) => x.why).join(" · "), buy: pos.buySig, sell: pos.sells.at(-1)?.sig };
  S.liveClosed.push(rec); appendLine("live.jsonl", rec);
  S.positions.delete(pos.mint);
  log("EXE", `posición real cerrada ${pos.sym} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL`);
  if (liveToday() <= -cfg.dailyLossLimit) setHalted(`pérdida diaria de ${liveToday().toFixed(3)} SOL alcanzó el límite`);
}

function closeLive(pos, why) {
  if (pos.status === "abriendo") { pos.closeWhenOpen = why; return; }
  if (pos.status !== "abierta" || !pos.exit) return;
  for (const a of pos.exit.close(pos.exit.peak > 0 ? pos.exit.entry : 0, why)) liveSell(pos, a.frac, a.why);
}

// ---------- cada precio nuevo mueve las salidas (papel y real) ----------
function onPrice(t, forceWhy) {
  wallet.onPrice(t, forceWhy);
  const po = S.paperOpen.get(t.mint);
  if (po) {
    for (const [k, ex] of Object.entries(po.exits)) {
      if (ex.done) continue;
      forceWhy ? ex.close(t.px, forceWhy) : ex.update(t.px);
      if (ex.done) {
        const ret = ex.paperReturn(po.tokens, po.size, po.impact);
        const rec = { t: now(), mint: t.mint, sym: t.sym, size: po.size, ret, strat: k, out: ex.summary(), min: (now() - po.tObs) / 60000 };
        S.paper.push(rec); appendLine("paper.jsonl", rec);
        log("EXE", `papel ${STRATS[k].name.toLowerCase()} ${t.sym} · ${(ret * 100).toFixed(1)}% · ${rec.out}`);
      }
    }
    if (Object.values(po.exits).every((e) => e.done)) S.paperOpen.delete(t.mint);
  }
  const pos = S.positions.get(t.mint);
  if (pos && pos.status === "abierta" && pos.exit) {
    const acts = forceWhy ? pos.exit.close(t.px, forceWhy) : pos.exit.update(t.px);
    for (const a of acts) liveSell(pos, a.frac, a.why);
  } else if (pos && pos.status === "abriendo" && forceWhy) pos.closeWhenOpen = forceWhy;
}
tracker.on("price", (t) => onPrice(t));
tracker.on("expire", (t) => onPrice(t, `${cfg.horizonMin} min`));
tracker.on("graduated", (t) => onPrice(t, "graduó")); // sin datos de PumpSwap en este modo: se sale al graduarse

// ---------- etiqueta medida → aprendizaje ----------
tracker.on("label", (t) => {
  if (!t.blocked && t.sig) {
    const f = featureVector(t.sig);
    model.learn(f, t.label, t.ret);
    appendLine("labels.jsonl", { src: SOURCE, t: t.tEnd, mint: t.mint, sym: t.sym, cp: t.idx, y: t.label, ret: t.ret, f, p: t.p });
    agent("ORB", `aprende de ${t.sym}: ${["llegó a +60%", "cayó a −30%", "no tocó nada en 60 min"][t.label]} (foto ${t.idx + 1})`);
    if (t.label === TP) recentWinners.push({ t: now(), words: wordsOf(t.t) });
  }
});

feed.on("notice", (m) => log("SCT", "PumpPortal: " + m));
feed.on("status", () => log("SCT", feed.connected ? "conectado a PumpPortal" : "desconectado · reintentando"));

// ---------- guardado periódico ----------
function saveAll() { saveJSON(MODEL_FILE, model); judge.save(); creators.save(); }
setInterval(() => saveJSON(MODEL_FILE, model), 60000);
setInterval(() => { judge.save(); creators.save(); }, 300000);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { console.log("\nGuardando…"); saveAll(); process.exit(0); });

async function refreshWallet() {
  try { S.wallet.address = await live.publicAddress(); S.wallet.balance = await live.balance(); } catch (e) { S.wallet.error = e.message; }
  computeGate();
}
setInterval(refreshWallet, 30000);

// Precio SOL/EUR para la cartera de prueba (Binance, cada 5 min)
async function refreshSolEur() {
  try {
    const r = await fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=SOLEUR");
    const p = +(await r.json()).price;
    if (p > 0) wallet.solEur = p;
  } catch {}
}
refreshSolEur();
setInterval(refreshSolEur, 5 * 60e3);
setInterval(() => { wallet.sample(); wallet.save(); }, 60e3);
setInterval(computeGate, 5000);

// ---------- panel web local ----------
function state() {
  const sc = model.score();
  const measuring = tracker.measuring().slice(0, 800).map((t) => ({ m: t.mint, s: t.sym, p: t.p || [1 / 3, 1 / 3, 1 / 3], a: (now() - t.tObs) / (cfg.horizonMin * 60000), b: !!t.blocked, r: t.px / t.pxEntry - 1 }));
  const nowT = now();
  return {
    mode: cfg.mode, live: isLive(), gate: S.gate, halted: S.halted,
    feed: { source: SOURCE, connected: feed.connected, msgs: feed.msgs, perHour: feed.perHour(), notice: feed.notice, hasKey: !!cfg.apiKey, dexCalls: dex ? dex.calls : 0, dexErrors: dex ? dex.errors : 0 },
    counts: { seen: tracker.seen, tracked: tracker.tokens.size, measuring: measuring.length, ...S.counts, labels: model.labels, followed: judge.count() },
    model: { labels: model.labels, counts: model.counts, ...sc, timeRet: model.timeRet, recent: model.hist.slice(-60).map((h) => h.y) },
    signals: SIGNALS, measuring,
    paperWallet: wallet.state(),
    agents: S.agents, market: { solTrend: market.solTrend, launchRate: tracker.launchRate(), hot: [...hot.words].slice(0, 30) },
    // Primero los que ya tienen precio y están más cerca de decidir
    observing: [...tracker.tokens.values()].filter((t) => t.phase === "observe").sort((a, b) => (dex ? (b.dexSeen ? 1 : 0) - (a.dexSeen ? 1 : 0) : 0) || a.t0 - b.t0).slice(0, 8)
      .map((t) => ({ m: t.mint, s: t.sym, age: (now() - t.t0) / 1000, chg: t.px / t.px0 - 1, buys: dex ? t.dexBuys || 0 : t.buyers.size, seen: dex ? !!t.dexSeen : true })),
    activity: { observing: [...tracker.tokens.values()].filter((t) => t.phase === "observe").length, following: [...tracker.tokens.values()].filter((t) => t.keepUntil > nowT).length, radar: radar ? radar.now : null }, decisions: S.decisions.slice(0, 30), log: S.log.slice(0, 20),
    positions: [...S.positions.values()].map(({ closeWhenOpen, ...p }) => p),
    paper: {
      chosen: chosenStrat(), mode: cfg.exitStrategy, open: S.paperOpen.size, recent: S.paper.slice(-300),
      by: Object.fromEntries(Object.entries(STRATS).map(([k, v]) => [k, { name: v.name, desc: v.desc(), ...paperStats(k) }])),
    },
    liveClosed: S.liveClosed.slice(-200), liveToday: liveToday(),
    wallet: S.wallet,
    cfg: { tp: cfg.tp, sl: cfg.sl, horizonMin: cfg.horizonMin, obsSeconds: tracker.obsSeconds, evMin: cfg.evMin, maxSolPerTrade: cfg.maxSolPerTrade, maxOpen: cfg.maxOpen, dailyLossLimit: cfg.dailyLossLimit, minLabelsLive: cfg.minLabelsLive, minPaperTradesLive: cfg.minPaperTradesLive },
  };
}

const html = (f = "index.html") => fs.readFileSync(path.join(ROOT, "public", f));
const radar = process.env.RADAR === "off" ? null : new Radar();
const readBody = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => { if (b.length < 2000) b += c; }); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); });
http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html()); }
  if (req.method === "GET" && req.url === "/radar") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html("radar.html")); }
  if (req.method === "GET" && req.url.startsWith("/api/radar")) {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(radar ? radar.state(id) : { off: true }));
  }
  if (req.method === "POST" && req.headers["x-orbital"] === "1" && radar && (req.url === "/api/watch" || req.url === "/api/unwatch")) {
    const body = await readBody(req);
    try {
      const out = req.url === "/api/watch" ? { ok: true, sym: await radar.addWatch(body.q) } : (radar.removeWatch(body.id), { ok: true });
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: e.message })); }
  }
  if (req.method === "GET" && req.url === "/api/state") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(state())); }
  // Las acciones exigen una cabecera propia: una web ajena no puede enviarla a tu localhost.
  if (req.method === "POST" && req.headers["x-orbital"] === "1") {
    if (req.url === "/api/halt") { setHalted("detenido desde el panel"); computeGate(); }
    else if (req.url === "/api/halt-sell") { setHalted("detenido y vendiendo todo desde el panel"); computeGate(); for (const p of S.positions.values()) closeLive(p, "manual"); }
    else if (req.url === "/api/resume") { setHalted(null); computeGate(); }
    else if (req.url === "/api/wallet-reset") { wallet.reset(); log("EXE", `cartera de prueba reiniciada con ${cfg.paperStartEur} €`); }
    else { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}');
  }
  res.writeHead(404); res.end();
}).listen(cfg.port, "127.0.0.1", () => {
  console.log(`\n  Orbital bot · modo ${cfg.mode.toUpperCase()}`);
  console.log(`  Panel: http://localhost:${cfg.port}`);
  console.log(`  Radar: http://localhost:${cfg.port}/radar\n`);
  console.log(SOURCE === "dexscreener" ? "  Datos: lanzamientos de PumpPortal + precios de DexScreener (modo gratuito)\n" : "  Datos: PumpPortal completo (compras y ventas en tiempo real)\n");
});

if (cfg.mode === "live") live.initLive().then((a) => log("EXE", `wallet del bot ${a}`)).catch((e) => log("EXE", "modo real no disponible: " + e.message));
refreshWallet();
if (repairNote) log("ORB", repairNote);
feed.start();
if (dex) dex.start();
if (radar) radar.start();
