// RADAR: busca monedas (Binance + tokens en tendencia de DEX + tu lista), analiza su gráfico de 1 h,
// cruza noticias y les da una puntuación. Solo vigila y avisa: no opera.
// Además mide si funciona: guarda cada puntuación y 24 h después mira qué hizo el precio.
import { loadJSON, saveJSON, appendLine, readLines } from "../store.js";
import { analyze } from "./ta.js";
import { News, matcher } from "./news.js";
import { checkSecurity } from "./security.js";

const BINANCE = "https://data-api.binance.vision/api/v3";
const GECKO = "https://api.geckoterminal.com/api/v2";
const NETS = { solana: "Solana", base: "Base", eth: "Ethereum", bsc: "BNB Chain" };
const STABLE = /^(USDT|USDC|FDUSD|TUSD|BUSD|DAI|USDP|USD1|EUR|EURI|AEUR|PAXG|XUSD|USDE|BFUSD|RLUSD)$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (r.status === 429) { const e = new Error("límite de consultas (429)"); e.rate = true; throw e; }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export class Radar {
  constructor() {
    this.coins = new Map();
    this.watch = loadJSON("watchlist.json", []); // [{kind, sym, name, net, pool}]
    this.news = new News();
    this.trending = new Set();
    this.snaps = readLines("radar-snaps.jsonl", 20000);
    this.alerts = [];
    this.status = { binance: "—", gecko: "—", universe: 0 };
    this.geckoQueue = [];
    this.geckoPauseUntil = 0;
  }

  start() {
    const loop = (fn, ms) => { const run = async () => { try { await fn(); } catch (e) { console.log("[RADAR]", e.message); } setTimeout(run, ms); }; run(); };
    loop(() => this.news.refresh().then(() => this.rescoreAll()), 10 * 60e3);
    // Primero la lista de monedas y justo después sus gráficos; luego los gráficos de Binance cada 15 min
    loop(() => this.refreshUniverse().then(() => this.refreshBinanceCandles(true)), 30 * 60e3);
    setTimeout(() => loop(() => this.refreshBinanceCandles(), 15 * 60e3), 15 * 60e3);
    this.geckoWorker();
    this.securityWorker();
    loop(() => this.snapshot(), 60 * 60e3);
  }

  key(c) { return c.kind === "cex" ? "cex:" + c.sym : `dex:${c.net}:${c.pool}`; }

  upsert(c, src) {
    const k = this.key(c);
    const cur = this.coins.get(k) || { ...c, id: k, candles: null, ta: null, news: { count: 0, score: 0, items: [] }, src: new Set() };
    Object.assign(cur, { ...c, id: k });
    cur.src.add(src);
    cur.seen = Date.now();
    cur.match = cur.match || matcher(cur.sym.toUpperCase(), cur.name);
    this.coins.set(k, cur);
    return cur;
  }

  async refreshUniverse() {
    // 1) Binance: los 40 pares con USDT de más volumen (sin stablecoins ni tokens apalancados)
    try {
      const all = await getJSON(`${BINANCE}/ticker/24hr`);
      const top = all.filter((t) => t.symbol.endsWith("USDT") && !STABLE.test(t.symbol.slice(0, -4)) && !/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol) && +t.count > 0)
        .sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 40);
      for (const t of top) this.upsert({ kind: "cex", sym: t.symbol.slice(0, -4), name: "", pair: t.symbol, vol24: +t.quoteVolume, ch24: +t.priceChangePercent / 100, price: +t.lastPrice, url: `https://www.binance.com/es/trade/${t.symbol.slice(0, -4)}_USDT` }, "binance");
      this.status.binance = "ok";
    } catch (e) { this.status.binance = e.message; }

    // 2) GeckoTerminal: pools en tendencia por red, con liquidez y volumen mínimos para no vigilar basura
    for (const net of Object.keys(NETS)) {
      try {
        const d = await getJSON(`${GECKO}/networks/${net}/trending_pools?page=1`);
        const pools = d.data.map((p) => ({ p, a: p.attributes })).filter(({ a }) => +a.reserve_in_usd >= 50000 && +a.volume_usd.h24 >= 100000)
          .sort((x, y) => y.a.volume_usd.h24 - x.a.volume_usd.h24).slice(0, 10);
        for (const { p, a } of pools) this.upsert(this.fromPool(net, p), "tendencia DEX");
        this.status.gecko = "ok";
      } catch (e) { this.status.gecko = e.message; if (e.rate) await sleep(60e3); }
      await sleep(3000);
    }

    // 3) CoinGecko: monedas en tendencia (bonus pequeño en la puntuación)
    try {
      const t = await getJSON("https://api.coingecko.com/api/v3/search/trending");
      this.trending = new Set(t.coins.map((c) => c.item.symbol.toUpperCase()));
    } catch {}

    // 4) Tu lista siempre se vigila
    for (const w of this.watch) this.upsert(w, "mi lista");

    // Olvida monedas en tendencia que ya no aparecen desde hace 6 h (las de tu lista se quedan)
    for (const [k, c] of this.coins) if (!c.src.has("mi lista") && Date.now() - c.seen > 6 * 3600e3) this.coins.delete(k);
    this.status.universe = this.coins.size;
    for (const c of this.coins.values()) if (c.kind === "dex" && !this.geckoQueue.includes(c.id)) this.geckoQueue.push(c.id);
  }

  fromPool(net, p) {
    const a = p.attributes, [base] = a.name.split(" / ");
    return {
      kind: "dex", net, pool: a.address, sym: base.replace(/^\$/, "").slice(0, 14), name: base,
      token: p.relationships?.base_token?.data?.id?.split("_").slice(1).join("_"),
      dex: p.relationships?.dex?.data?.id, price: +a.base_token_price_usd, ch24: +a.price_change_percentage?.h24 / 100,
      vol24: +a.volume_usd?.h24, liq: +a.reserve_in_usd, url: `https://www.geckoterminal.com/${net}/pools/${a.address}`,
      created: Date.parse(a.pool_created_at) || null,
    };
  }

  async refreshBinanceCandles(onlyMissing = false) {
    for (const c of this.coins.values()) {
      if (c.kind !== "cex" || (onlyMissing && c.candles)) continue;
      try {
        const k = await getJSON(`${BINANCE}/klines?symbol=${c.pair || c.sym + "USDT"}&interval=1h&limit=200`);
        c.candles = k.map((x) => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[7] }));
        this.rescore(c);
      } catch (e) { c.err = e.message; }
      await sleep(200);
    }
  }

  // GeckoTerminal gratis permite ~30 consultas/min: una cada 2,5 s y pausa si nos frenan
  async geckoWorker() {
    for (;;) {
      if (Date.now() < this.geckoPauseUntil || !this.geckoQueue.length) { await sleep(2500); continue; }
      const id = this.geckoQueue.shift(), c = this.coins.get(id);
      if (c) {
        try {
          const d = await getJSON(`${GECKO}/networks/${c.net}/pools/${c.pool}/ohlcv/hour?aggregate=1&limit=200&currency=usd`);
          c.candles = d.data.attributes.ohlcv_list.map((x) => ({ t: x[0] * 1000, o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] })).reverse();
          c.candlesAt = Date.now();
          this.rescore(c);
        } catch (e) { c.err = e.message; if (e.rate) { this.geckoPauseUntil = Date.now() + 60e3; this.geckoQueue.unshift(id); } }
        // vuelve a la cola para actualizarse en ~20 min
        setTimeout(() => { if (this.coins.has(id) && !this.geckoQueue.includes(id)) this.geckoQueue.push(id); }, 20 * 60e3);
      }
      await sleep(2500);
    }
  }

  // Revisa la seguridad de cada token de DEX (una consulta cada 3 s; se repite cada 6 h)
  async securityWorker() {
    let pauseUntil = 0;
    for (;;) {
      await sleep(3000);
      if (Date.now() < pauseUntil) continue;
      const c = [...this.coins.values()].find((x) => x.kind === "dex" && x.token && (!x.secTried || Date.now() - x.secTried > 6 * 3600e3));
      if (!c) continue;
      c.secTried = Date.now();
      try {
        c.sec = await checkSecurity(c);
        if (c.candles) this.rescore(c);
      } catch (e) {
        c.secErr = e.message;
        if (e.rate) { pauseUntil = Date.now() + 60e3; c.secTried = 0; } else c.secTried = Date.now() - 5.5 * 3600e3; // reintenta en 30 min
      }
    }
  }

  rescore(c) {
    c.ta = analyze(c.candles);
    c.news = this.news.forCoin(c.match);
    if (!c.ta) { c.score = null; c.label = c.candles ? "Poco historial (menos de 60 h)" : "Cargando gráfico…"; return; }
    if (c.kind === "dex" || !c.price) c.price = c.ta.price;
    if (c.ch24 == null || Number.isNaN(c.ch24)) c.ch24 = c.ta.ch24;
    let s = c.news.count ? 0.7 * c.ta.score + 0.3 * c.news.score : c.ta.score;
    if (this.trending.has(c.sym.toUpperCase())) s += 5;
    const prev = c.score;
    c.score = Math.round(Math.max(-100, Math.min(100, s)));
    c.label = c.score >= 50 ? "Fuerte" : c.score >= 20 ? "Positiva" : c.score > -20 ? "Neutral" : "Débil";
    // Si no pasa los filtros de seguridad, ni se toca: se marca como descartada y no genera alertas
    if (c.sec && !c.sec.ok) { c.label = "Descartada"; return; }
    if (c.score >= 50 && (prev == null || prev < 50)) this.alert(c, `entra en zona fuerte (${c.score})`);
    if (c.ta.signals.some((x) => x.txt.startsWith("Rompe")) && c.news.score > 20 && !c.alertedBreak) { c.alertedBreak = true; this.alert(c, "ruptura de máximos con noticias positivas"); }
  }

  rescoreAll() { for (const c of this.coins.values()) if (c.candles) this.rescore(c); }

  alert(c, msg) {
    this.alerts.unshift({ t: Date.now(), id: c.id, sym: c.sym, msg, price: c.price });
    if (this.alerts.length > 50) this.alerts.pop();
    console.log(`[RADAR] ${c.sym} ${msg}`);
  }

  // ---------- ¿funciona? ----------
  snapshot() {
    const t = Date.now();
    for (const c of this.coins.values()) {
      if (c.score == null || !c.price) continue;
      const s = { t, id: c.id, sym: c.sym, score: c.score, price: c.price };
      this.snaps.push(s); appendLine("radar-snaps.jsonl", s);
    }
    if (this.snaps.length > 20000) this.snaps.splice(0, this.snaps.length - 20000);
  }

  evaluation() {
    // Para cada foto con 24–30 h de antigüedad, compara su precio con el actual
    const now = Date.now(), rows = [];
    for (const s of this.snaps) {
      const age = now - s.t;
      if (age < 24 * 3600e3 || age > 30 * 3600e3) continue;
      const c = this.coins.get(s.id);
      if (c && c.price) rows.push({ score: s.score, ret: c.price / s.price - 1 });
    }
    const group = (f) => { const g = rows.filter(f); return g.length ? { n: g.length, avg: g.reduce((a, r) => a + r.ret, 0) / g.length, up: g.filter((r) => r.ret > 0).length / g.length } : { n: 0 }; };
    return { strong: group((r) => r.score >= 50), positive: group((r) => r.score >= 20 && r.score < 50), weak: group((r) => r.score <= -20), all: group(() => true) };
  }

  // ---------- tu lista ----------
  async addWatch(q) {
    q = String(q || "").trim();
    if (!q) throw new Error("Escribe un símbolo (BTC) o una dirección de token");
    let entry = null;
    if (/^[A-Za-z0-9]{2,12}$/.test(q)) {
      const sym = q.toUpperCase();
      try { await getJSON(`${BINANCE}/ticker/price?symbol=${sym}USDT`); entry = { kind: "cex", sym, name: "", pair: sym + "USDT", url: `https://www.binance.com/es/trade/${sym}_USDT` }; } catch {}
    }
    if (!entry) {
      const d = await getJSON(`${GECKO}/search/pools?query=${encodeURIComponent(q)}`);
      const best = (d.data || []).filter((p) => NETS[p.relationships?.network?.data?.id]).sort((a, b) => b.attributes.reserve_in_usd - a.attributes.reserve_in_usd)[0];
      if (!best) throw new Error(`No encontré "${q}" en Binance ni en Solana, Base, Ethereum o BNB Chain`);
      entry = this.fromPool(best.relationships.network.data.id, best);
    }
    const { price, ch24, vol24, liq, ...keep } = entry;
    if (!this.watch.some((w) => this.key(w) === this.key(keep))) { this.watch.push(keep); saveJSON("watchlist.json", this.watch); }
    const c = this.upsert(entry, "mi lista");
    if (c.kind === "dex") this.geckoQueue.unshift(c.id); else this.refreshOne(c);
    return c.sym;
  }

  async refreshOne(c) {
    try {
      const k = await getJSON(`${BINANCE}/klines?symbol=${c.pair}&interval=1h&limit=200`);
      c.candles = k.map((x) => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[7] }));
      this.rescore(c);
    } catch (e) { c.err = e.message; }
  }

  removeWatch(id) {
    this.watch = this.watch.filter((w) => this.key(w) !== id);
    saveJSON("watchlist.json", this.watch);
    const c = this.coins.get(id);
    if (c) { c.src.delete("mi lista"); if (!c.src.size) this.coins.delete(id); }
  }

  state(detailId) {
    const list = [...this.coins.values()].map((c) => ({
      id: c.id, kind: c.kind, sym: c.sym, net: c.net ? NETS[c.net] : "Binance", url: c.url, price: c.price, ch24: c.ch24, vol24: c.vol24, liq: c.liq,
      score: c.score, label: c.label, ta: c.ta ? { score: c.ta.score, rsi: c.ta.rsi, top: c.ta.signals.slice(0, 3) } : null,
      news: { count: c.news.count, score: c.news.score, last: c.news.items[0]?.title || null }, mine: c.src.has("mi lista"), trending: this.trending.has(c.sym.toUpperCase()), err: c.ta ? null : c.err || null,
      sec: c.kind === "cex" ? "binance" : c.sec ? { ok: c.sec.ok, why: c.sec.reasons[0] || c.sec.warns[0] || null } : null,
    })).sort((a, b) => ((b.sec?.ok === false ? -1000 : 0) + (b.score ?? -999)) - ((a.sec?.ok === false ? -1000 : 0) + (a.score ?? -999)));
    const d = detailId && this.coins.get(detailId);
    return {
      status: { ...this.status, news: this.news.items.size, newsErrors: this.news.errors, queue: this.geckoQueue.length },
      market: this.news.market(), list, alerts: this.alerts.slice(0, 20), news: this.news.latest(20), eval: this.evaluation(),
      detail: d ? { id: d.id, sym: d.sym, name: d.name, url: d.url, ta: d.ta, news: d.news, candles: (d.candles || []).slice(-120), kind: d.kind, sec: d.sec || null, secErr: d.secErr || null, liq: d.liq, created: d.created } : null,
    };
  }
}
