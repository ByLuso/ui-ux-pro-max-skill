// Prueba rápida sin red: simula lanzamientos y operaciones para comprobar que observación, etiquetas y aprendizaje funcionan.
import { EventEmitter } from "node:events";
import { setNow } from "../src/store.js";
import { Tracker } from "../src/tracker.js";
import { Model } from "../src/model.js";
import { SIGNALS, featureVector, guard, quant } from "../src/agents.js";
import { cfg } from "../src/config.js";

let T = 1e12; setNow(() => T);
class FakeFeed extends EventEmitter { watch() {} unwatch() {} }
const feed = new FakeFeed();
const judge = { isFollowed: () => false, record() {}, count: () => 0 };
const creators = { seen: () => 0 };
cfg.trackSample = 1;
const tr = new Tracker(feed, judge, creators); clearInterval(tr.timer);
const model = new Model(SIGNALS.length);
let obs = 0, labels = 0, blocked = 0, signals = 0;
tr.on("observe", (t) => { obs++; const f = featureVector(t.sig); model.observe(f); t.p = model.predict(f); if (guard(t.sig)) { blocked++; t.blocked = 1; return; } if (quant(t.p, t.sig, model.timeRet, false).ev >= cfg.evMin) signals++; });
tr.on("label", (t) => { labels++; if (!t.blocked) model.learn(featureVector(t.sig), t.label, t.ret); });

const live = [];
for (let step = 0; step < 4 * 3600; step++) { // 4 horas simuladas, paso de 1 s
  T += 1000;
  if (step % 3 === 0) {
    const mint = "M" + step, hot = Math.random() < 0.2;
    feed.emit("create", { txType: "create", mint, symbol: "T" + step, traderPublicKey: "C" + (step % 500), initialBuy: Math.random() * 6e7, vSolInBondingCurve: 30, vTokensInBondingCurve: 1073000000 });
    live.push({ mint, vs: 30, drift: hot ? 0.004 : -0.002, end: step + 1200 + Math.random() * 3000 });
  }
  for (const L of live) {
    if (step > L.end || Math.random() > 0.3) continue;
    const buy = Math.random() < 0.5 + L.drift * 60, sol = Math.random() * 1.5;
    L.vs = Math.max(30.01, L.vs + (buy ? sol : -sol));
    feed.emit("trade", { txType: buy ? "buy" : "sell", mint: L.mint, traderPublicKey: "W" + ((Math.random() * 3000) | 0), solAmount: sol, newTokenBalance: Math.random() * 2e7, vSolInBondingCurve: L.vs, vTokensInBondingCurve: 30 * 1073000000 / L.vs, pool: "pump" });
  }
  tr.tick();
}
const sc = model.score();
console.log({ obs, labels, blocked, signals, counts: model.counts, gain: sc.gain && +sc.gain.toFixed(3), tracked: tr.tokens.size });
if (!(obs > 1000 && labels > 1000)) { console.error("FALLO: el flujo no produjo etiquetas"); process.exit(1); }
console.log("OK");
