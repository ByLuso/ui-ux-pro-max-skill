import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA = path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnv(path.join(ROOT, ".env")), ...process.env };
const num = (k, d) => (env[k] !== undefined && env[k] !== "" ? Number(env[k]) : d);
const str = (k, d = "") => (env[k] !== undefined ? String(env[k]) : d);

export const cfg = {
  mode: str("MODE", "paper").toLowerCase() === "live" ? "live" : "paper",
  apiKey: str("PUMPPORTAL_API_KEY"),
  rpcUrl: str("RPC_URL"),
  privateKey: str("PRIVATE_KEY"),
  tp: num("TP_PCT", 0.6),
  sl: num("SL_PCT", 0.3),
  horizonMin: num("HORIZON_MIN", 60),
  obsSeconds: num("OBS_SECONDS", 45),
  trackSample: num("TRACK_SAMPLE", 0.5),
  maxTracked: num("MAX_TRACKED", 400),
  evMin: num("EV_MIN", 0.05),
  // Momentos extra de decisión, en segundos desde el lanzamiento (además del de observación)
  checkpoints: str("CHECKPOINTS", "180,300,600").split(",").map(Number).filter((x) => x > 0),
  // auto = usa la estrategia de salida con mejor resultado en papel; fixed o ladder la fuerzan
  exitStrategy: ["fixed", "ladder"].includes(str("EXIT_STRATEGY")) ? str("EXIT_STRATEGY") : "auto",
  ladder: {
    tp1: num("LADDER_TP1", 0.25), tp1Frac: num("LADDER_TP1_FRAC", 0.5),
    tp2: num("LADDER_TP2", 0.6), tp2Frac: num("LADDER_TP2_FRAC", 0.25),
    trail: num("LADDER_TRAIL", 0.25), stop0: num("LADDER_STOP", 0.2),
  },
  guard: {
    maxEarly: num("GUARD_MAX_EARLY_SHARE", 0.6),
    maxTop10: num("GUARD_MAX_TOP10", 0.5),
    maxDev: num("GUARD_MAX_DEV_SHARE", 0.07),
    maxCreatorPrior: num("GUARD_MAX_CREATOR_PRIOR", 5),
  },
  // Cartera de prueba (dinero ficticio, en euros)
  paperStartEur: num("PAPER_START_EUR", 50),
  paperTradeEur: num("PAPER_TRADE_EUR", 5),
  paperMaxOpen: num("PAPER_MAX_OPEN", 5),
  maxSolPerTrade: num("MAX_SOL_PER_TRADE", 0.03),
  maxOpen: num("MAX_OPEN", 2),
  dailyLossLimit: num("DAILY_LOSS_LIMIT_SOL", 0.1),
  reserveSol: num("WALLET_RESERVE_SOL", 0.02),
  slippagePct: num("SLIPPAGE_PCT", 15),
  priorityFee: num("PRIORITY_FEE_SOL", 0.0005),
  minLabelsLive: num("MIN_LABELS_LIVE", 1000),
  minGainLive: num("MIN_INFO_GAIN_LIVE", 0.02),
  minPaperTradesLive: num("MIN_PAPER_TRADES_LIVE", 30),
  pumpFee: num("PUMP_FEE", 0.0125),
  portalFee: 0.005,
  port: num("PORT", 8787),
};

// Seguridad básica: no aceptar tamaños absurdos por error de tipeo
if (!(cfg.maxSolPerTrade > 0 && cfg.maxSolPerTrade <= 1)) throw new Error("MAX_SOL_PER_TRADE debe estar entre 0 y 1 SOL");
if (!(cfg.dailyLossLimit > 0)) throw new Error("DAILY_LOSS_LIMIT_SOL debe ser mayor que 0");
