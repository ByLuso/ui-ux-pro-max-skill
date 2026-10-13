// Sigue cada lanzamiento y lo evalúa en varios momentos (por defecto a los 90 s, 3, 5 y 10 min).
// En cada momento toma una "foto" de señales (una vista) y mide qué pasó primero desde ese precio:
// +TP, −SL o ninguno dentro del horizonte. Cada vista es una etiqueta que vuelve al modelo.
import { EventEmitter } from "node:events";
import { cfg } from "./config.js";
import { now } from "./store.js";
import { V_SOL0, V_TOK0, GRAD_SOL, SUPPLY } from "./agents.js";
import { TP, SL, TM } from "./model.js";
import { fetchMeta } from "./meta.js";

export class Tracker extends EventEmitter {
  constructor(feed, judge, creators, dex = null) {
    super();
    this.feed = feed; this.judge = judge; this.creators = creators;
    this.dex = dex; // si hay DexPoller, los precios vienen de DexScreener (modo gratuito)
    this.obsSeconds = dex ? Math.max(cfg.obsSeconds, 90) : cfg.obsSeconds; // DexScreener tarda ~1 min en mostrar un token
    // Momentos de decisión en segundos desde el lanzamiento; el primero es el de observación
    this.checkpoints = [this.obsSeconds, ...cfg.checkpoints.filter((s) => s > this.obsSeconds)].sort((a, b) => a - b);
    if (dex) dex.on("pair", (m, p) => this.onDex(m, p));
    this.tokens = new Map();
    this.seen = 0; this.skippedSample = 0;
    this.createTimes = [];          // para la tasa de lanzamientos del mercado
    this.socialSeen = new Map();    // enlace social → veces visto (detecta tokens copiados)
    feed.on("create", (d) => this.onCreate(d));
    feed.on("trade", (d) => this.onTrade(d));
    this.timer = setInterval(() => this.tick(), 1000);
  }

  launchRate() { // lanzamientos por minuto en los últimos 10 min (todos, no solo los seguidos)
    const cut = now() - 600000;
    while (this.createTimes.length && this.createTimes[0] < cut) this.createTimes.shift();
    return this.createTimes.length / 10;
  }

  onCreate(d) {
    this.seen++;
    this.createTimes.push(now());
    // Solo pump.fun y con datos de la curva completos (PumpPortal también emite lanzamientos de otras plataformas)
    if ((d.pool && d.pool !== "pump") || !(+d.vSolInBondingCurve > 0) || !(+d.vTokensInBondingCurve > 0)) return;
    const creatorPrior = this.creators.seen(d.traderPublicKey);
    if (this.tokens.size >= cfg.maxTracked || Math.random() >= cfg.trackSample) { this.skippedSample++; return; }
    const vSol = +d.vSolInBondingCurve || V_SOL0, vTok = +d.vTokensInBondingCurve;
    const t = {
      mint: d.mint, sym: String(d.symbol || "?").slice(0, 16), name: String(d.name || "").slice(0, 40),
      creator: d.traderPublicKey, creatorPrior, t0: now(),
      devTokens: +d.initialBuy || 0, vSol, vTok, px0: vSol / vTok, px: vSol / vTok,
      buyers: new Set(), early: new Set(), buySol: 0, sellSol: 0, trades: 0, dexBuys: 0,
      holders: new Map([[d.traderPublicKey, +d.initialBuy || 0]]),
      phase: "observe", graduated: false, views: [], cp: 0, keepUntil: 0, lastActivity: 0,
      meta: null,
    };
    this.tokens.set(t.mint, t);
    if (!this.dex) this.feed.watch(t.mint);
    // Redes sociales del token (su ficha de metadatos); si tarda o falla, cuenta como "sin redes"
    fetchMeta(d.uri).then((m) => {
      t.meta = m;
      for (const link of m.links) this.socialSeen.set(link, (this.socialSeen.get(link) || 0) + 1);
      if (this.socialSeen.size > 50000) this.socialSeen.clear();
    });
  }

  onTrade(d) {
    const t = this.tokens.get(d.mint);
    if (!t) return;
    t.trades++;
    const sol = +d.solAmount || 0, who = d.traderPublicKey;
    if (d.txType === "buy") {
      t.buySol += sol;
      t.buyers.add(who);
      if (now() - t.t0 < 3000) t.early.add(who);
    } else t.sellSol += sol;
    if (Number.isFinite(+d.newTokenBalance)) t.holders.set(who, +d.newTokenBalance);
    if (d.pool && d.pool !== "pump") { // ya migró a PumpSwap: el precio de la curva deja de valer
      t.graduated = true;
      if (t.phase === "live" && !t.gradEmitted) { t.gradEmitted = true; this.checkViews(t); this.emit("graduated", t); }
      return;
    }
    const vs = +d.vSolInBondingCurve, vt = +d.vTokensInBondingCurve;
    if (vs > 0 && vt > 0 && Number.isFinite(vs / vt)) { t.vSol = vs; t.vTok = vt; t.px = vs / vt; }
    if (t.vSol - V_SOL0 >= GRAD_SOL * 0.995) t.graduated = true;
    if (t.phase === "live") { this.checkViews(t); this.emit("price", t); }
  }

  onDex(mint, p) {
    const t = this.tokens.get(mint);
    if (!t) return;
    t.dexSeen = true;
    const tx = p.txns?.h1 || p.txns?.h24 || {};
    t.buySol = +tx.buys || 0; t.sellSol = +tx.sells || 0; // en este modo son conteos, no SOL
    t.dexBuys = +tx.buys || 0;
    if (!(+p.priceNative > 0)) return;
    t.px = +p.priceNative; // en SOL; tras graduarse sigue siendo el precio en PumpSwap
    if (p.dexId !== "pumpfun") t.graduated = true;
    else {
      t.vSol = Math.sqrt(t.px * V_SOL0 * V_TOK0); // en la curva x·y=k el precio es vSol²/k
      t.vTok = (V_SOL0 * V_TOK0) / t.vSol;
    }
    if (t.phase === "live") { this.checkViews(t); this.emit("price", t); }
  }

  activity(t) { return this.dex ? t.dexBuys : t.trades; }

  snapshot(t, ageSec) {
    const mins = ageSec / 60;
    let followed = 0;
    for (const b of t.buyers) if (this.judge.isFollowed(b)) followed++;
    const balances = [...t.holders.values()].filter((v) => v > 0).sort((a, b) => b - a);
    const top10 = balances.slice(0, 10).reduce((a, b) => a + b, 0) / SUPPLY;
    const links = t.meta ? t.meta.links : [];
    return {
      followed,
      buyersPerMin: (this.dex ? t.dexBuys || 0 : t.buyers.size) / mins,
      buySol: t.buySol, sellSol: t.sellSol,
      earlyShare: t.buyers.size ? t.early.size / t.buyers.size : 0,
      devShare: t.devTokens / SUPPLY,
      top10,
      curve: Math.max(0, (t.vSol - V_SOL0) / GRAD_SOL),
      creatorPrior: t.creatorPrior,
      velocity: Math.log(t.px / t.px0),
      ageMin: mins,
      socials: t.meta ? t.meta.socials : 0,
      socialReuse: links.some((l) => (this.socialSeen.get(l) || 0) > 1) ? 1 : 0,
      vSol: t.vSol, vTok: t.vTok, nBuyers: t.buyers.size, graduated: t.graduated ? 1 : 0,
    };
  }

  checkViews(t) {
    for (const v of t.views) {
      if (v.label != null) continue;
      const r = t.px / v.pxEntry - 1;
      if (r >= cfg.tp || t.graduated) this.finish(v, TP, r);
      else if (r <= -cfg.sl) this.finish(v, SL, r);
    }
  }

  finish(v, y, ret) {
    v.label = y; v.ret = ret; v.tEnd = now();
    if (v.idx === 0) this.judge.record(v.t.earlyBuyers || [], y === TP);
    this.emit("label", v);
  }

  // Mantiene el token vivo mientras haya posiciones (papel o reales) abiertas en él
  hold(v) { v.t.keepUntil = Math.max(v.t.keepUntil, v.tObs + cfg.horizonMin * 60000); }

  drop(t) {
    t.phase = "done";
    if (t.keepUntil) this.emit("expire", t);
    if (!this.dex) this.feed.unwatch(t.mint);
    this.tokens.delete(t.mint);
  }

  tick() {
    const n = now(), H = cfg.horizonMin * 60000;
    for (const t of this.tokens.values()) {
      const age = (n - t.t0) / 1000;
      // Modo gratuito: si DexScreener nunca muestra el token, no hay precio fiable y no se etiqueta
      if (this.dex && t.phase === "observe" && !t.dexSeen && age >= this.obsSeconds + 180) { this.tokens.delete(t.mint); continue; }

      // ¿Toca un momento de decisión?
      const cpSec = this.checkpoints[t.cp];
      if (cpSec != null && age >= cpSec && (!this.dex || t.dexSeen)) {
        const first = t.cp === 0;
        // A partir del segundo momento, solo si el token sigue teniendo actividad
        if (first || this.activity(t) > t.lastActivity) {
          if (first) { t.phase = "live"; t.earlyBuyers = [...t.buyers]; }
          const v = { t, idx: t.cp, mint: t.mint, sym: t.sym, tObs: n, pxEntry: t.px, sig: this.snapshot(t, age) };
          t.views.push(v);
          this.emit("observe", v);
          this.checkViews(t);
        }
        t.lastActivity = this.activity(t);
        t.cp++;
        if (t.cp >= this.checkpoints.length) t.buyers = new Set(); // ya no hacen falta: libera memoria
      }

      // Vistas que llegan al final del horizonte sin tocar ningún umbral
      for (const v of t.views) if (v.label == null && n - v.tObs >= H) this.finish(v, TM, t.px / v.pxEntry - 1);

      // Se deja de seguir cuando ya no quedan momentos, vistas abiertas ni posiciones
      if (t.phase === "live" && t.cp >= this.checkpoints.length && t.views.every((v) => v.label != null) && n >= t.keepUntil) this.drop(t);
    }
  }

  mints() { return [...this.tokens.keys()]; }

  // Vista más reciente de cada token que sigue midiéndose (para el Orb)
  measuring() {
    const out = [];
    for (const t of this.tokens.values()) {
      const v = t.views.filter((x) => x.label == null).at(-1);
      if (v) out.push({ mint: t.mint, sym: t.sym, p: v.p, tObs: v.tObs, blocked: v.blocked, px: t.px, pxEntry: v.pxEntry });
    }
    return out;
  }
}
