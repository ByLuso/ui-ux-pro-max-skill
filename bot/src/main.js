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

// ---------- estado ----------
// Sin clave de PumpPortal → modo gratuito con DexScreener. Cada modo mide las señales distinto, así que guarda su propio modelo.
const SOURCE = cfg.apiKey ? "pumpportal" : "dexscreener";
const MODEL_FILE = SOURCE === "pumpportal" ? "model.json" : "model-dex.json";
let model = Model.from(loadJSON(MODEL_FILE, null), SIGNALS.length);
let repairNote = null;
if (model.corrupted()) {
  // Un dato inválido dañó el modelo en una versión anterior: se reentrena desde las etiquetas guardadas.
  // Los valores que se guardaron como null se recuperan como 0, igual que hace ahora featureVector con los datos nuevos
  const rows = readLines("labels.jsonl").filter((r) => (r.src || "pumpportal") === SOURCE && Array.isArray(r.f) && r.f.length === SIGNALS.length && [0, 1, 2].includes(r.y))
    .map((r) => ({ ...r, f: r.f.map((v) => (Number.isFinite(v) ? v : 0)) }));
  model = new Model(SIGNALS.length);
  for (const r of rows) model.observe(r.f);
  for (const r of rows) model.learn(r.f, r.y, r.ret);
  // Las operaciones en papel de ese periodo se abrieron con predicciones inválidas: se apartan para no falsear los resultados
  const pf = path.join(DATA, "paper.jsonl");
  if (fs.existsSync(pf)) fs.renameSync(pf, path.join(DATA, `paper-invalido-${Date.now()}.jsonl`));
  saveJSON(MODEL_FILE, model);
  repairNote = `modelo reparado: reentrenado con ${rows.length} etiquetas válidas; operaciones en papel anteriores apartadas`;
  console.log("  " + repairNote);
}
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
const paperNet = () => S.paper.reduce((s, c) => s + c.ret, 0);
function setHalted(reason) { S.halted = reason; saveJSON("state.json", { halted: reason }); log("GRD", reason ? "DETENIDO · " + reason : "reanudado"); }

// ---------- compuerta para dinero real ----------
function computeGate() {
  const r = [], sc = model.score();
  if (cfg.mode !== "live") r.push("MODE=paper en .env (cámbialo a live cuando todo lo demás esté en verde)");
  if (model.labels < cfg.minLabelsLive) r.push(`etiquetas ${model.labels} / ${cfg.minLabelsLive}`);
  if (sc.gain == null || sc.gain < cfg.minGainLive) r.push(`mejora de información ${sc.gain == null ? "—" : (sc.gain * 100).toFixed(1) + "%"} (mínimo ${(cfg.minGainLive * 100).toFixed(0)}%)`);
  if (S.paper.length < cfg.minPaperTradesLive) r.push(`operaciones en papel ${S.paper.length} / ${cfg.minPaperTradesLive}`);
  else if (paperNet() <= 0) r.push(`resultado en papel negativo (${(paperNet() * 100).toFixed(0)}% acumulado)`);
  if (!cfg.privateKey) r.push("falta PRIVATE_KEY (npm run wallet)");
  if (!cfg.rpcUrl) r.push("falta RPC_URL");
  if (S.wallet.balance != null && S.wallet.balance < cfg.maxSolPerTrade + cfg.reserveSol) r.push(`saldo ${S.wallet.balance.toFixed(3)} SOL insuficiente`);
  if (S.halted) r.push("bot detenido: " + S.halted);
  S.gate = { ok: r.length === 0, reasons: r };
}
const isLive = () => S.gate.ok;

// ---------- decisión (GUARD → QUANT → EXECUTOR) ----------
tracker.on("observe", (t) => {
  const f = featureVector(t.sig);
  model.observe(f);
  const p = model.predict(f);
  t.p = p;
  const block = guard(t.sig);
  if (block) { t.blocked = true; S.counts.blocked++; decide(t, "block", block, p, null); return; }
  const q = quant(p, t.sig, model.timeRet, isLive());
  t.q = q;
  if (!(q.ev >= cfg.evMin)) { /* también descarta un EV inválido (NaN) */ S.counts.skipped++; decide(t, "skip", `EV ${(q.ev * 100).toFixed(1)}% tras costes · bajo +${(cfg.evMin * 100).toFixed(0)}%`, p, q.ev); return; }
  S.counts.signals++;
  // Toda señal se registra en papel (sin límite de posiciones) para medir si el sistema tiene ventaja
  S.paperOpen.set(t.mint, { t: now(), size: q.size, tokens: buyOnCurve(t.sig.vSol, t.sig.vTok, q.size, cfg.pumpFee).tokens, px: t.pxEntry, impact: q.impact, ev: q.ev });
  if (!isLive()) { decide(t, "entry", `señal · EV ${(q.ev * 100).toFixed(1)}% · en papel`, p, q.ev); log("QNT", `señal en papel ${t.sym} · EV +${(q.ev * 100).toFixed(1)}%`); return; }
  if (S.positions.size >= cfg.maxOpen) { decide(t, "skip", `libro lleno · ${cfg.maxOpen}/${cfg.maxOpen}`, p, q.ev); return; }
  openLive(t, q);
  decide(t, "entry", `ENTRADA REAL · ${q.size} SOL · EV ${(q.ev * 100).toFixed(1)}%`, p, q.ev);
});

async function openLive(t, q) {
  const pos = { mint: t.mint, sym: t.sym, size: q.size, t: now(), status: "abriendo", ev: q.ev, p: t.p };
  S.positions.set(t.mint, pos);
  S.counts.liveEntries++;
  try {
    const r = await live.buy(t.mint, q.size);
    pos.buySig = r.sig; pos.buyDelta = r.delta; pos.status = "abierta";
    log("EXE", `compra real ${t.sym} · ${q.size} SOL · ${r.sig.slice(0, 10)}…`);
    if (pos.closeWhenOpen) closeLive(pos, pos.closeWhenOpen);
  } catch (e) {
    S.positions.delete(t.mint);
    log("EXE", `compra fallida ${t.sym}: ${e.message}`);
  }
}

async function closeLive(pos, why) {
  if (pos.status === "abriendo") { pos.closeWhenOpen = why; return; }
  if (pos.status !== "abierta") return;
  pos.status = "cerrando";
  for (let i = 0; i < 3; i++) {
    try {
      const r = await live.sellAll(pos.mint);
      const pnl = (pos.buyDelta ?? -pos.size) + (r.delta ?? 0);
      const rec = { day: today(), t: now(), mint: pos.mint, sym: pos.sym, size: pos.size, pnl, ret: pnl / pos.size, out: why, buy: pos.buySig, sell: r.sig };
      S.liveClosed.push(rec); appendLine("live.jsonl", rec);
      S.positions.delete(pos.mint);
      log("EXE", `venta real ${pos.sym} · ${why} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} SOL`);
      if (liveToday() <= -cfg.dailyLossLimit) setHalted(`pérdida diaria de ${liveToday().toFixed(3)} SOL alcanzó el límite`);
      return;
    } catch (e) {
      log("EXE", `venta fallida ${pos.sym} (intento ${i + 1}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  pos.status = "abierta"; // se reintentará con el botón "Detener y vender todo" o en el próximo cierre
  log("EXE", `NO se pudo vender ${pos.sym}. Revisa la wallet manualmente.`);
}

// ---------- etiqueta medida → aprendizaje ----------
tracker.on("label", (t) => {
  if (!t.blocked && t.sig) {
    const f = featureVector(t.sig);
    model.learn(f, t.label, t.ret);
    appendLine("labels.jsonl", { src: SOURCE, t: t.tEnd, mint: t.mint, sym: t.sym, y: t.label, ret: t.ret, f, p: t.p });
  }
  const po = S.paperOpen.get(t.mint);
  if (po) {
    S.paperOpen.delete(t.mint);
    const r = t.label === TP ? Math.max(cfg.tp, t.ret) : t.ret;
    const exitSol = po.tokens * po.px * (1 + r) * (1 - cfg.pumpFee) * (1 - po.impact);
    const ret = (exitSol - 2 * cfg.priorityFee) / po.size - 1;
    const rec = { t: now(), mint: t.mint, sym: t.sym, size: po.size, ret, out: OUT[t.label], min: (t.tEnd - t.tObs) / 60000 };
    S.paper.push(rec); appendLine("paper.jsonl", rec);
    log("EXE", `papel ${t.sym} · ${OUT[t.label]} · ${(ret * 100).toFixed(1)}%`);
  }
  const pos = S.positions.get(t.mint);
  if (pos) closeLive(pos, OUT[t.label]);
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
setInterval(computeGate, 5000);

// ---------- panel web local ----------
function state() {
  const sc = model.score();
  const measuring = tracker.measuring().slice(0, 800).map((t) => ({ m: t.mint, s: t.sym, p: t.p || [1 / 3, 1 / 3, 1 / 3], a: (now() - t.tObs) / (cfg.horizonMin * 60000), b: !!t.blocked, r: t.px / t.pxEntry - 1 }));
  return {
    mode: cfg.mode, live: isLive(), gate: S.gate, halted: S.halted,
    feed: { source: SOURCE, connected: feed.connected, msgs: feed.msgs, perHour: feed.perHour(), notice: feed.notice, hasKey: !!cfg.apiKey, dexCalls: dex ? dex.calls : 0, dexErrors: dex ? dex.errors : 0 },
    counts: { seen: tracker.seen, tracked: tracker.tokens.size, measuring: measuring.length, ...S.counts, labels: model.labels, followed: judge.count() },
    model: { labels: model.labels, counts: model.counts, ...sc, timeRet: model.timeRet, recent: model.hist.slice(-60).map((h) => h.y) },
    signals: SIGNALS, measuring, decisions: S.decisions.slice(0, 30), log: S.log.slice(0, 20),
    positions: [...S.positions.values()].map(({ closeWhenOpen, ...p }) => p),
    paper: { n: S.paper.length, net: paperNet(), open: S.paperOpen.size, wins: S.paper.filter((c) => c.ret > 0).length, recent: S.paper.slice(-200) },
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
    else if (req.url === "/api/halt-sell") { setHalted("detenido y vendiendo todo desde el panel"); computeGate(); for (const p of S.positions.values()) closeLive(p, "MANUAL"); }
    else if (req.url === "/api/resume") { setHalted(null); computeGate(); }
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
