// Crea una wallet NUEVA solo para el bot y guarda su clave privada en .env (nunca la muestra en pantalla).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : fs.readFileSync(envFile.replace(/\.env$/, ".env.example"), "utf8");

const current = env.match(/^PRIVATE_KEY=(.+)$/m);
if (current && current[1].trim()) {
  const kp = Keypair.fromSecretKey(bs58.decode(current[1].trim()));
  console.log("\nYa hay una wallet en .env. No la reemplazo para no perder fondos.");
  console.log("Dirección del bot:", kp.publicKey.toBase58(), "\n");
  process.exit(0);
}

const kp = Keypair.generate();
const line = "PRIVATE_KEY=" + bs58.encode(kp.secretKey);
env = /^PRIVATE_KEY=.*$/m.test(env) ? env.replace(/^PRIVATE_KEY=.*$/m, line) : env + "\n" + line + "\n";
fs.writeFileSync(envFile, env, { mode: 0o600 });

console.log("\nWallet del bot creada y guardada en .env");
console.log("Dirección (para enviarle SOL):", kp.publicKey.toBase58());
console.log("\nImportante:");
console.log(" - Envía solo lo que estés dispuesto a perder (por ejemplo 0.1–0.5 SOL).");
console.log(" - Haz una copia de seguridad del archivo .env en un lugar privado. Si lo pierdes, pierdes los fondos.");
console.log(" - Nunca compartas el archivo .env con nadie.\n");
