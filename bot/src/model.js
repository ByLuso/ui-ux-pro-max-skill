// Regresión softmax de tres clases que aprende en línea.
// Clases: 0 = TP (+60% primero), 1 = SL (−30% primero), 2 = TIEMPO (ninguno en el horizonte).
export const TP = 0, SL = 1, TM = 2;
export const OUT = ["TP", "SL", "TIEMPO"];

const softmax = (z) => {
  const m = Math.max(...z), e = z.map((v) => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
};

export class Model {
  constructor(nf) {
    this.nf = nf;
    this.W = [0, 1, 2].map(() => new Array(nf + 1).fill(0));
    this.mean = new Array(nf).fill(0);
    this.m2 = new Array(nf).fill(0);
    this.nObs = 0;
    this.labels = 0;
    this.counts = [0, 0, 0];
    this.hist = [];          // evaluación prequencial: se puntúa ANTES de aprender cada etiqueta
    this.timeRet = -0.1;     // retorno medio cuando no se alcanza ningún umbral
  }

  static from(json, nf) {
    const m = new Model(nf);
    if (json && json.nf === nf) Object.assign(m, json);
    return m;
  }

  // true si algún peso o estadística dejó de ser un número válido (p. ej. NaN guardado como null)
  corrupted() {
    const ok = (a) => a.every((v) => typeof v === "number" && Number.isFinite(v));
    return !(this.W.every(ok) && ok(this.mean) && ok(this.m2) && Number.isFinite(this.timeRet));
  }

  observe(f) { // estadística corriente para estandarizar cada señal
    if (!f.every(Number.isFinite)) return;
    this.nObs++;
    for (let i = 0; i < this.nf; i++) {
      const d = f[i] - this.mean[i];
      this.mean[i] += d / this.nObs;
      this.m2[i] += d * (f[i] - this.mean[i]);
    }
  }

  norm(f) {
    const x = f.map((v, i) => {
      const sd = this.nObs > 10 ? Math.sqrt(this.m2[i] / (this.nObs - 1)) || 1 : 1;
      return Math.max(-4, Math.min(4, (v - this.mean[i]) / sd));
    });
    x.push(1);
    return x;
  }

  logits(x) { return this.W.map((w) => w.reduce((s, wi, i) => s + wi * x[i], 0)); }

  predict(f) {
    if (this.labels === 0) return [1 / 3, 1 / 3, 1 / 3];
    const p = softmax(this.logits(this.norm(f)));
    return p.every(Number.isFinite) ? p : [1 / 3, 1 / 3, 1 / 3];
  }

  prior() {
    const t = this.counts[0] + this.counts[1] + this.counts[2] + 3;
    return this.counts.map((n) => (n + 1) / t);
  }

  // Contribución secuencial de cada señal a P(TP), para el panel "constructor de estado"
  explain(f) {
    const x = this.norm(f), z = this.W.map((w) => w[this.nf]);
    const prior = softmax(z)[TP], steps = [];
    let prev = prior;
    for (let i = 0; i < this.nf; i++) {
      for (let c = 0; c < 3; c++) z[c] += this.W[c][i] * x[i];
      const p = softmax(z)[TP];
      steps.push(p - prev);
      prev = p;
    }
    return { prior, steps };
  }

  learn(f, y, ret) {
    if (!f.every(Number.isFinite)) return;
    const p = this.predict(f), pr = this.prior();
    this.hist.push({ y, p: Math.max(p[y], 1e-6), p0: pr[y] });
    if (this.hist.length > 500) this.hist.shift();
    const x = this.norm(f), q = softmax(this.logits(x));
    const lr = 0.05 / (1 + this.labels / 5000), l2 = 0.0005;
    for (let c = 0; c < 3; c++) {
      const g = (c === y ? 1 : 0) - q[c];
      for (let i = 0; i <= this.nf; i++) this.W[c][i] += lr * (g * x[i] - (i < this.nf ? l2 * this.W[c][i] : 0));
    }
    this.labels++;
    this.counts[y]++;
    if (y === TM && Number.isFinite(ret)) this.timeRet += (ret - this.timeRet) * 0.02;
  }

  // Log-loss del modelo frente a usar solo la frecuencia histórica (prior). Ganancia > 0 = las señales aportan.
  score() {
    this.hist = this.hist.filter((h) => Number.isFinite(h.p) && Number.isFinite(h.p0));
    const n = this.hist.length;
    if (n < 30) return { n, ll: null, ll0: null, gain: null };
    const ll = -this.hist.reduce((s, h) => s + Math.log(h.p), 0) / n;
    const ll0 = -this.hist.reduce((s, h) => s + Math.log(h.p0), 0) / n;
    return { n, ll, ll0, gain: (ll0 - ll) / ll0 };
  }
}
