// Comprueba las estrategias de salida con recorridos de precio conocidos
import { Exit } from "../src/exits.js";
const run = (kind, path) => { const e = new Exit(kind, 1); for (const p of path) e.update(p); if (!e.done) e.close(path.at(-1), "60 min"); return { r: e.paperReturn(1000, 1000 * 1, 0), s: e.summary() }; };
const cases = {
  "sube fuerte y vuelve": [1.1, 1.3, 1.7, 2.2, 1.6],
  "sube un poco y cae": [1.1, 1.27, 1.1, 0.98],
  "cae directo": [0.95, 0.85, 0.79, 0.6],
  "plano 60 min": [1.05, 0.97, 1.08, 1.02],
  "sube hasta +60% justo": [1.2, 1.4, 1.61],
};
let fail = 0;
for (const [n, p] of Object.entries(cases)) {
  const f = run("fixed", p), l = run("ladder", p);
  console.log(n.padEnd(24), "fija", (f.r * 100).toFixed(1).padStart(6) + "%", f.s.padEnd(22), "| por partes", (l.r * 100).toFixed(1).padStart(6) + "%", l.s);
}
// Comprobaciones clave
const a = run("ladder", cases["sube fuerte y vuelve"]);
if (!a.s.includes("stop móvil")) { console.error("FALLO: el stop móvil no saltó"); fail++; }
const b = run("ladder", cases["cae directo"]);
if (!b.s.startsWith("100% SL")) { console.error("FALLO: el stop inicial no vendió todo"); fail++; }
const c = run("ladder", cases["sube un poco y cae"]);
if (!c.s.includes("stop en 0%")) { console.error("FALLO: el stop no subió a 0% tras la primera venta"); fail++; }
console.log(fail ? "FALLOS: " + fail : "OK");
process.exit(fail ? 1 : 0);
