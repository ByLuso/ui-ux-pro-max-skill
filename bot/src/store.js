import fs from "node:fs";
import path from "node:path";
import { DATA } from "./config.js";

// Reloj sustituible para las pruebas
export let now = () => Date.now();
export function setNow(fn) { now = fn; }

export function loadJSON(name, fallback) {
  const f = path.join(DATA, name);
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; }
}

export function saveJSON(name, obj) {
  const f = path.join(DATA, name), tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, f); // escritura atómica: no deja archivos a medias si se corta la luz
}

export function appendLine(name, obj) {
  fs.appendFileSync(path.join(DATA, name), JSON.stringify(obj) + "\n");
}

export function readLines(name, limit = Infinity) {
  const f = path.join(DATA, name);
  if (!fs.existsSync(f)) return [];
  const lines = fs.readFileSync(f, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
