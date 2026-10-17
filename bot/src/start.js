// Punto de entrada: arranca el radar de Binance (por defecto) o el bot antiguo de pump.fun (BOT=pumpfun en .env)
import { cfg } from "./config.js";
await import(cfg.bot === "pumpfun" ? "./main.js" : "./spot/main.js");
