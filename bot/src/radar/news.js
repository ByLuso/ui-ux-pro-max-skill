// Lee noticias de cripto por RSS, detecta qué monedas mencionan y les da un tono (positivo/negativo).
// El tono se calcula con una lista de palabras clave: es orientativo, no "entiende" la noticia.

export const FEEDS = [
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Decrypt", "https://decrypt.co/feed"],
  ["The Block", "https://www.theblock.co/rss.xml"],
];

const POS = ["surge", "surges", "soar", "soars", "rally", "rallies", "jump", "jumps", "gain", "gains", "record high", "all-time high", "ath", "bullish", "approval", "approved", "approves", "etf inflow", "inflows", "partnership", "partners", "integration", "listing", "lists", "launches", "upgrade", "adoption", "breakout", "rebound", "rebounds", "accumulat", "buys", "invests", "investment", "raises", "wins", "milestone", "outperform"];
const NEG = ["hack", "hacked", "exploit", "exploited", "drain", "drained", "lawsuit", "sues", "sued", "charged", "fraud", "scam", "rug", "plunge", "plunges", "crash", "crashes", "dump", "dumps", "tumble", "slides", "falls", "drops", "sell-off", "selloff", "liquidat", "delist", "outage", "halt", "bearish", "ban", "bans", "investigation", "probe", "warning", "outflow", "outflows", "bankrupt", "insolvency", "vulnerability", "attack", "losses"];

// Palabras cortas: palabra completa ("ban" no cuenta en "bank"). Largas: también sus variantes ("liquidat" → liquidated).
const re = (w) => new RegExp(w.length <= 5 ? `\\b${w}\\b` : `\\b${w}`, "i");
const POS_RE = POS.map(re), NEG_RE = NEG.map(re);

export function tone(text) {
  let s = 0;
  for (const r of POS_RE) if (r.test(text)) s += 1;
  for (const r of NEG_RE) if (r.test(text)) s -= 1.3; // las malas noticias pesan más
  return Math.max(-3, Math.min(3, s));
}

// Nombres comunes para las monedas grandes; los símbolos de 2 letras o palabras normales se buscan solo por nombre
export const NAMES = {
  BTC: ["bitcoin"], ETH: ["ethereum", " ether "], SOL: ["solana"], XRP: ["xrp", "ripple"], BNB: ["bnb", "binance coin"],
  DOGE: ["dogecoin"], ADA: ["cardano"], TRX: ["tron"], AVAX: ["avalanche"], LINK: ["chainlink"], DOT: ["polkadot"],
  TON: ["toncoin"], SHIB: ["shiba inu"], LTC: ["litecoin"], BCH: ["bitcoin cash"], UNI: ["uniswap"], NEAR: ["near protocol"],
  APT: ["aptos"], SUI: [" sui "], PEPE: ["pepe"], ARB: ["arbitrum"], OP: ["optimism"], HBAR: ["hedera"], XLM: ["stellar"],
  ICP: ["internet computer"], FIL: ["filecoin"], ATOM: ["cosmos"], INJ: ["injective"], SEI: [" sei "], TIA: ["celestia"],
  WLD: ["worldcoin"], ENA: ["ethena"], AAVE: ["aave"], ONDO: ["ondo"], JUP: ["jupiter"], BONK: ["bonk"], WIF: ["dogwifhat"],
  TAO: ["bittensor"], RENDER: ["render network"], FET: ["fetch.ai"], PENGU: ["pudgy penguins", "pengu"], HYPE: ["hyperliquid"],
};
const STOP = new Set(["THE", "FOR", "AND", "ONE", "NEW", "ALL", "CAT", "DOG", "AI", "IT", "ME", "UP", "GO", "NOT", "BIG", "WIN", "TOP", "MAX", "SUN", "MOON", "GAS", "PEOPLE", "TRUMP", "USD", "ETF", "SEC", "CEO", "DEFI", "NFT", "DAO"]);

export function matcher(sym, name) {
  const terms = [...(NAMES[sym] || [])];
  if (name && name.length >= 4 && !STOP.has(name.toUpperCase())) terms.push(name.toLowerCase());
  const symRe = sym.length >= 3 && !STOP.has(sym) ? new RegExp(`(^|[^A-Za-z0-9])\\$?${sym.replace(/[^A-Z0-9]/g, "")}([^A-Za-z0-9]|$)`) : null;
  return (title, body) => {
    const t = " " + (title + " " + body).toLowerCase() + " ";
    return terms.some((w) => t.includes(w)) || (symRe && symRe.test(title + " " + body));
  };
}

const strip = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? strip(m[1]) : ""; };

export class News {
  constructor() { this.items = new Map(); this.lastFetch = 0; this.errors = {}; }

  async refresh() {
    for (const [src, url] of FEEDS) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 OrbitalRadar" } });
        const xml = await r.text();
        for (const it of xml.split(/<item[\s>]/).slice(1)) {
          const title = tag(it, "title"), link = tag(it, "link"), body = tag(it, "description").slice(0, 400);
          const t = Date.parse(tag(it, "pubDate")) || Date.now();
          if (title && link && !this.items.has(link)) this.items.set(link, { src, title, link, body, t, tone: tone(title + " " + body) });
        }
        delete this.errors[src];
      } catch (e) { this.errors[src] = e.message; }
    }
    const cut = Date.now() - 48 * 3600e3;
    for (const [k, v] of this.items) if (v.t < cut) this.items.delete(k);
    this.lastFetch = Date.now();
  }

  // Noticias de una moneda y su puntuación: tono × decaimiento por antigüedad (vida media 12 h)
  forCoin(match) {
    const hits = [...this.items.values()].filter((n) => match(n.title, n.body)).sort((a, b) => b.t - a.t);
    let s = 0;
    for (const n of hits) s += n.tone * Math.pow(0.5, (Date.now() - n.t) / (12 * 3600e3));
    return { count: hits.length, score: Math.round(Math.tanh(s / 2) * 100), items: hits.slice(0, 8) };
  }

  market() {
    const all = [...this.items.values()];
    if (!all.length) return { score: 0, count: 0 };
    // Media ponderada del tono (las recientes pesan más), llevada a −100…+100
    let s = 0, wsum = 0;
    for (const n of all) { const w = Math.pow(0.5, (Date.now() - n.t) / (12 * 3600e3)); s += n.tone * w; wsum += w; }
    return { score: Math.round(Math.tanh((s / wsum) * 1.5) * 100), count: all.length };
  }

  latest(n = 25) { return [...this.items.values()].sort((a, b) => b.t - a.t).slice(0, n); }
}
