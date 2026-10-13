// Sigue cada lanzamiento: observa N segundos, toma la "foto" de señales y luego mide qué pasó primero
// (+TP, −SL o ninguno dentro del horizonte). Eso es la etiqueta que vuelve al modelo.
import { EventEmitter } from "node:events";
import { cfg } from "./config.js";
import { now } from "./store.js";
import { V_SOL0, V_TOK0, GRAD_SOL, SUPPLY } from "./agents.js";
import { TP, SL, TM } from "./model.js";

export class Tracker extends EventEmitter {
  constructor(feed, judge, creators, dex = null) {
    super();
    this.feed = feed; this.judge = judge; this.creators = creators;
    this.dex = dex; // si hay DexPoller, los precios vienen de DexScreener (modo gratuito)
    this.obsSeconds = dex ? Math.max(cfg.obsSeconds, 90) : cfg.obsSeconds; // DexScreener tarda ~1 min en mostrar un token
    if (dex) dex.on("pair", (m, p) => this.onDex(m, p));
    this.tokens = new Map();
    this.seen = 0; this.skippedSample = 0;
    feed.on("create", (d) => this.onCreate(d));
    feed.on("trade", (d) => this.onTrade(d));
    this.timer = setInterval(() => this.tick(), 1000);
  }

  onCreate(d) {
    this.seen++;
    const creatorPrior = this.creators.seen(d.traderPublicKey);
    if (this.tokens.size >= cfg.maxTracked || Math.random() >= cfg.trackSample) { this.skippedSample++; return; }
    const vSol = +d.vSolInBondingCurve || V_SOL0, vTok = +d.vTokensInBondingCurve;
    const t = {
      mint: d.mint, sym: String(d.symbol || "?").slice(0, 16), name: String(d.name || "").slice(0, 40),
      creator: d.traderPublicKey, creatorPrior, t0: now(),
      devTokens: +d.initialBuy || 0, vSol, vTok, px0: vSol / vTok, px: vSol / vTok,
      buyers: new Set(), early: new Set(), buySol: 0, sellSol: 0, trades: 0,
      holders: new Map([[d.traderPublicKey, +d.initialBuy || 0]]),
      phase: "observe", graduated: false,
    };
    this.tokens.set(t.mint, t);
    if (!this.dex) this.feed.watch(t.mint);
  }

  onTrade(d) {
    const t = this.tokens.get(d.mint);
    if (!t) return;
    t.trades++;
    const sol = +d.solAmount || 0, who = d.traderPublicKey;
    if (d.txType === "buy") {
      t.buySol += sol;
      if (t.phase === "observe") { t.buyers.add(who); if (now() - t.t0 < 3000) t.early.add(who); }
    } else t.sellSol += sol;
    if (Number.isFinite(+d.newTokenBalance)) t.holders.set(who, +d.newTokenBalance);
    if (d.pool && d.pool !== "pump") { t.graduated = true; return; } // ya migró a PumpSwap: el precio de la curva deja de valer
    const vs = +d.vSolInBondingCurve, vt = +d.vTokensInBondingCurve;
    if (vs > 0 && vt > 0) { t.vSol = vs; t.vTok = vt; t.px = vs / vt; }
    if (t.vSol - V_SOL0 >= GRAD_SOL * 0.995) t.graduated = true;
    if (t.phase === "measure") this.checkExit(t);
  }

  onDex(mint, p) {
    const t = this.tokens.get(mint);
    if (!t) return;
    t.dexSeen = true;
    const tx = p.txns?.h1 || p.txns?.h24 || {};
    t.buySol = +tx.buys || 0; t.sellSol = +tx.sells || 0; // en este modo son conteos, no SOL
    t.dexBuys = +tx.buys || 0;
    if (p.dexId !== "pumpfun") { t.graduated = true; if (t.phase === "measure") this.checkExit(t); return; }
    t.px = +p.priceNative;
    t.vSol = Math.sqrt(t.px * V_SOL0 * V_TOK0); // en la curva x·y=k el precio es vSol²/k
    t.vTok = (V_SOL0 * V_TOK0) / t.vSol;
    if (t.phase === "measure") this.checkExit(t);
  }

  snapshot(t) {
    const mins = this.obsSeconds / 60;
    let followed = 0;
    for (const b of t.buyers) if (this.judge.isFollowed(b)) followed++;
    const balances = [...t.holders.values()].filter((v) => v > 0).sort((a, b) => b - a);
    const top10 = balances.slice(0, 10).reduce((a, b) => a + b, 0) / SUPPLY;
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
      vSol: t.vSol, vTok: t.vTok, nBuyers: t.buyers.size,
    };
  }

  checkExit(t) {
    if (t.label != null) return;
    const r = t.px / t.pxEntry - 1;
    if (r >= cfg.tp || t.graduated) this.finish(t, TP, r);
    else if (r <= -cfg.sl) this.finish(t, SL, r);
  }

  finish(t, y, ret) {
    t.label = y; t.ret = ret; t.tEnd = now();
    t.phase = "done";
    this.judge.record(t.earlyBuyers || [], y === TP);
    this.emit("label", t);
    if (!this.dex) this.feed.unwatch(t.mint);
    this.tokens.delete(t.mint);
  }

  tick() {
    const n = now();
    for (const t of this.tokens.values()) {
      if (this.dex && t.phase === "observe" && !t.dexSeen && n - t.t0 >= (this.obsSeconds + 180) * 1000) {
        this.tokens.delete(t.mint); // DexScreener nunca lo mostró: sin precio fiable, no se etiqueta
        continue;
      }
      if (t.phase === "observe" && n - t.t0 >= this.obsSeconds * 1000 && (!this.dex || t.dexSeen)) {
        t.phase = "measure";
        t.sig = this.snapshot(t);
        t.pxEntry = t.px;
        t.tObs = n;
        t.earlyBuyers = [...t.buyers];
        t.buyers = null; t.early = null; // ya no hacen falta: libera memoria
        this.emit("observe", t);
        this.checkExit(t);
      } else if (t.phase === "measure" && n - t.tObs >= cfg.horizonMin * 60000) {
        this.finish(t, TM, t.px / t.pxEntry - 1);
      }
    }
  }

  mints() { return [...this.tokens.keys()]; }

  measuring() { return [...this.tokens.values()].filter((t) => t.phase === "measure"); }
}
