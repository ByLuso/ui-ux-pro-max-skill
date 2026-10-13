// SCOUT: conexión en vivo a PumpPortal (lanzamientos nuevos + compras/ventas de cada token).
// Usa un solo WebSocket, como pide PumpPortal; se reconecta solo si se cae.
import { EventEmitter } from "node:events";
import { now } from "./store.js";

export class Feed extends EventEmitter {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.subs = new Set();
    this.connected = false;
    this.msgs = 0;
    this.msgTimes = [];
    this.lastMsg = 0;
    this.notice = "";
    this.backoff = 1000;
  }

  start() {
    const url = "wss://pumpportal.fun/api/data" + (this.apiKey ? `?api-key=${encodeURIComponent(this.apiKey)}` : "");
    const ws = (this.ws = new WebSocket(url));
    ws.onopen = () => {
      this.connected = true;
      this.backoff = 1000;
      this.send({ method: "subscribeNewToken" });
      if (this.subs.size) this.send({ method: "subscribeTokenTrade", keys: [...this.subs] });
      this.emit("status");
    };
    ws.onmessage = (e) => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      this.msgs++;
      this.lastMsg = now();
      this.msgTimes.push(this.lastMsg);
      if (this.msgTimes.length > 5000) this.msgTimes.splice(0, 1000);
      if (d.message) { this.notice = d.message; this.emit("notice", d.message); return; }
      if (d.txType === "create") this.emit("create", d);
      else if (d.txType === "buy" || d.txType === "sell") this.emit("trade", d);
    };
    ws.onclose = () => {
      this.connected = false;
      this.emit("status");
      setTimeout(() => this.start(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30000);
    };
    ws.onerror = () => {}; // onclose se encarga de reconectar
  }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  watch(mint) {
    if (this.subs.has(mint)) return;
    this.subs.add(mint);
    this.send({ method: "subscribeTokenTrade", keys: [mint] });
  }

  unwatch(mint) {
    if (!this.subs.delete(mint)) return;
    this.send({ method: "unsubscribeTokenTrade", keys: [mint] });
  }

  perHour() {
    const t = now(), w = this.msgTimes.filter((x) => t - x < 60000).length;
    return w * 60;
  }
}

// Modo gratuito: precios y conteo de compras/ventas desde la API pública de DexScreener (sin clave).
// Límite de DexScreener: 300 consultas/min; aquí se consultan hasta 30 tokens por llamada cada 10 s.
export class DexPoller extends EventEmitter {
  constructor(getMints, everyMs = 10000) {
    super();
    this.getMints = getMints; this.everyMs = everyMs;
    this.calls = 0; this.errors = 0; this.lastOk = 0;
  }
  start() { this.loop(); }
  async loop() {
    const mints = this.getMints();
    for (let i = 0; i < mints.length; i += 30) {
      const batch = mints.slice(i, i + 30);
      try {
        this.calls++;
        const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + batch.join(","));
        if (r.status === 429) { this.errors++; await new Promise((s) => setTimeout(s, 5000)); continue; }
        const pairs = await r.json();
        if (!Array.isArray(pairs)) continue;
        this.lastOk = now();
        // Un token puede tener varios pares: nos quedamos con el de más liquidez cuyo token base es el nuestro
        const best = new Map();
        for (const p of pairs) {
          const m = p.baseToken && p.baseToken.address;
          if (!batch.includes(m) || !(+p.priceNative > 0)) continue;
          const cur = best.get(m);
          if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) best.set(m, p);
        }
        for (const [m, p] of best) this.emit("pair", m, p);
      } catch { this.errors++; }
      await new Promise((s) => setTimeout(s, 250));
    }
    setTimeout(() => this.loop(), this.everyMs);
  }
}
