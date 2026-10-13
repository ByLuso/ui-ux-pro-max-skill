// Lee la ficha (metadatos) de un token de pump.fun para saber si tiene Twitter/X, Telegram y web.
// La dirección la pone el creador del token, así que se filtra: solo http(s) a hosts públicos,
// nunca a tu red local, con tiempo y tamaño máximos.
import net from "node:net";
import dns from "node:dns/promises";

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const EMPTY = { socials: 0, links: [] };

function safeUrl(uri) {
  if (typeof uri !== "string" || !uri) return null;
  if (uri.startsWith("ipfs://")) uri = "https://ipfs.io/ipfs/" + uri.slice(7);
  let u;
  try { u = new URL(uri); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return null;
  if (net.isIPv4(h) && PRIVATE.some((r) => r.test(h))) return null;
  if (net.isIPv6(h)) return null; // las fichas de pump.fun no usan IPv6; así se evitan direcciones locales
  return u.toString();
}

// Normaliza un enlace social para detectar si otro token reutiliza el mismo (tokens copiados)
function norm(link) {
  try {
    const u = new URL(link);
    return (u.hostname.replace(/^www\./, "").replace("twitter.com", "x.com") + u.pathname).toLowerCase().replace(/\/+$/, "");
  } catch { return null; }
}

export async function fetchMeta(uri) {
  const url = safeUrl(uri);
  if (!url) return EMPTY;
  try {
    // El nombre debe apuntar a una IP pública (evita nombres que redirigen a tu red local)
    const { address, family } = await dns.lookup(new URL(url).hostname, { family: 4 });
    if (family !== 4 || PRIVATE.some((r) => r.test(address))) return EMPTY;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { Accept: "application/json" } });
    if (!r.ok) return EMPTY;
    const text = (await r.text()).slice(0, 50000);
    const j = JSON.parse(text);
    const ext = j.extensions || {};
    const fields = [j.twitter || ext.twitter, j.telegram || ext.telegram, j.website || ext.website];
    const links = fields.filter((x) => typeof x === "string" && /^https?:\/\//i.test(x)).map(norm).filter(Boolean);
    return { socials: fields.filter((x) => typeof x === "string" && x.trim().length > 3).length, links };
  } catch { return EMPTY; }
}
