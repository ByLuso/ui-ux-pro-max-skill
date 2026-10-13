// Filtros de seguridad para tokens de DEX (las monedas de Binance ya pasaron su propio listado).
// Solana → RugCheck · Base / Ethereum / BNB Chain → GoPlus. Ambas APIs son gratuitas y sin clave.
// Reglas: liquidez sin bloquear en pools jóvenes, creador o dueño con más del 7%, token trampa
// (no se puede vender), impuestos altos y riesgos graves → descartado.

const CHAIN = { base: "8453", eth: "1", bsc: "56" };
const DEAD = /^0x0{40}$|^0x0{36}dead$|^0x000000000000000000000000000000000000dead$/i;
const MAX_OWNER = 0.07, MIN_LP_LOCKED = 0.8, YOUNG_DAYS = 30;
const pc = (x) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + "%";

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (r.status === 429) { const e = new Error("límite de consultas"); e.rate = true; throw e; }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function checkSecurity(c) {
  const out = { ok: true, reasons: [], warns: [], src: null, t: Date.now() };
  const young = !c.created || Date.now() - c.created < YOUNG_DAYS * 86400e3;
  const lpRule = (locked) => {
    if (locked == null) { out.warns.push("no se pudo saber si la liquidez está bloqueada"); return; }
    if (locked < MIN_LP_LOCKED) {
      const txt = `liquidez bloqueada solo ${pc(locked)}`;
      if (young) out.reasons.push(txt + " en un pool de menos de 30 días"); else out.warns.push(txt + " (pool con más de 30 días)");
    }
  };

  if (c.net === "solana") {
    out.src = "RugCheck";
    const d = await getJSON(`https://api.rugcheck.xyz/v1/tokens/${c.token}/report/summary`);
    lpRule(d.lpLockedPct == null ? null : d.lpLockedPct / 100);
    for (const r of d.risks || []) {
      const txt = `${r.name}${r.value ? " (" + r.value + ")" : ""}`;
      if (r.level === "danger") out.reasons.push(txt); else out.warns.push(txt);
    }
  } else if (CHAIN[c.net]) {
    out.src = "GoPlus";
    const d = await getJSON(`https://api.gopluslabs.io/api/v1/token_security/${CHAIN[c.net]}?contract_addresses=${c.token}`);
    const r = d.result && (d.result[c.token.toLowerCase()] || Object.values(d.result)[0]);
    if (!r) throw new Error("GoPlus no tiene datos de este token");
    if (r.is_honeypot === "1") out.reasons.push("token trampa: no se puede vender");
    if (r.cannot_sell_all === "1") out.reasons.push("no permite vender todo el saldo");
    if (+r.sell_tax > 0.1) out.reasons.push(`impuesto de venta ${pc(+r.sell_tax)}`);
    else if (+r.sell_tax > 0) out.warns.push(`impuesto de venta ${pc(+r.sell_tax)}`);
    if (+r.buy_tax > 0.1) out.reasons.push(`impuesto de compra ${pc(+r.buy_tax)}`);
    if (+r.creator_percent > MAX_OWNER) out.reasons.push(`el creador tiene ${pc(+r.creator_percent)} del supply`);
    if (+r.owner_percent > MAX_OWNER) out.reasons.push(`el dueño del contrato tiene ${pc(+r.owner_percent)} del supply`);
    if (r.is_mintable === "1" && young) out.warns.push("se pueden crear más tokens");
    if (r.hidden_owner === "1") out.reasons.push("dueño oculto");
    if (r.transfer_pausable === "1") out.warns.push("las transferencias se pueden pausar");
    const lp = r.lp_holders || [];
    lpRule(lp.length ? lp.filter((h) => h.is_locked === 1 || h.is_locked === "1" || DEAD.test(h.address || "")).reduce((s, h) => s + +h.percent, 0) : null);
  } else return null;

  out.ok = out.reasons.length === 0;
  return out;
}
