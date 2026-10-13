// Ejecución real. La transacción la arma PumpPortal (API "local"), pero se FIRMA aquí, en tu computadora:
// la clave privada nunca sale de tu máquina.
import { cfg } from "./config.js";

let web3, bs58, conn, kp;

export async function initLive() {
  if (!cfg.privateKey || !cfg.rpcUrl) throw new Error("Faltan PRIVATE_KEY o RPC_URL en .env");
  web3 = await import("@solana/web3.js");
  bs58 = (await import("bs58")).default;
  conn = new web3.Connection(cfg.rpcUrl, "confirmed");
  kp = web3.Keypair.fromSecretKey(bs58.decode(cfg.privateKey));
  return kp.publicKey.toBase58();
}

export async function publicAddress() {
  if (!cfg.privateKey) return null;
  if (!kp) {
    web3 = web3 || (await import("@solana/web3.js"));
    bs58 = bs58 || (await import("bs58")).default;
    kp = web3.Keypair.fromSecretKey(bs58.decode(cfg.privateKey));
  }
  return kp.publicKey.toBase58();
}

export async function balance() {
  if (!cfg.rpcUrl || !cfg.privateKey) return null;
  if (!conn) { await publicAddress(); conn = new web3.Connection(cfg.rpcUrl, "confirmed"); }
  return (await conn.getBalance(kp.publicKey)) / 1e9;
}

async function waitConfirmed(sig, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const s = value[0];
    if (s && s.err) throw new Error("La transacción falló en la cadena: " + JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Sin confirmación en 60 s");
}

// Cambio de SOL en nuestra wallet causado por una transacción (incluye comisiones y propinas)
async function solDelta(sig) {
  for (let i = 0; i < 6; i++) {
    const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (tx && tx.meta) {
      const keys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
      const idx = keys.findIndex((k) => k.toBase58() === kp.publicKey.toBase58());
      if (idx >= 0) return (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 1e9;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function send(action, mint, amount) {
  const res = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: kp.publicKey.toBase58(),
      action, mint, amount,
      denominatedInSol: action === "buy" ? "true" : "false",
      slippage: cfg.slippagePct,
      priorityFee: cfg.priorityFee,
      pool: "auto",
    }),
  });
  if (res.status !== 200) throw new Error(`PumpPortal respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const tx = web3.VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
  tx.sign([kp]);
  const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
  await waitConfirmed(sig);
  return { sig, delta: await solDelta(sig) };
}

export const buy = (mint, sol) => send("buy", mint, sol);
export const sellAll = (mint) => send("sell", mint, "100%");
export const sellPct = (mint, pct) => send("sell", mint, Math.min(100, Math.max(1, Math.round(pct))) + "%");
