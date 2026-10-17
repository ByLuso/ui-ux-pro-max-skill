// Calibración: aprende cuánto acierta de verdad el modelo en cada tramo de probabilidad.
// Si dice "0,9" pero en ese tramo solo acierta el 40%, la probabilidad pasa a ~0,4.
// Se actualiza con cada resultado conocido (nunca con el futuro) y usa la del modelo mientras hay pocos datos.
import { TP, SL } from "../model.js";

const B = 10, K = 8; // tramos de 0,1 · peso de la probabilidad original cuando un tramo tiene pocos casos
const bucket = (x) => Math.max(0, Math.min(B - 1, Math.floor(x * B)));

export class Calib {
  constructor(j) {
    const z = () => ({ n: new Array(B).fill(0), h: new Array(B).fill(0) });
    this.tp = j?.tp || z();
    this.sl = j?.sl || z();
  }
  add(p, y) {
    if (!p) return;
    const a = bucket(p[0]), b = bucket(p[1]);
    this.tp.n[a]++; if (y === TP) this.tp.h[a]++;
    this.sl.n[b]++; if (y === SL) this.sl.h[b]++;
  }
  apply(p) {
    const f = (t, x) => { const i = bucket(x); return (t.h[i] + K * x) / (t.n[i] + K); };
    let a = f(this.tp, p[0]), s = f(this.sl, p[1]);
    if (a + s > 0.99) { const k = 0.99 / (a + s); a *= k; s *= k; }
    return [a, s, 1 - a - s];
  }
  // Para el panel: acierto real por tramo de P(objetivo)
  table() { return this.tp.n.map((n, i) => ({ from: i / B, n, real: n ? this.tp.h[i] / n : null })); }
}
