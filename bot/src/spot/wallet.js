// Cartera de prueba (euros ficticios) para Binance y Binance Wallet.
// Compra al precio real + deslizamiento, paga comisiones, y sale por objetivo, stop o tiempo máximo.
// Cuando el precio avanza lo suficiente, el stop sube al precio de entrada (ya no puede perder).
import { cfg } from "../config.js";
import { loadJSON, saveJSON } from "../store.js";

const feeOf = (c) => (c.kind === "cex" ? cfg.spot.cexFee : cfg.spot.alphaFee);
// Deslizamiento estimado: casi nada en Binance; en tokens de DEX crece con el tamaño frente a la liquidez
export const slipOf = (c, usd) => (c.kind === "cex" ? 0.0005 : Math.min(0.05, 0.002 + (2 * usd) / Math.max(1, c.liq || 0)));

export class SpotWallet {
  constructor() {
    const s = loadJSON("spot-wallet.json", null);
    if (s && s.startEur === cfg.paperStartEur) Object.assign(this, s, { positions: new Map((s.positions || []).map((p) => [p.coin, p])) });
    else this.reset();
  }

  reset() {
    Object.assign(this, { startEur: cfg.paperStartEur, cash: cfg.paperStartEur, positions: new Map(), events: [], closed: [], curve: [{ t: Date.now(), v: cfg.paperStartEur }], started: Date.now() });
    this.save();
  }

  event(kind, sym, coin, txt, eur) {
    this.events.unshift({ t: Date.now(), kind, sym, coin, txt, eur });
    if (this.events.length > 200) this.events.pop();
  }

  open(c, view, q, eurUsdt, opts = {}) {
    if (this.positions.has(c.id)) return "ya hay una posición en esta moneda";
    if (this.positions.size >= cfg.paperMaxOpen) return `cartera llena (${cfg.paperMaxOpen} posiciones)`;
    const eur = Math.min(opts.eur || cfg.paperTradeEur, this.cash);
    if (eur < 1) return "sin saldo libre";
    const usd = eur * eurUsdt, slip = slipOf(c, usd), f = feeOf(c);
    const entry = (c.px || view.entry) * (1 + slip);
    const qty = (usd * (1 - f)) / entry;
    this.cash -= eur;
    const p = {
      coin: c.id, sym: c.sym, kind: c.kind, t: Date.now(), tEnd: Date.now() + cfg.spot.horizonH * 3600e3, eur, usd, qty, entry, ref: view.entry,
      stop: view.stop, target: view.target || null, trail: opts.trail || 0, peak: c.px || view.entry, strat: opts.strat || null, atr: view.atr, be: false, ev: q.evRaw, evAdj: q.ev, pTP: view.p[0], last: c.px || view.entry, explore: !!opts.explore,
    };
    this.positions.set(c.id, p);
    this.event("buy", c.sym, c.id, p.strat
      ? `${p.strat} · compra ${eur.toFixed(2)} € a ${fmtPx(entry)} · stop ${fmtPx(p.stop)}, que sube siguiendo al precio`
      : `${p.explore ? "exploración · " : ""}compra ${eur.toFixed(2)} € a ${fmtPx(entry)} · objetivo ${fmtPx(p.target)} · stop ${fmtPx(p.stop)} · P(objetivo) ${p.pTP.toFixed(2)} · EV ${pc(q.ev)}`, -eur);
    this.save();
    return null;
  }

  // Precio en vivo
  onTick(c, px, eurUsdt) { const p = this.positions.get(c.id); if (p && px > 0) this.check(c, p, px, px, px, eurUsdt, false); }
  // Vela cerrada (también las que rellenan un corte o una suspensión): se mira su máximo y mínimo reales
  onCandle(c, k, eurUsdt) { const p = this.positions.get(c.id); if (p && k.t + 15 * 60000 > p.t) this.check(c, p, k.l, k.h, k.c, eurUsdt, true); }

  check(c, p, lo, hi, last, eurUsdt, candle) {
    p.last = last;
    if (!p.be && !p.trail && hi >= p.ref + cfg.spot.beAtr * p.atr) { // ya avanzó lo suficiente: el stop pasa a la entrada
      p.be = true; p.stop = Math.max(p.stop, p.entry * (1 + 2 * feeOf(c)));
      this.event("move", p.sym, p.coin, `stop subido a la entrada (${fmtPx(p.stop)}): esta operación ya no puede perder`, 0);
    }
    if (lo <= p.stop) return this.sell(c, p, candle ? p.stop : Math.min(p.stop, last), p.trail ? (p.be ? "stop móvil en ganancia" : "stop") : p.be ? "stop en entrada" : "stop", eurUsdt);
    if (p.target && hi >= p.target) return this.sell(c, p, p.target, "objetivo", eurUsdt);
    if (Date.now() >= p.tEnd) return this.sell(c, p, last, `${cfg.spot.horizonH} h`, eurUsdt);
    if (p.trail) { // stop móvil: se queda a `trail` ATR del máximo alcanzado (después de mirar el stop, por prudencia)
      p.peak = Math.max(p.peak || p.entry, hi);
      p.stop = Math.max(p.stop, p.peak - p.trail * p.atr);
      if (!p.be && p.stop >= p.entry * (1 + 2 * feeOf(c))) { p.be = true; this.event("move", p.sym, p.coin, `el stop móvil ya está por encima de la entrada (${fmtPx(p.stop)}): esta operación ya no puede perder`, 0); }
    }
  }

  sell(c, p, px, why, eurUsdt) {
    const usd = p.qty * px * (1 - slipOf(c, p.usd)) * (1 - feeOf(c));
    const eur = usd / (eurUsdt || 1.08), pnl = eur - p.eur;
    this.cash += eur;
    this.positions.delete(p.coin);
    const rec = { t: Date.now(), sym: p.sym, coin: p.coin, kind: p.kind, eur: p.eur, pnl, ret: pnl / p.eur, ev: p.ev, explore: !!p.explore, strat: p.strat || null, why, hours: (Date.now() - p.t) / 3600e3 };
    this.closed.push(rec);
    if (this.closed.length > 1000) this.closed.shift();
    this.event("sell", p.sym, p.coin, `vende · ${why} a ${fmtPx(px)} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} € (${pc(rec.ret)})`, pnl);
    this.save();
    return rec;
  }

  value(c, p, eurUsdt) { return (p.qty * (c ? c.px || p.last : p.last) * (1 - feeOf(p))) / (eurUsdt || 1.08); }
  equity(coins, eurUsdt) { let v = this.cash; for (const p of this.positions.values()) v += this.value(coins.get(p.coin), p, eurUsdt); return v; }
  sample(coins, eurUsdt) { this.curve.push({ t: Date.now(), v: this.equity(coins, eurUsdt) }); if (this.curve.length > 3000) this.curve.splice(0, this.curve.length - 3000); this.save(); }

  // Diferencia media entre lo ganado de verdad y el EV esperado (últimas 60); solo corrige hacia abajo
  bias() {
    const r = this.closed.filter((x) => Number.isFinite(x.ev)).slice(-60);
    if (r.length < 15) return { bias: 0, n: r.length };
    return { bias: Math.min(0, r.reduce((s, x) => s + (x.ret - x.ev), 0) / r.length), n: r.length };
  }

  save() { saveJSON("spot-wallet.json", { ...this, positions: [...this.positions.values()] }); }

  state(coins, eurUsdt) {
    const eq = this.equity(coins, eurUsdt), cl = this.closed, wins = cl.filter((x) => x.pnl > 0).length;
    return {
      startEur: this.startEur, cash: this.cash, equity: eq, pnl: eq - this.startEur, pnlPct: eq / this.startEur - 1, started: this.started,
      closed: cl.length, wins, avg: cl.length ? cl.reduce((s, x) => s + x.ret, 0) / cl.length : null, maxOpen: cfg.paperMaxOpen, tradeEur: cfg.paperTradeEur,
      open: [...this.positions.values()].map((p) => {
        const c = coins.get(p.coin), v = this.value(c, p, eurUsdt);
        return { coin: p.coin, sym: p.sym, kind: p.kind, explore: !!p.explore, strat: p.strat || null, peak: p.peak, t: p.t, eur: p.eur, value: v, pnl: v - p.eur, ret: v / p.eur - 1, px: c ? c.px : p.last, entry: p.entry, stop: p.stop, target: p.target, be: p.be, tEnd: p.tEnd };
      }),
      events: this.events.slice(0, 40), curve: this.curve.slice(-500), recent: cl.slice(-30).reverse(), bias: this.bias(),
    };
  }
}

export const pc = (x, d = 1) => (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(d) + "%";
export const fmtPx = (p) => (p >= 1000 ? p.toFixed(0) : p >= 1 ? p.toFixed(3) : p >= 0.01 ? p.toFixed(5) : p.toPrecision(4));
