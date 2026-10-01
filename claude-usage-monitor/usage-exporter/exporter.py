"""usage-exporter: Anthropic Admin API -> Prometheus (:9101) + formulario manual claude.ai.

Endpoints verificados en la documentación oficial (platform.claude.com / docs.claude.com):
  GET /v1/organizations/usage_report/messages
      starting_at, ending_at, bucket_width=1d, group_by[]=model|api_key_id|workspace_id, limit, page
      results[]: uncached_input_tokens, output_tokens, cache_read_input_tokens,
                 cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens},
                 model, api_key_id, workspace_id
  GET /v1/organizations/cost_report
      starting_at, ending_at, bucket_width=1d, group_by[]=workspace_id|description, limit (<=31), page
      results[]: amount (decimal string in CENTS), currency, workspace_id, description,
                 model, cost_type, token_type
  Nota: cost_report NO admite agrupar por api_key_id; por api_key solo se exponen tokens.

Si ANTHROPIC_ADMIN_KEY no está definido, el exporter sigue sirviendo /metrics
(anthropic_admin_api_enabled 0) y el formulario manual, sin consultar nada.
"""

import datetime as dt
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API_BASE = os.environ.get("ANTHROPIC_API_BASE", "https://api.anthropic.com")
ADMIN_KEY = os.environ.get("ANTHROPIC_ADMIN_KEY", "").strip()
POLL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "300"))
LOOKBACK_DAYS = min(int(os.environ.get("LOOKBACK_DAYS", "31")), 31)
PORT = int(os.environ.get("EXPORTER_PORT", "9101"))
PUSHGATEWAY_URL = os.environ.get("PUSHGATEWAY_URL", "http://pushgateway:9091").rstrip("/")
PLAN_MONTHLY_USD = float(os.environ.get("CLAUDE_AI_PLAN_MONTHLY_USD", "0") or 0)
FORM_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "form.html")

TOKEN_FIELDS = {
    "input": lambda r: r.get("uncached_input_tokens", 0),
    "output": lambda r: r.get("output_tokens", 0),
    "cache_read": lambda r: r.get("cache_read_input_tokens", 0),
    "cache_creation": lambda r: sum((r.get("cache_creation") or {}).values()),
}

_lock = threading.Lock()
_metrics_text = ""
_state = {"last_success": 0.0, "last_error": 0.0, "errors": 0, "duration": 0.0}


def _get(path, params):
    query = urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(
        f"{API_BASE}{path}?{query}",
        headers={
            "x-api-key": ADMIN_KEY,
            "anthropic-version": "2023-06-01",
            "user-agent": "claude-usage-monitor/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def _paginate(path, params):
    page = None
    while True:
        p = dict(params)
        if page:
            p["page"] = page
        body = _get(path, p)
        yield from body.get("data", [])
        if not body.get("has_more"):
            return
        page = body.get("next_page")


def _esc(v):
    return str(v if v is not None else "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def _series(name, labels, value):
    lbl = ",".join(f'{k}="{_esc(v)}"' for k, v in labels.items())
    return f"{name}{{{lbl}}} {value}"


def collect():
    today = dt.datetime.now(dt.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - dt.timedelta(days=LOOKBACK_DAYS - 1)
    common = {"starting_at": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "bucket_width": "1d", "limit": LOOKBACK_DAYS}
    today_s = today.strftime("%Y-%m-%d")

    tokens = {}  # (date, model, api_key_id, workspace_id, type) -> n
    for bucket in _paginate(
        "/v1/organizations/usage_report/messages",
        {**common, "group_by[]": ["model", "api_key_id", "workspace_id"]},
    ):
        date = bucket["starting_at"][:10]
        for r in bucket.get("results", []):
            for ttype, fn in TOKEN_FIELDS.items():
                key = (date, r.get("model") or "unknown", r.get("api_key_id") or "console",
                       r.get("workspace_id") or "default", ttype)
                tokens[key] = tokens.get(key, 0) + (fn(r) or 0)

    costs = {}  # (date, workspace_id, model, cost_type, token_type) -> usd
    for bucket in _paginate(
        "/v1/organizations/cost_report",
        {**common, "group_by[]": ["workspace_id", "description"]},
    ):
        date = bucket["starting_at"][:10]
        for r in bucket.get("results", []):
            usd = float(r.get("amount") or 0) / 100.0  # amount viene en centavos
            key = (date, r.get("workspace_id") or "default", r.get("model") or "non_token",
                   r.get("cost_type") or "unknown", r.get("token_type") or "none")
            costs[key] = costs.get(key, 0.0) + usd

    out = [
        "# HELP anthropic_api_tokens Tokens por día UTC (usage_report/messages).",
        "# TYPE anthropic_api_tokens gauge",
    ]
    for (date, model, key_id, ws, ttype), n in sorted(tokens.items()):
        out.append(_series("anthropic_api_tokens", {"date": date, "model": model, "api_key_id": key_id,
                                                    "workspace_id": ws, "type": ttype}, n))
    out += ["# HELP anthropic_api_tokens_today Tokens del día UTC en curso.",
            "# TYPE anthropic_api_tokens_today gauge"]
    agg = {}
    for (date, model, key_id, ws, ttype), n in tokens.items():
        if date == today_s:
            agg[(model, key_id, ws, ttype)] = agg.get((model, key_id, ws, ttype), 0) + n
    for (model, key_id, ws, ttype), n in sorted(agg.items()):
        out.append(_series("anthropic_api_tokens_today", {"model": model, "api_key_id": key_id,
                                                          "workspace_id": ws, "type": ttype}, n))

    out += ["# HELP anthropic_api_cost_usd Coste USD por día UTC (cost_report).",
            "# TYPE anthropic_api_cost_usd gauge"]
    for (date, ws, model, ctype, ttype), usd in sorted(costs.items()):
        out.append(_series("anthropic_api_cost_usd", {"date": date, "workspace_id": ws, "model": model,
                                                      "cost_type": ctype, "token_type": ttype}, round(usd, 6)))
    out += ["# HELP anthropic_api_cost_today_usd Coste USD del día UTC en curso.",
            "# TYPE anthropic_api_cost_today_usd gauge"]
    agg = {}
    for (date, ws, model, *_), usd in costs.items():
        if date == today_s:
            agg[(ws, model)] = agg.get((ws, model), 0.0) + usd
    for (ws, model), usd in sorted(agg.items()):
        out.append(_series("anthropic_api_cost_today_usd", {"workspace_id": ws, "model": model}, round(usd, 6)))
    return out


def poll_loop():
    global _metrics_text
    while True:
        t0 = time.time()
        try:
            lines = collect()
            with _lock:
                _metrics_text = "\n".join(lines) + "\n"
                _state["last_success"] = time.time()
            print(f"[usage-exporter] Admin API OK ({len(lines)} líneas)", flush=True)
        except urllib.error.HTTPError as e:
            _state["errors"] += 1
            _state["last_error"] = time.time()
            print(f"[usage-exporter] HTTP {e.code}: {e.read()[:300]!r}", flush=True)
        except Exception as e:  # noqa: BLE001 - nunca tumbar el exporter
            _state["errors"] += 1
            _state["last_error"] = time.time()
            print(f"[usage-exporter] error: {e}", flush=True)
        _state["duration"] = time.time() - t0
        time.sleep(POLL_SECONDS)


def render_metrics():
    with _lock:
        body = _metrics_text
    meta = [
        "# HELP anthropic_admin_api_enabled 1 si ANTHROPIC_ADMIN_KEY está configurada.",
        "# TYPE anthropic_admin_api_enabled gauge",
        f"anthropic_admin_api_enabled {1 if ADMIN_KEY else 0}",
        "# TYPE anthropic_admin_api_last_success_timestamp_seconds gauge",
        f"anthropic_admin_api_last_success_timestamp_seconds {_state['last_success']}",
        "# TYPE anthropic_admin_api_errors_total counter",
        f"anthropic_admin_api_errors_total {_state['errors']}",
        "# TYPE anthropic_admin_api_scrape_duration_seconds gauge",
        f"anthropic_admin_api_scrape_duration_seconds {_state['duration']:.3f}",
        "# HELP claude_ai_plan_monthly_usd Precio mensual de la suscripción claude.ai (manual, .env).",
        "# TYPE claude_ai_plan_monthly_usd gauge",
        f"claude_ai_plan_monthly_usd {PLAN_MONTHLY_USD}",
    ]
    return "\n".join(meta) + "\n" + body


def push_manual(surface, window, percent):
    """Empuja claude_ai_usage_percent{surface,window} al Pushgateway."""
    surface = {"mobile": "movil", "móvil": "movil"}.get(surface, surface)
    if surface not in ("web", "movil"):
        raise ValueError("surface debe ser web o movil")
    if window not in ("weekly", "session"):
        raise ValueError("window debe ser weekly o session")
    pct = float(percent)
    if not 0 <= pct <= 100:
        raise ValueError("porcentaje fuera de rango 0-100")
    body = (
        "# TYPE claude_ai_usage_percent gauge\n"
        f'claude_ai_usage_percent{{window="{window}"}} {pct}\n'
        "# TYPE claude_ai_usage_last_update_timestamp_seconds gauge\n"
        f'claude_ai_usage_last_update_timestamp_seconds{{window="{window}"}} {time.time():.0f}\n'
    ).encode()
    url = f"{PUSHGATEWAY_URL}/metrics/job/claude_ai_manual/surface/{surface}/window/{window}"
    req = urllib.request.Request(url, data=body, method="PUT")
    urllib.request.urlopen(req, timeout=10).close()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="text/plain; charset=utf-8"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/metrics":
            self._send(200, render_metrics(), "text/plain; version=0.0.4; charset=utf-8")
        elif path in ("/", "/form"):
            with open(FORM_PATH, encoding="utf-8") as f:
                self._send(200, f.read(), "text/html; charset=utf-8")
        elif path == "/healthz":
            self._send(200, "ok")
        else:
            self._send(404, "not found")

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/manual":
            return self._send(404, "not found")
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode()
        if "json" in (self.headers.get("Content-Type") or ""):
            form = json.loads(raw or "{}")
        else:
            form = {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}
        try:
            surface = form.get("surface", "web")
            push_manual(surface, "weekly", form["weekly"])
            if str(form.get("session", "")).strip():
                push_manual(surface, "session", form["session"])
        except (KeyError, ValueError) as e:
            return self._send(400, json.dumps({"ok": False, "error": str(e)}), "application/json")
        except Exception as e:  # noqa: BLE001
            return self._send(502, json.dumps({"ok": False, "error": f"pushgateway: {e}"}), "application/json")
        self._send(200, json.dumps({"ok": True}), "application/json")

    def log_message(self, fmt, *args):
        if "/metrics" not in (args[0] if args else ""):
            print(f"[usage-exporter] {self.address_string()} {fmt % args}", flush=True)


def main():
    if ADMIN_KEY:
        threading.Thread(target=poll_loop, daemon=True).start()
        print(f"[usage-exporter] Admin API activada, sondeo cada {POLL_SECONDS}s", flush=True)
    else:
        print("[usage-exporter] ANTHROPIC_ADMIN_KEY vacío: Admin API desactivada (solo formulario manual)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
