// Cartera de prueba: saldo ficticio en euros que compra y vende con las mismas reglas que el dinero real
// (mismas señales, misma estrategia de salida, mismas comisiones e impacto en la curva). No mueve dinero.
import { cfg } from "./config.js";
import { now, loadJSON, saveJSON } from "./store.js";
import { Exit, STRATS } from "./exits.js";
import { buyOnCurve } from "./agents.js";

export class PaperWallet {
  constructor() {
    const s = loadJSON("wallet-paper.json", null);
    this.solEur = s?.solEur || null;
    if (s && s.startEur === cfg.paperStartEur) {
      Object.assign(this, s);
      this.positions = new Map((s.positions || []).map((p) => [p.mint, { ...p, exit: Object.assign(new Exit(p.exit.kind, p.exit.entry), p.exit) }]));
    } else this.reset();
  }

  reset() {
    this.startEur = cfg.paperStartEur;
    this.cash = cfg.paperStartEur;
    this.positions = new Map();
    this.events = [];
    this.curve = [{ t: now(), v: cfg.paperStartEur }];
    this.closed = 0; this.wins = 0; this.started = now();
    this.save();
  }

  event(kind, sym, mint, txt, eur) {
    this.events.unshift({ t: now(), kind, sym, mint, txt, eur });
    if (this.events.length > 200) this.events.pop();
  }

  // Abre una posición si hay saldo y hueco. Devuelve el motivo si no puede.
  tryOpen(t, strat, q) {
    if (!this.solEur) return "falta el precio SOL/EUR";
    if (this.positions.has(t.mint)) return "ya hay posición";
    if (this.positions.size >= cfg.paperMaxOpen) return `cartera llena (${cfg.paperMaxOpen} posiciones)`;
    const eur = Math.min(cfg.paperTradeEur, this.cash);
    if (eur < 1) return "sin saldo libre";
    const sol = eur / this.solEur;
    const { tokens, impact } = buyOnCurve(t.vSol, t.vTok, sol, cfg.pumpFee);
    if (!(tokens > 0)) return "sin datos de la curva";
    this.cash -= eur + cfg.priorityFee * this.solEur;
    t.keep = true;
    this.positions.set(t.mint, { mint: t.mint, sym: t.sym, t: now(), eur, sol, tokens, impact, strat, ev: q.ev, pTP: t.p[0], got: 0, exit: new Exit(strat, t.px), lastPx: t.px });
    this.event("buy", t.sym, t.mint, `compra ${eur.toFixed(2)} € · P(+60%) ${t.p[0].toFixed(2)} · EV ${(q.ev * 100).toFixed(1)}% · salida ${STRATS[strat].name.toLowerCase()}`, -eur);
    this.save();
    return null;
  }

  onPrice(t, forceWhy) {
    const p = this.positions.get(t.mint);
    if (!p || !this.solEur) return;
    p.lastPx = t.px;
    const acts = forceWhy ? p.exit.close(t.px, forceWhy) : p.exit.update(t.px);
    if (!acts.length) return;
    // Cada venta devuelve euros a la cartera al momento
    for (const s of p.exit.steps.slice(-acts.length)) {
      const sol = s.sold * p.tokens * s.px * (1 - cfg.pumpFee) * (1 - p.impact * s.sold) - cfg.priorityFee;
      const eur = sol * this.solEur;
      this.cash += eur; p.got += eur;
      const r = s.px / p.exit.entry - 1;
      this.event("sell", p.sym, p.mint, `vende ${Math.round(s.sold * 100)}% · ${s.why} · precio ${r >= 0 ? "+" : ""}${(r * 100).toFixed(0)}%`, eur);
    }
    if (p.exit.done) {
      const pnl = p.got - p.eur;
      this.closed++; if (pnl > 0) this.wins++;
      this.event("close", p.sym, p.mint, `cerrada · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} € (${((pnl / p.eur) * 100).toFixed(1)}%)`, pnl);
      this.positions.delete(t.mint);
    }
    this.save();
  }

  value(p) { return p.exit.rem * p.tokens * p.lastPx * (1 - cfg.pumpFee) * (1 - p.impact * p.exit.rem) * (this.solEur || 0); }
  equity() { let v = this.cash; for (const p of this.positions.values()) v += this.value(p); return v; }

  sample() {
    this.curve.push({ t: now(), v: this.equity() });
    if (this.curve.length > 2000) this.curve.splice(0, this.curve.length - 2000);
  }

  save() {
    saveJSON("wallet-paper.json", { ...this, positions: [...this.positions.values()] });
  }

  state() {
    const eq = this.equity();
    return {
      startEur: this.startEur, cash: this.cash, equity: eq, pnl: eq - this.startEur, pnlPct: eq / this.startEur - 1,
      solEur: this.solEur, closed: this.closed, wins: this.wins, started: this.started, maxOpen: cfg.paperMaxOpen, tradeEur: cfg.paperTradeEur,
      open: [...this.positions.values()].map((p) => {
        const v = this.value(p) + p.got;
        return { mint: p.mint, sym: p.sym, t: p.t, eur: p.eur, value: this.value(p), pnl: v - p.eur, ret: v / p.eur - 1, strat: STRATS[p.strat].name, rem: p.exit.rem, move: p.lastPx / p.exit.entry - 1, steps: p.exit.summary() };
      }),
      events: this.events.slice(0, 40),
      curve: this.curve.slice(-400),
    };
  }
}
