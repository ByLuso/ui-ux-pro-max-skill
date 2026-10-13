// JUDGE, CARTOGRAPHER (versión 1), GUARD y QUANT.
import { cfg } from "./config.js";
import { loadJSON, saveJSON } from "./store.js";

export const V_SOL0 = 30, V_TOK0 = 1073000000, GRAD_SOL = 85, SUPPLY = 1e9;

// Señales que entran al modelo. "ag" es el agente que las mide.
export const SIGNALS = [
  { k: "followed", ag: "JDG", name: "Wallets seguidas dentro" },
  { k: "buyersPerMin", ag: "SCT", name: "Compradores únicos / min" },
  { k: "buySell", ag: "SCT", name: "Compras ÷ ventas (SOL)" },
  { k: "earlyShare", ag: "MAP", name: "Compradores en los primeros 3 s" },
  { k: "devShare", ag: "MAP", name: "Supply comprado por el creador" },
  { k: "top10", ag: "MAP", name: "Top-10 holders" },
  { k: "curve", ag: "SCT", name: "Posición en la curva" },
  { k: "creatorPrior", ag: "MAP", name: "Lanzamientos previos del creador" },
  { k: "velocity", ag: "SCT", name: "Subida desde el lanzamiento" },
];

export function featureVector(s) {
  return [
    s.followed,
    Math.log1p(s.buyersPerMin),
    Math.log((s.buySol + 0.1) / (s.sellSol + 0.1)),
    s.earlyShare,
    s.devShare,
    s.top10,
    s.curve,
    Math.log1p(s.creatorPrior),
    s.velocity,
  ];
}

// ---------- JUDGE: historial de cada wallet compradora ----------
// Una wallet pasa a "seguida" cuando compró temprano en >= 3 tokens medidos y >= 40% de ellos llegaron a +60% primero.
export class Judge {
  constructor() { this.w = new Map(Object.entries(loadJSON("wallets.json", {}))); }
  isFollowed(addr) { const s = this.w.get(addr); return !!s && s[0] >= 3 && s[1] / s[0] >= 0.4; }
  count() { let n = 0; for (const s of this.w.values()) if (s[0] >= 3 && s[1] / s[0] >= 0.4) n++; return n; }
  record(addrs, wasTP) {
    for (const a of addrs) { const s = this.w.get(a) || [0, 0]; s[0]++; if (wasTP) s[1]++; this.w.set(a, s); }
    if (this.w.size > 300000) { // poda: olvida las wallets que solo aparecieron una vez
      for (const [k, s] of this.w) if (s[0] <= 1) this.w.delete(k);
    }
  }
  save() { saveJSON("wallets.json", Object.fromEntries(this.w)); }
}

// ---------- CARTOGRAPHER v1: creadores seriales ----------
export class Creators {
  constructor() { this.c = new Map(Object.entries(loadJSON("creators.json", {}))); }
  seen(addr) { const n = this.c.get(addr) || 0; this.c.set(addr, n + 1); return n; }
  save() {
    if (this.c.size > 200000) for (const [k, n] of this.c) if (n <= 1) this.c.delete(k);
    saveJSON("creators.json", Object.fromEntries(this.c));
  }
}

// ---------- GUARD ----------
export function guard(s) {
  const g = cfg.guard;
  if (s.earlyShare > g.maxEarly) return `${pct(s.earlyShare)} de compradores entraron en los primeros 3 s (bundle/snipers)`;
  if (s.top10 > g.maxTop10) return `top-10 holders con ${pct(s.top10)}`;
  if (s.devShare > g.maxDev) return `el creador compró ${pct(s.devShare)} del supply`;
  if (s.creatorPrior >= g.maxCreatorPrior) return `creador serial · ${s.creatorPrior} lanzamientos previos`;
  return null;
}

// ---------- QUANT ----------
export function buyOnCurve(vSol, vTok, sol, fee) {
  const net = sol * (1 - fee), k = vSol * vTok;
  const tokens = vTok - k / (vSol + net);
  const spot = vSol / vTok, avg = sol / tokens;
  return { tokens, impact: avg / spot - 1 };
}

export function quant(p, s, timeRet, live) {
  const size = cfg.maxSolPerTrade;
  const { tokens, impact } = buyOnCurve(s.vSol, s.vTok, size, cfg.pumpFee);
  const fees = 2 * cfg.pumpFee + (live ? 2 * cfg.portalFee : 0);
  const costs = fees + impact * 2 + (2 * cfg.priorityFee) / size + 0.01; // +1% de colchón por slippage
  const gross = p[0] * cfg.tp + p[1] * -(cfg.sl + 0.05) + p[2] * timeRet; // los stops suelen ejecutarse algo peor
  return { size, tokens, impact, costs, gross, ev: gross - costs };
}

export const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
