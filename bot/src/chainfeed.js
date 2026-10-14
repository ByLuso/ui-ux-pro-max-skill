// Datos en tiempo real leídos directamente de la blockchain de Solana (gratis): se suscribe a los
// registros del programa de pump.fun y descifra cada lanzamiento (CreateEvent) y cada compra/venta
// (TradeEvent). Sirve con el RPC público de Solana o con una clave gratuita de Helius.
// Ofrece la misma interfaz que Feed (PumpPortal), así el resto del bot no cambia.
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import bs58 from "bs58";
import { now } from "./store.js";

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const disc = (n) => crypto.createHash("sha256").update("event:" + n).digest().subarray(0, 8).toString("hex");
const TRADE = disc("TradeEvent"), CREATE = disc("CreateEvent");

// Lector binario (formato Borsh de Anchor)
class R {
  constructor(b) { this.b = b; this.o = 8; } // los primeros 8 bytes son el discriminador
  key() { const v = bs58.encode(this.b.subarray(this.o, this.o + 32)); this.o += 32; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return Number(v); }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return Number(v); }
  bool() { return this.b[this.o++] === 1; }
  str() { const n = this.b.readUInt32LE(this.o); this.o += 4; const v = this.b.subarray(this.o, this.o + n).toString("utf8"); this.o += n; return v; }
}

export function decodeTrade(b) {
  const r = new R(b);
  const mint = r.key(), sol = r.u64(), tok = r.u64(), isBuy = r.bool(), user = r.key(); r.i64();
  const vSol = r.u64(), vTok = r.u64();
  return { mint, solAmount: sol / 1e9, tokenAmount: tok / 1e6, txType: isBuy ? "buy" : "sell", traderPublicKey: user, vSolInBondingCurve: vSol / 1e9, vTokensInBondingCurve: vTok / 1e6 };
}

export function decodeCreate(b) {
  const r = new R(b);
  const name = r.str(), symbol = r.str(), uri = r.str(), mint = r.key(); r.key(); const user = r.key();
  return { name, symbol, uri, mint, traderPublicKey: user };
}

export function wsUrlFrom(rpcUrl) {
  if (!rpcUrl) return "wss://api.mainnet-beta.solana.com";
  return rpcUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

export class ChainFeed extends EventEmitter {
  constructor(rpcUrl) {
    super();
    this.url = wsUrlFrom(rpcUrl);
    this.provider = /helius/i.test(this.url) ? "Helius" : "RPC público de Solana";
    this.subs = new Set();
    this.bal = new Map();           // mint → (wallet → tokens), para el top-10 de holders
    this.seenMints = new Set();
    this.connected = false; this.msgs = 0; this.msgTimes = []; this.lastMsg = 0; this.notice = ""; this.backoff = 1000;
  }

  start() {
    const ws = (this.ws = new WebSocket(this.url));
    let alive = now();
    ws.onopen = () => {
      this.connected = true; this.backoff = 1000;
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "logsSubscribe", params: [{ mentions: [PUMP_PROGRAM] }, { commitment: "confirmed" }] }));
      this.notice = `conectado a ${this.provider}`;
      this.emit("status");
    };
    ws.onmessage = (e) => {
      alive = now();
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.error) { this.notice = `${this.provider}: ${d.error.message || "error"}`; this.emit("notice", this.notice); return; }
      const v = d.params?.result?.value;
      if (!v || v.err) return;
      this.msgs++; this.lastMsg = now(); this.msgTimes.push(this.lastMsg);
      if (this.msgTimes.length > 20000) this.msgTimes.splice(0, 5000);
      this.handle(v.logs || []);
    };
    ws.onclose = () => {
      this.connected = false; clearInterval(this.watchdog); this.emit("status");
      setTimeout(() => this.start(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 30000);
    };
    ws.onerror = () => {};
    // Si la conexión se queda muda 60 s, se reinicia
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => { if (now() - alive > 60000) { try { ws.close(); } catch {} } }, 15000);
  }

  handle(logs) {
    let create = null; const trades = [];
    // Pila de programas en ejecución: solo valen los eventos emitidos por el propio programa de pump.fun
    // (otros programas, como bots de trading, emiten eventos con el mismo nombre y otro formato)
    const stack = [];
    for (const l of logs) {
      const inv = l.match(/^Program (\w+) invoke \[/);
      if (inv) { stack.push(inv[1]); continue; }
      if (/^Program \w+ (success|failed)/.test(l)) { stack.pop(); continue; }
      if (!l.startsWith("Program data: ") || stack.at(-1) !== PUMP_PROGRAM) continue;
      let b; try { b = Buffer.from(l.slice(14), "base64"); } catch { continue; }
      if (b.length < 16) continue;
      const k = b.subarray(0, 8).toString("hex");
      try {
        if (k === TRADE) { const t = decodeTrade(b); if (t.vSolInBondingCurve >= 1 && t.vTokensInBondingCurve > 0) trades.push(t); }
        else if (k === CREATE) create = decodeCreate(b);
      } catch { /* evento con otro formato: se ignora */ }
    }
    if (create && !this.seenMints.has(create.mint)) { // a veces la misma transacción llega dos veces
      this.seenMints.add(create.mint);
      if (this.seenMints.size > 20000) this.seenMints.clear();
      // La compra inicial del creador va en la misma transacción
      const dev = trades.find((t) => t.mint === create.mint && t.traderPublicKey === create.traderPublicKey && t.txType === "buy");
      const first = trades.find((t) => t.mint === create.mint);
      this.emit("create", {
        txType: "create", pool: "pump", ...create,
        initialBuy: dev ? dev.tokenAmount : 0,
        vSolInBondingCurve: first ? first.vSolInBondingCurve : 30, vTokensInBondingCurve: first ? first.vTokensInBondingCurve : 1073000000,
      });
    }
    for (const t of trades) {
      if (!this.subs.has(t.mint)) continue;
      const m = this.bal.get(t.mint) || new Map();
      const nb = Math.max(0, (m.get(t.traderPublicKey) || 0) + (t.txType === "buy" ? t.tokenAmount : -t.tokenAmount));
      m.set(t.traderPublicKey, nb); this.bal.set(t.mint, m);
      this.emit("trade", { ...t, pool: "pump", newTokenBalance: nb });
    }
  }

  watch(mint) { this.subs.add(mint); }
  unwatch(mint) { this.subs.delete(mint); this.bal.delete(mint); }

  perHour() {
    const t = now(), w = this.msgTimes.filter((x) => t - x < 60000).length;
    return w * 60;
  }
}
