// Estrategias de salida. La misma lógica sirve para papel y para dinero real:
// cada actualización de precio puede devolver ventas expresadas como fracción de lo que QUEDA
// (así encajan con PumpPortal, que vende "50%" o "100%" del saldo actual).
import { cfg } from "./config.js";

export const STRATS = {
  fixed: {
    name: "Fija",
    desc: () => `todo a +${pc(cfg.tp)}, todo a −${pc(cfg.sl)} o a los ${cfg.horizonMin} min`,
  },
  ladder: {
    name: "Por partes",
    desc: () => { const L = cfg.ladder; return `${pc(L.tp1Frac)} a +${pc(L.tp1)} · ${pc(L.tp2Frac)} a +${pc(L.tp2)} · resto con stop móvil −${pc(L.trail)} desde el máximo · stop inicial −${pc(L.stop0)}, sube a 0% tras la 1.ª venta`; },
  },
};
const pc = (x) => Math.round(x * 100) + "%";

export class Exit {
  constructor(kind, entryPx) {
    this.kind = kind; this.entry = entryPx; this.peak = entryPx;
    this.rem = 1; this.tp1 = false; this.tp2 = false;
    this.stop = kind === "ladder" ? -cfg.ladder.stop0 : -cfg.sl;
    this.steps = []; // { sold (fracción del original), px, why }
  }

  get done() { return this.rem <= 1e-9; }

  sell(fracOfRem, px, why) {
    const sold = this.rem * fracOfRem;
    this.rem -= sold;
    if (this.rem < 1e-9) this.rem = 0;
    this.steps.push({ sold, px, why });
    return { frac: fracOfRem, why };
  }

  update(px) {
    if (this.done || !(px > 0)) return [];
    const out = [], r = px / this.entry - 1;
    this.peak = Math.max(this.peak, px);
    if (this.kind === "fixed") {
      if (r >= cfg.tp) out.push(this.sell(1, px, "TP"));
      else if (r <= -cfg.sl) out.push(this.sell(1, px, "SL"));
      return out;
    }
    const L = cfg.ladder;
    if (r <= this.stop) { out.push(this.sell(1, px, this.tp1 ? "stop en 0%" : "SL")); return out; }
    if (!this.tp1 && r >= L.tp1) { out.push(this.sell(L.tp1Frac / this.rem, px, `+${pc(L.tp1)}`)); this.tp1 = true; this.stop = 0; }
    if (this.tp1 && !this.tp2 && r >= L.tp2) { out.push(this.sell(Math.min(1, L.tp2Frac / this.rem), px, `+${pc(L.tp2)}`)); this.tp2 = true; }
    if (this.tp1 && !this.done && px <= this.peak * (1 - L.trail) && this.peak > this.entry * (1 + L.tp1)) out.push(this.sell(1, px, "stop móvil"));
    return out;
  }

  close(px, why) { return this.done ? [] : [this.sell(1, px, why)]; }

  // Resultado en papel: cada venta paga comisión e impacto (proporcional a lo vendido) y una comisión de prioridad
  paperReturn(tokens, size, impact) {
    let sol = 0;
    for (const s of this.steps) sol += s.sold * tokens * s.px * (1 - cfg.pumpFee) * (1 - impact * s.sold);
    return (sol - (1 + this.steps.length) * cfg.priorityFee) / size - 1;
  }

  summary() { return this.steps.map((s) => `${pc(s.sold)} ${s.why} ${(s.px / this.entry - 1 >= 0 ? "+" : "")}${pc(s.px / this.entry - 1)}`).join(" · "); }
}
