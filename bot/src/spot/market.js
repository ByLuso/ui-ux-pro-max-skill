// Datos de mercado gratis y en tiempo real desde Binance:
// - Binance (exchange): WebSocket público de velas de 15 min (se actualiza cada ~2 s) + historial por REST.
// - Binance Wallet (tokens Alpha de BNB Chain): lista oficial de tokens y velas por REST, sondeadas cada minuto.
// Emite: "tick" (precio en vivo), "candle" (vela de 15 min cerrada) y "hour" (hora completa cerrada).
import { EventEmitter } from "node:events";
import { cfg } from "../config.js";
import { loadJSON, saveJSON } from "../store.js";

const SPOT = "https://data-api.binance.vision/api/v3";
const WS = "wss://data-stream.binance.vision/stream?streams=";
const ALPHA = "https://www.binance.com/bapi/defi/v1/public";
const ALPHA_LIST = `${ALPHA}/wallet-direct/buw/wallet/cex/alpha/all/token/list`;
const STABLE = /^(USDT|USDC|FDUSD|TUSD|BUSD|DAI|USDP|USD1|EUR|EURI|AEUR|PAXG|XUSD|USDE|BFUSD|RLUSD|USDS|PYUSD)$/;
// No son criptos con movimiento propio: atadas al dólar/oro, copias de BTC/ETH o acciones tokenizadas (GOOGLB, NVDAB…)
const PEGGED = /^(U|RWUSD|XAUT|WBTC|WBETH|BETH|BFUSD|USD1)$/;
const STOCK = /^(GOOGL|QQQ|NVDA|TSLA|TSM|CRCL|SPCX|BNC|MSTR|MU|AMD|DRAM|INTC|CBRS|TQQQ|SNDK|LITE|SKHY|NBIS|AAOI|SOXS|SOXL|SNXX|KORU|AAPL|MSFT|AMZN|META|COIN|HOOD|SPY|PLTR|NFLX)B$/;
const M15 = 15 * 60000, H1 = 3600000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (r.status === 429 || r.status === 418) { const e = new Error("Binance pide ir más despacio (" + r.status + ")"); e.rate = true; throw e; }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return j && j.code === "000000" && "data" in j ? j.data : j; // la API de Alpha envuelve la respuesta
}

const toCandle = (k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[7] });

export class Market extends EventEmitter {
  constructor() {
    super();
    this.coins = new Map();
    this.watch = loadJSON("spot-watchlist.json", []);
    this.status = { ws: "cargando historial", wsMsgs: 0, alphaPolls: 0, alphaErr: null, spotErr: null, universe: null };
    this.msgTimes = [];
    this.eurUsdt = null;
  }

  async start() {
    await this.refreshUniverse();
    await this.bootstrap();
    this.connect();
    this.alphaLoop();
    setInterval(() => this.refreshUniverse().then(() => this.connect(true)).catch(() => {}), 6 * H1);
    setInterval(() => this.refreshEur(), 5 * 60000);
    this.refreshEur();
  }

  // ---------- qué monedas se vigilan ----------
  async refreshUniverse() {
    const keep = new Set();
    try {
      const all = await getJSON(`${SPOT}/ticker/24hr`);
      const top = all.filter((t) => t.symbol.endsWith("USDT") && !STABLE.test(t.symbol.slice(0, -4)) && !PEGGED.test(t.symbol.slice(0, -4)) && !STOCK.test(t.symbol.slice(0, -4)) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) && +t.count > 0)
        .sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, cfg.spot.topN);
      const want = new Set([...top.map((t) => t.symbol), "BTCUSDT", ...this.watch.filter((w) => w.kind === "cex").map((w) => w.pair)]);
      for (const t of all) if (want.has(t.symbol)) {
        const c = this.upsert({ id: "cex:" + t.symbol, kind: "cex", pair: t.symbol, sym: t.symbol.slice(0, -4), name: t.symbol.slice(0, -4), url: `https://www.binance.com/es/trade/${t.symbol.slice(0, -4)}_USDT` });
        Object.assign(c, { price: +t.lastPrice, ch24: +t.priceChangePercent / 100, vol24: +t.quoteVolume });
        keep.add(c.id);
      }
      this.status.spotErr = null;
    } catch (e) { this.status.spotErr = e.message; for (const c of this.coins.values()) if (c.kind === "cex") keep.add(c.id); }

    try {
      const list = await getJSON(ALPHA_LIST);
      this.alphaList = list;
      const ok = list.filter((x) => x.chainId === "56" && !x.offline && !x.fullyDelisted && !x.listingCex && +x.liquidity >= cfg.spot.alphaMinLiq && +x.volume24h >= cfg.spot.alphaMinVol)
        .sort((a, b) => b.volume24h - a.volume24h).slice(0, cfg.spot.alphaTopN);
      const mine = new Set(this.watch.filter((w) => w.kind === "alpha").map((w) => w.alphaId));
      for (const x of list) if (ok.includes(x) || mine.has(x.alphaId)) {
        const c = this.upsert({ id: "alpha:" + x.alphaId, kind: "alpha", pair: x.alphaId + "USDT", sym: x.symbol, name: x.name, contract: x.contractAddress, alphaId: x.alphaId,
          url: `https://bscscan.com/token/${x.contractAddress}`, listed: +x.listingTime || null });
        this.alphaInfo(c, x);
        keep.add(c.id);
      }
      this.status.alphaErr = null;
    } catch (e) { this.status.alphaErr = e.message; for (const c of this.coins.values()) if (c.kind === "alpha") keep.add(c.id); }

    for (const id of [...this.coins.keys()]) if (!keep.has(id)) this.coins.delete(id);
    this.status.universe = new Date().toISOString();
  }

  alphaInfo(c, x) {
    Object.assign(c, { price: +x.price, ch24: +x.percentChange24h / 100, vol24: +x.volume24h, liq: +x.liquidity, holders: +x.holders || 0, mcap: +x.marketCap || 0 });
  }

  upsert(c) {
    const cur = this.coins.get(c.id) || { ...c, c15: [], lastClosed: 0 };
    Object.assign(cur, c);
    this.coins.set(c.id, cur);
    return cur;
  }

  // ---------- velas ----------
  async klines(c, limit) {
    const url = c.kind === "cex" ? `${SPOT}/klines?symbol=${c.pair}&interval=15m&limit=${limit}` : `${ALPHA}/alpha-trade/klines?symbol=${c.pair}&interval=15m&limit=${limit}`;
    return (await getJSON(url)).map(toCandle);
  }

  // Une velas nuevas con las que ya hay. Si `emit`, avisa de cada vela que pasa a estar cerrada (en orden).
  merge(c, list, emit = true) {
    const now = Date.now();
    for (const k of list) {
      const last = c.c15.at(-1);
      if (last && k.t === last.t) Object.assign(last, k);
      else if (!last || k.t > last.t) c.c15.push(k);
      else { const i = c.c15.findIndex((x) => x.t === k.t); if (i >= 0) Object.assign(c.c15[i], k); }
    }
    if (c.c15.length > 1200) c.c15.splice(0, c.c15.length - 1200);
    if (c.c15.length) c.px = c.c15.at(-1).c;
    for (const k of c.c15) {
      if (k.t + M15 > now || k.t <= c.lastClosed) continue;
      c.lastClosed = k.t;
      if (emit) {
        this.emit("candle", c, k);
        if ((k.t + M15) % H1 === 0) this.emit("hour", c, k.t + M15);
      }
    }
  }

  async bootstrap() {
    for (const c of this.coins.values()) {
      if (c.c15.length) continue;
      try { this.merge(c, await this.klines(c, c.kind === "cex" ? 1000 : 500), false); } catch (e) { c.err = e.message; if (e.rate) await sleep(30000); }
      await sleep(c.kind === "cex" ? 120 : 400);
    }
    this.emit("ready");
  }

  // ---------- Binance: WebSocket en tiempo real ----------
  connect(reconnect = false) {
    const streams = [...this.coins.values()].filter((c) => c.kind === "cex").map((c) => c.pair.toLowerCase() + "@kline_15m");
    if (!streams.length) return;
    if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch {} }
    const ws = (this.ws = new WebSocket(WS + streams.join("/")));
    let alive = Date.now();
    ws.onopen = async () => {
      this.status.ws = "conectado";
      this.emit("status");
      if (reconnect || this.wasConnected) this.backfill("cex"); // rellena el hueco si se cortó o el ordenador durmió
      this.wasConnected = true;
    };
    ws.onmessage = (e) => {
      alive = Date.now();
      let d; try { d = JSON.parse(e.data); } catch { return; }
      const k = d.data && d.data.k;
      if (!k) return;
      const c = this.coins.get("cex:" + k.s);
      if (!c) return;
      this.status.wsMsgs++; this.msgTimes.push(alive); if (this.msgTimes.length > 20000) this.msgTimes.splice(0, 5000);
      const cd = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.q };
      const last = c.c15.at(-1);
      if (last && last.t === cd.t) Object.assign(last, cd); else if (!last || cd.t > last.t) c.c15.push(cd);
      c.px = cd.c;
      this.emit("tick", c, cd.c);
      if (k.x && cd.t > c.lastClosed) {
        c.lastClosed = cd.t;
        this.emit("candle", c, cd);
        if ((cd.t + M15) % H1 === 0) this.emit("hour", c, cd.t + M15);
      }
    };
    ws.onclose = () => { this.status.ws = "reconectando"; this.emit("status"); clearInterval(this.wd); setTimeout(() => this.connect(true), 3000); };
    ws.onerror = () => {};
    clearInterval(this.wd);
    this.wd = setInterval(() => { if (Date.now() - alive > 60000) { try { ws.close(); } catch {} } }, 15000);
  }

  async backfill(kind) {
    for (const c of this.coins.values()) {
      if (c.kind !== kind) continue;
      try { this.merge(c, await this.klines(c, 100)); } catch {}
      await sleep(kind === "cex" ? 120 : 400);
    }
  }

  // ---------- Binance Wallet (Alpha): sondeo ----------
  async alphaLoop() {
    let i = 0, lastList = 0;
    for (;;) {
      try {
        if (Date.now() - lastList > 60000) { // precios de todos los tokens en una sola consulta
          lastList = Date.now();
          const list = await getJSON(ALPHA_LIST);
          this.alphaList = list;
          const by = new Map(list.map((x) => [x.alphaId, x]));
          for (const c of this.coins.values()) if (c.kind === "alpha" && by.has(c.alphaId)) {
            this.alphaInfo(c, by.get(c.alphaId));
            c.px = c.price;
            this.emit("tick", c, c.px);
          }
        }
        const alphas = [...this.coins.values()].filter((c) => c.kind === "alpha");
        if (alphas.length) {
          const c = alphas[i++ % alphas.length];
          this.merge(c, await this.klines(c, c.c15.length ? 8 : 500)); // 8 velas = cubre huecos de hasta 2 h
          this.status.alphaPolls++;
          if (c.px) this.emit("tick", c, c.px);
        }
        this.status.alphaErr = null;
      } catch (e) { this.status.alphaErr = e.message; if (e.rate) await sleep(60000); }
      await sleep(Math.max(1500, 60000 / Math.max(1, this.coins.size)));
    }
  }

  async refreshEur() {
    try { this.eurUsdt = +(await getJSON(`${SPOT}/ticker/price?symbol=EURUSDT`)).price; } catch {}
  }

  perHour() { const t = Date.now(); return this.msgTimes.filter((x) => t - x < 60000).length * 60; }

  // ---------- tu lista ----------
  async addWatch(q) {
    q = String(q || "").trim();
    if (!q) throw new Error("Escribe un símbolo (BTC, SOL) o un token de Binance Wallet");
    const up = q.toUpperCase();
    try {
      await getJSON(`${SPOT}/ticker/price?symbol=${up}USDT`);
      const w = { kind: "cex", pair: up + "USDT" };
      if (!this.watch.some((x) => x.pair === w.pair)) { this.watch.push(w); saveJSON("spot-watchlist.json", this.watch); }
      return this.addNow(w);
    } catch {}
    const list = this.alphaList || (await getJSON(ALPHA_LIST));
    const x = list.find((t) => t.chainId === "56" && (t.symbol.toUpperCase() === up || t.contractAddress.toLowerCase() === q.toLowerCase()));
    if (!x) throw new Error(`No encontré "${q}" en Binance ni en Binance Wallet (BNB Chain)`);
    const w = { kind: "alpha", alphaId: x.alphaId };
    if (!this.watch.some((y) => y.alphaId === w.alphaId)) { this.watch.push(w); saveJSON("spot-watchlist.json", this.watch); }
    return this.addNow(w);
  }

  async addNow(w) {
    await this.refreshUniverse();
    await this.bootstrap();
    if (w.kind === "cex") this.connect(true);
    const c = [...this.coins.values()].find((c) => (w.kind === "cex" ? c.pair === w.pair : c.alphaId === w.alphaId));
    return c ? c.sym : "?";
  }

  removeWatch(id) {
    const c = this.coins.get(id);
    if (!c) return;
    this.watch = this.watch.filter((w) => (c.kind === "cex" ? w.pair !== c.pair : w.alphaId !== c.alphaId));
    saveJSON("spot-watchlist.json", this.watch);
  }
  isMine(c) { return this.watch.some((w) => (c.kind === "cex" ? w.pair === c.pair : w.alphaId === c.alphaId)); }
}

// Velas de 1 h a partir de las de 15 min (solo horas completas y cerradas)
export function hourly(c15, until = Infinity) {
  const out = [];
  let cur = null;
  for (const k of c15) {
    if (k.t + M15 > until) break;
    const h = Math.floor(k.t / H1) * H1;
    if (!cur || cur.t !== h) { if (cur && cur.n === 4) out.push(cur); cur = { t: h, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v, n: 1 }; }
    else { cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); cur.c = k.c; cur.v += k.v; cur.n++; }
  }
  if (cur && cur.n === 4 && cur.t + H1 <= until) out.push(cur);
  return out;
}
