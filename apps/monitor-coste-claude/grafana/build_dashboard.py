#!/usr/bin/env python3
"""Genera grafana/dashboards/claude-code.json (dashboard "Claude Code").

    python3 grafana/build_dashboard.py

Nombres de métricas verificados contra la documentación oficial de Claude Code
(Monitoring) y contra lo que realmente expone el exporter Prometheus del collector:

  claude_code.cost.usage             -> claude_code_cost_usage_USD_total        {model, query_source, session_id}
  claude_code.token.usage            -> claude_code_token_usage_tokens_total    {type=input|output|cacheRead|cacheCreation, model}
  claude_code.session.count          -> claude_code_session_count_total
  claude_code.lines_of_code.count    -> claude_code_lines_of_code_count_total   {type=added|removed}
  claude_code.code_edit_tool.decision-> claude_code_code_edit_tool_decision_total {decision, source, tool_name}
  claude_code.active_time.total      -> claude_code_active_time_seconds_total   {type=user|cli}
  Eventos (Loki, service_name="claude-code"): event_name = user_prompt | tool_result | tool_decision | api_request ...
"""

import json
import os

PROM = {"type": "prometheus", "uid": "${datasource}"}
LOKI = {"type": "loki", "uid": "${loki}"}

COST = "claude_code_cost_usage_USD_total"
TOK = "claude_code_token_usage_tokens_total"
LOC = "claude_code_lines_of_code_count_total"
DEC = "claude_code_code_edit_tool_decision_total"
ACT = "claude_code_active_time_seconds_total"

F = 'model=~"$model",session_id=~"$session"'   # filtros de variables
FS = 'session_id=~"$session"'                  # métricas sin label model

# Grafana dark palette
GREEN, YELLOW, RED, BLUE, PURPLE, ORANGE = "#73BF69", "#FADE2A", "#F2495C", "#5794F2", "#B877D9", "#FF9830"
TEXT = "#ccccdc"


def sel(metric, *matchers):
    return f'{metric}{{{",".join(m for m in matchers if m)}}}'


def delta(s, w):
    """Incremento exacto por serie en la ventana w.

    increase() pierde la primera muestra de cada serie nueva (cada sesión de Claude
    Code crea series nuevas), así que restamos el valor al inicio de la ventana
    (o 0 si la serie nació dentro de la ventana)."""
    return f"(max_over_time({s}[{w}]) - ({s} offset {w} or max_over_time({s}[{w}]) * 0))"


def total(s, w):
    return f"(sum({delta(s, w)}) or vector(0))"


def sessions(w):
    return f"(count(sum by (session_id) ({delta(sel(COST, F), w)}) > 0) or vector(0))"


LOKI_BASE = '{service_name="claude-code"} | event_name="%s" | session_id=~"$session"'

_id = [0]


def panel(ptype, title, x, y, w, h, targets, desc="", ds=PROM, **kw):
    _id[0] += 1
    p = {
        "id": _id[0],
        "type": ptype,
        "title": title,
        "description": desc,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "datasource": ds,
        "targets": targets,
    }
    p.update(kw)
    return p


def prom(expr, legend="__auto", ref="A", instant=False, interval=None):
    t = {"datasource": PROM, "refId": ref, "expr": expr, "legendFormat": legend,
         "range": not instant, "instant": instant, "editorMode": "code"}
    if interval:
        t["interval"] = interval
    return t


def loki(expr, legend="__auto", ref="A", instant=False, step=None):
    t = {"datasource": LOKI, "refId": ref, "expr": expr, "legendFormat": legend,
         "queryType": "instant" if instant else "range", "editorMode": "code"}
    if step:
        t["step"] = step
    return t


def thresholds(*steps):
    out = []
    for i, s in enumerate(steps):
        color, value = s if isinstance(s, tuple) else (s, None)
        out.append({"color": color, "value": None if i == 0 else value})
    return {"mode": "absolute", "steps": out}


def fixed(color):
    return {"mode": "fixed", "fixedColor": color}


def stat(title, x, y, w, h, targets, desc, unit="none", decimals=None, color=None, th=None,
         color_mode="value", graph="area", pct=False, value_size=38, text_mode="value",
         orientation="auto", title_size=None, overrides=None, justify="center", min_=None, max_=None):
    defaults = {"unit": unit, "color": color or {"mode": "thresholds"},
                "thresholds": th or thresholds(GREEN), "mappings": []}
    if decimals is not None:
        defaults["decimals"] = decimals
    if min_ is not None:
        defaults["min"] = min_
    if max_ is not None:
        defaults["max"] = max_
    text = {"valueSize": value_size}
    if title_size:
        text["titleSize"] = title_size
    return panel("stat", title, x, y, w, h, targets, desc,
                 fieldConfig={"defaults": defaults, "overrides": overrides or []},
                 options={
                     "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                     "orientation": orientation,
                     "textMode": text_mode,
                     "wideLayout": True,
                     "colorMode": color_mode,
                     "graphMode": graph,
                     "justifyMode": justify,
                     "showPercentChange": pct,
                     "percentChangeColorMode": "standard",
                     "text": text,
                 })


def by_name(name, *props):
    return {"matcher": {"id": "byName", "options": name},
            "properties": [{"id": k, "value": v} for k, v in props]}


def by_frame(ref, *props):
    return {"matcher": {"id": "byFrameRefID", "options": ref},
            "properties": [{"id": k, "value": v} for k, v in props]}


def pie(title, x, y, w, h, targets, desc, pie_type="pie", unit="short", overrides=None,
        labels=("name", "percent"), legend_values=(), ds=PROM, color=None, rows=False, legend="bottom"):
    # rows=True: una porción por fila (las consultas instant de Loki llegan como tabla)
    return panel("piechart", title, x, y, w, h, targets, desc, ds=ds,
                 fieldConfig={"defaults": {"unit": unit, "color": color or {"mode": "palette-classic"},
                                           "custom": {"hideFrom": {"legend": False, "tooltip": False, "viz": False}},
                                           "mappings": []},
                              "overrides": overrides or []},
                 options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "/^Value/" if rows else "",
                                            "values": rows},
                          "pieType": pie_type,
                          "displayLabels": list(labels),
                          "legend": {"showLegend": True, "displayMode": "list", "placement": legend,
                                     "values": list(legend_values)},
                          "tooltip": {"mode": "single", "sort": "none"}})


def timeseries(title, x, y, w, h, targets, desc, unit="short", color=None, draw="line", fill=0,
               gradient="none", points="never", point_size=4, overrides=None, min_=None, decimals=None,
               legend=True, stack="none", line_width=1, ds=PROM, interval=None, bar_width=None):
    custom = {"drawStyle": draw, "lineInterpolation": "smooth", "lineWidth": line_width,
              "fillOpacity": fill, "gradientMode": gradient, "showPoints": points, "pointSize": point_size,
              "spanNulls": True, "axisBorderShow": False, "axisPlacement": "auto", "barAlignment": 0,
              "stacking": {"mode": stack, "group": "A"}, "thresholdsStyle": {"mode": "off"},
              "axisSoftMin": 0, "scaleDistribution": {"type": "linear"},
              "hideFrom": {"legend": False, "tooltip": False, "viz": False}}
    if bar_width:
        custom["barWidthFactor"] = bar_width
    defaults = {"unit": unit, "color": color or {"mode": "palette-classic"}, "custom": custom,
                "thresholds": thresholds(GREEN), "mappings": []}
    if min_ is not None:
        defaults["min"] = min_
    if decimals is not None:
        defaults["decimals"] = decimals
    p = panel("timeseries", title, x, y, w, h, targets, desc, ds=ds,
              fieldConfig={"defaults": defaults, "overrides": overrides or []},
              options={"legend": {"showLegend": legend, "displayMode": "list", "placement": "bottom", "calcs": []},
                       "tooltip": {"mode": "multi", "sort": "desc"}})
    if interval:
        p["interval"] = interval
    return p


def bargauge(title, x, y, w, h, targets, desc, mode="basic", name_placement="left", overrides=None,
             unit="none", th=None, color=None, value_mode="color", min_=0, max_=None, size_mode="auto",
             min_vizheight=10, max_vizheight=300, text=None):
    defaults = {"unit": unit, "min": min_, "color": color or {"mode": "thresholds"},
                "thresholds": th or thresholds(GREEN), "mappings": []}
    if max_ is not None:
        defaults["max"] = max_
    return panel("bargauge", title, x, y, w, h, targets, desc,
                 fieldConfig={"defaults": defaults, "overrides": overrides or []},
                 options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                          "orientation": "horizontal", "displayMode": mode, "valueMode": value_mode,
                          "namePlacement": name_placement, "showUnfilled": True, "sizing": size_mode,
                          "minVizWidth": 8, "minVizHeight": min_vizheight, "maxVizHeight": max_vizheight,
                          "text": text or {},
                          "legend": {"showLegend": False}})


def build():
    P = []
    cost, tok = sel(COST, F), sel(TOK, F)

    # ───────────── FILA 1 (y=0, h=3) ─────────────
    P.append(stat("Real-Time Cost Burn Rate", 0, 0, 5, 3,
                  [prom(f"{total(cost, '15m')} * 4", "Burn rate")],
                  "Gasto de Claude Code en los últimos 15 min extrapolado a 1 hora ($/hr). Automático (OTLP).",
                  unit="prefix:$/hr ", decimals=4, color=fixed(YELLOW), color_mode="background", pct=True))
    P.append(stat("Total Cost Today", 5, 0, 4, 3,
                  [prom(total(cost, "24h"), "Cost")],
                  "Coste estimado de Claude Code en las últimas 24 h (claude_code.cost.usage). Verde < $5, amarillo $5-20, rojo > $20.",
                  unit="currencyUSD", decimals=2, th=thresholds(GREEN, (YELLOW, 5), (RED, 20)), pct=True))
    P.append(stat("Subagent Cost (24h)", 9, 0, 5, 3,
                  [prom(total(sel(COST, F, 'query_source="subagent"'), "24h"), "Subagents")],
                  "Coste de peticiones emitidas por subagentes (query_source=\"subagent\").",
                  unit="currencyUSD", decimals=2, color=fixed(GREEN)))
    P.append(stat("Main Session Cost (24h)", 14, 0, 4, 3,
                  [prom(total(sel(COST, F, 'query_source="main"'), "24h"), "Main")],
                  "Coste del hilo principal de la sesión (query_source=\"main\").",
                  unit="currencyUSD", decimals=4, color=fixed(RED)))
    P.append(stat("Code Edit Acceptance Rate %", 18, 0, 6, 3,
                  [prom("100 * " + total(sel(DEC, FS, 'decision="accept"'), "24h") + " / clamp_min(" + total(sel(DEC, FS), "24h") + ", 1)",
                        "Acceptance")],
                  "Edit/Write/NotebookEdit aceptados sobre el total de decisiones (claude_code.code_edit_tool.decision), 24 h.",
                  unit="none", decimals=1, color=fixed("green"), color_mode="background", min_=0, max_=100))

    # ───────────── FILA 2 (y=3, h=3) ─────────────
    hourly = total(cost, "1h")
    P.append(stat("Cost Forecast", 0, 3, 5, 3,
                  [prom(f"{hourly} * 24", "Daily Projection", "A"),
                   prom(f"{hourly} * 24 * 30", "Monthly Projection", "B")],
                  "Proyección lineal del burn rate de la última hora: ×24 (día) y ×720 (mes).",
                  unit="currencyUSD", decimals=2, color=fixed("text"), graph="none",
                  text_mode="value_and_name", orientation="vertical", value_size=26, title_size=11))
    P.append(stat("Average Cost / Session", 5, 3, 4, 3,
                  [prom(f"{total(cost, '24h')} / clamp_min({sessions('24h')}, 1)", "Avg cost")],
                  "Coste medio por sesión con actividad en las últimas 24 h.",
                  unit="currencyUSD", decimals=4, color=fixed(YELLOW)))
    P.append(stat("Cost per 1K Tokens", 9, 3, 5, 3,
                  [prom(f"1000 * {total(cost, '24h')} / clamp_min({total(tok, '24h')}, 1)", "$/1K")],
                  "Coste por cada 1.000 tokens (incluye cache read/creation), 24 h.",
                  unit="currencyUSD", decimals=4, color=fixed("text"), pct=True))
    P.append(stat("Active Time (24h)", 14, 3, 4, 3,
                  [prom(f"{total(sel(ACT, FS), '24h')} / 3600", "Active")],
                  "Tiempo activo (usuario + CLI) de claude_code.active_time.total en las últimas 24 h.",
                  unit="suffix: hours", decimals=2, color=fixed(GREEN)))
    P.append(pie("Token Distribution by Model (24h)", 18, 3, 6, 6,
                 [prom(f"sum by (model) ({delta(tok, '24h')}) > 0", "{{model}}", instant=True)],
                 "Reparto de tokens (input+output+cache) por modelo en 24 h.", unit="short",
                 color={"mode": "shades", "fixedColor": GREEN}))

    # ───────────── FILA 3 (y=6, h=3) ─────────────
    P.append(stat("Active Sessions (24h)", 0, 6, 4, 3,
                  [prom(sessions("24h"), "Sessions")],
                  "Sesiones de Claude Code (session.id) con coste > 0 en las últimas 24 h.",
                  unit="none", decimals=0, color=fixed(BLUE), graph="none", value_size=44))
    sess = f"clamp_min({sessions('24h')}, 1)"
    P.append(bargauge("Average Session Metrics", 4, 6, 10, 3,
                      [prom(f"{total(cost, '24h')} / {sess}", "Avg Cost", "A", instant=True),
                       prom(f"{total(tok, '24h')} / {sess}", "Avg Tokens", "B", instant=True),
                       prom(f"{total(sel(ACT, FS), '24h')} / {sess}", "Avg Duration", "C", instant=True)],
                      "Media por sesión (24 h): coste, tokens y tiempo activo.",
                      mode="basic", name_placement="left", value_mode="color", min_vizheight=12, max_vizheight=12,
                      size_mode="manual", text={"titleSize": 11, "valueSize": 12},
                      overrides=[
                          by_frame("A", ("color", fixed(GREEN)), ("unit", "currencyUSD"), ("decimals", 4), ("max", 5)),
                          by_frame("B", ("color", fixed(BLUE)), ("unit", "short"), ("max", 2000000)),
                          by_frame("C", ("color", fixed(PURPLE)), ("unit", "s"), ("max", 7200)),
                      ]))
    P.append(bargauge("Lines of Code Modified", 14, 6, 4, 3,
                      [prom(total(sel(LOC, F, 'type="added"'), "24h"), "Added Today", "A", instant=True),
                       prom(total(sel(LOC, F, 'type="removed"'), "24h"), "Deleted Today", "B", instant=True)],
                      "Líneas añadidas / eliminadas por Claude Code (claude_code.lines_of_code.count), 24 h.",
                      mode="gradient", name_placement="top", unit="short", max_=3000,
                      th=thresholds(RED, (YELLOW, 1000), (GREEN, 2000)), min_vizheight=6, max_vizheight=8,
                      text={"titleSize": 11, "valueSize": 11},
                      overrides=[by_frame("B", ("color", fixed(RED)))]))

    # ───────────── FILA 4 (y=9, h=4) ─────────────
    cache = ("100 * " + total(sel(TOK, F, 'type="cacheRead"'), "24h") + " / clamp_min("
             + total(sel(TOK, F, 'type=~"cacheRead|cacheCreation|input"'), "24h") + ", 1)")
    P.append(panel("gauge", "Cache Hit Rate %", 0, 9, 4, 4,
                   [prom(cache, "Cache hit")],
                   "Tokens de entrada servidos desde caché: cacheRead / (input + cacheRead + cacheCreation), 24 h.",
                   fieldConfig={"defaults": {"unit": "percent", "decimals": 1, "min": 0, "max": 100,
                                             "color": {"mode": "continuous-RdYlGr"},
                                             "thresholds": thresholds(RED, (ORANGE, 50), (GREEN, 80)),
                                             "mappings": []}, "overrides": []},
                   options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                            "orientation": "auto", "showThresholdLabels": False, "showThresholdMarkers": True,
                            "sizing": "auto", "minVizWidth": 75, "minVizHeight": 75}))
    P.append(stat("Total Tokens Today", 4, 9, 5, 4,
                  [prom(total(tok, "24h"), "Tokens")],
                  "Tokens totales (input + output + cache read + cache creation) en las últimas 24 h.",
                  unit="short", decimals=0, color=fixed(BLUE)))
    P.append(stat("Model Token Efficiency (tokens/s)", 9, 9, 9, 4,
                  [prom(total(sel(TOK, F, 'type="output"'), "1h") + " / clamp_min(" + total(sel(ACT, FS, 'type="cli"'), "1h") + ", 1)",
                        "tokens/s")],
                  "Tokens de salida generados por segundo de procesamiento del CLI (active_time type=cli), última hora.",
                  unit="none", decimals=2, color=fixed(RED), justify="auto"))
    tool_colors = {"mcp_tool": YELLOW, "Edit": BLUE, "Read": "#1F60C4", "Write": "#37872D", "Agent": GREEN,
                   "Bash": "#FFB357", "Glob": ORANGE, "PowerShell": "#FA6400", "Skill": "#8F3BB8",
                   "ToolSearch": "#CA95E5", "Grep": "#8AB8FF", "WebFetch": "#96D98D", "WebSearch": "#FFEE52",
                   "TodoWrite": "#C0D8FF", "NotebookEdit": "#F4D598"}
    tool_expr = ('sum by (tool) (count_over_time(' + (LOKI_BASE % "tool_result")
                 + ' | label_format tool=`{{ if hasPrefix "mcp__" .tool_name }}mcp_tool{{ else }}{{ .tool_name }}{{ end }}` [24h]))')
    P.append(pie("Tool Usage Breakdown", 18, 9, 6, 8,
                 [loki(tool_expr, "{{tool}}", instant=True)],
                 "Ejecuciones de herramientas (evento claude_code.tool_result, Loki) en 24 h. Las herramientas MCP se agrupan como mcp_tool.",
                 pie_type="donut", ds=LOKI, rows=True,
                 overrides=[by_name(n, ("color", fixed(c))) for n, c in tool_colors.items()]))

    # ───────────── FILA 5 (y=13, h=4) ─────────────
    P.append(timeseries("Peak Cost Hours", 0, 13, 9, 4,
                        [prom(f"sum(max_over_time({cost}[1h] offset -1h) - ({cost} or max_over_time({cost}[1h] offset -1h) * 0))",
                              "Cost/hr", interval="1h")],
                        "Coste de Claude Code por hora (barra = hora que empieza en esa marca, incluida la hora en curso), últimas 24 h.",
                        unit="currencyUSD", decimals=4, color=fixed(GREEN), draw="bars", fill=85,
                        min_=0, interval="1h", bar_width=0.6))
    P[-1]["timeFrom"] = "24h"
    P[-1]["hideTimeOverride"] = True
    P.append(stat("Weekly Total Token Usage", 9, 13, 9, 4,
                  [prom(total(tok, "7d"), "Tokens 7d")],
                  "Tokens totales de Claude Code en los últimos 7 días.",
                  unit="short", decimals=0, color=fixed("text")))

    # ───────────── FILA 6 (y=17, h=5) ─────────────
    c = f"sum(rate({cost}[5m]))"
    avg = f"avg_over_time({c}[1h:1m])"
    dev = f"100 * abs({c} - {avg}) / clamp_min({avg}, 1e-9)"
    P.append(timeseries("Cost Anomaly Detection", 0, 17, 9, 5,
                        [prom(f"({dev}) or vector(0)", "Deviation from 1h mean %", "A"),
                         prom(f"({dev}) and on() (abs({c} - {avg}) > 2 * stddev_over_time({c}[1h:1m]))",
                              "Anomaly (>2σ)", "B")],
                        "Desviación del coste/min frente a su media móvil de 1 h. Punto rojo: desviación > 2σ.",
                        unit="percent", color=fixed(GREEN), points="always", point_size=5, min_=0, decimals=1,
                        overrides=[by_frame("B", ("color", fixed(RED)), ("custom.lineWidth", 0),
                                            ("custom.showPoints", "always"), ("custom.pointSize", 7))]))
    P.append(timeseries("Prompts Per Hour", 9, 17, 9, 5,
                        [loki(f'sum(count_over_time({LOKI_BASE % "user_prompt"} [1h]))', "Prompts/hr")],
                        "Prompts enviados en la última hora (evento claude_code.user_prompt, Loki).",
                        unit="short", color=fixed(GREEN), fill=35, gradient="opacity", ds=LOKI, min_=0,
                        line_width=2))
    P.append(pie("Tool Decision Sources (24h)", 18, 17, 6, 5,
                 [loki(f'sum by (source) (count_over_time({LOKI_BASE % "tool_decision"} [24h]))', "{{source}}",
                       instant=True)],
                 "Origen de las decisiones de permisos (config, hook, user_permanent, user_temporary, user_abort, user_reject).",
                 pie_type="donut", ds=LOKI, labels=(), unit="short", rows=True,
                 overrides=[by_name("config", ("color", fixed(GREEN))),
                            by_name("user_temporary", ("color", fixed(BLUE))),
                            by_name("user_permanent", ("color", fixed(PURPLE))),
                            by_name("hook", ("color", fixed(ORANGE))),
                            by_name("user_reject", ("color", fixed(RED))),
                            by_name("user_abort", ("color", fixed(YELLOW)))]))

    # ───────────── FILA 7 (y=22): superficies, claude.ai manual y API ─────────────
    cc24 = total(cost, "24h")
    api_today = "(sum(anthropic_api_cost_today_usd) or vector(0))"
    cai_day = "(sum(claude_ai_plan_monthly_usd) / 30 or vector(0))"
    surf_targets = lambda inst: [prom(cc24, "Claude Code", "A", instant=inst),
                                 prom(api_today, "API / Console", "B", instant=inst),
                                 prom(cai_day, "claude.ai (manual)", "C", instant=inst)]
    surf_colors = [by_frame("A", ("color", fixed(YELLOW))), by_frame("B", ("color", fixed(BLUE))),
                   by_frame("C", ("color", fixed(PURPLE)))]
    P.append(stat("Spend by Surface (24h)", 0, 22, 5, 5, surf_targets(False),
                  "Claude Code: coste estimado OTLP (24 h). API/Console: cost_report de la Admin API (día UTC). "
                  "claude.ai: precio del plan prorrateado por día (manual, CLAUDE_AI_PLAN_MONTHLY_USD).",
                  unit="currencyUSD", decimals=2, color=fixed("text"), text_mode="value_and_name",
                  orientation="horizontal", value_size=22, title_size=11, overrides=surf_colors))
    P.append(pie("Spend Share by Surface", 5, 22, 4, 5, surf_targets(True),
                 "Peso relativo del gasto por superficie (claude.ai es prorrateo manual).",
                 pie_type="donut", unit="currencyUSD", labels=("percent",), overrides=surf_colors, legend="right"))
    P.append(panel("gauge", "claude.ai Weekly Limit % (manual)", 9, 22, 5, 5,
                   [prom('max by (surface) (claude_ai_usage_percent{window="weekly", surface=~"$surface"})',
                         "{{surface}}", instant=True)],
                   "Manual: % del límite semanal de claude.ai (web / móvil) registrado con log-usage.sh o el formulario. "
                   "Naranja ≥ 70 %, rojo ≥ 90 %.",
                   fieldConfig={"defaults": {"unit": "percent", "decimals": 0, "min": 0, "max": 100,
                                             "color": {"mode": "thresholds"},
                                             "thresholds": thresholds(GREEN, (ORANGE, 70), (RED, 90)),
                                             "mappings": []}, "overrides": []},
                   options={"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                            "orientation": "auto", "showThresholdLabels": False, "showThresholdMarkers": True,
                            "sizing": "auto", "minVizWidth": 75, "minVizHeight": 75}))
    P.append(timeseries("claude.ai Usage % (manual)", 14, 22, 10, 5,
                        [prom('max by (surface, window) (claude_ai_usage_percent{surface=~"$surface"})',
                              "{{surface}} · {{window}}")],
                        "Manual: evolución del % de uso de claude.ai por superficie y ventana (weekly / session).",
                        unit="percent", min_=0, decimals=0, fill=10, gradient="opacity", line_width=2,
                        overrides=[]))
    P[-1]["fieldConfig"]["defaults"]["max"] = 100
    P[-1]["fieldConfig"]["defaults"]["custom"]["lineInterpolation"] = "stepAfter"
    P[-1]["fieldConfig"]["defaults"]["custom"]["thresholdsStyle"] = {"mode": "dashed"}
    P[-1]["fieldConfig"]["defaults"]["thresholds"] = thresholds("transparent", (ORANGE, 70), (RED, 90))

    api_bar = panel("barchart", "API Cost per Day", 0, 27, 9, 6,
                    [{"datasource": PROM, "refId": "A", "expr": "sum by (date, model) (anthropic_api_cost_usd)",
                      "legendFormat": "{{model}}", "instant": True, "range": False, "format": "table",
                      "editorMode": "code"}],
                    "Admin API cost_report (bucket 1d), apilado por modelo. Se actualiza cada 5 min. "
                    "Vacío si ANTHROPIC_ADMIN_KEY no está configurada.",
                    transformations=[{"id": "groupingToMatrix",
                                      "options": {"columnField": "model", "rowField": "date", "valueField": "Value",
                                                  "emptyValue": "zero"}},
                                     {"id": "sortBy", "options": {"sort": [{"field": "date\\model"}]}}],
                    fieldConfig={"defaults": {"unit": "currencyUSD", "decimals": 2, "color": {"mode": "palette-classic"},
                                              "custom": {"fillOpacity": 85, "lineWidth": 0, "gradientMode": "none",
                                                         "axisBorderShow": False, "axisSoftMin": 0,
                                                         "hideFrom": {"legend": False, "tooltip": False, "viz": False}},
                                              "mappings": [], "thresholds": thresholds(GREEN)},
                                 "overrides": []},
                    options={"orientation": "vertical", "stacking": "normal", "showValue": "never",
                             "groupWidth": 0.7, "barWidth": 0.9, "xTickLabelRotation": -45, "xTickLabelSpacing": 0,
                             "xField": "date\\model",
                             "legend": {"showLegend": True, "displayMode": "list", "placement": "bottom", "calcs": []},
                             "tooltip": {"mode": "multi", "sort": "desc"}})
    P.append(api_bar)
    P.append(bargauge("API Cost by Model (31d)", 9, 27, 5, 6,
                      [prom("sum by (model) (anthropic_api_cost_usd)", "{{model}}", instant=True)],
                      "Admin API cost_report: coste acumulado por modelo en la ventana de LOOKBACK_DAYS.",
                      mode="gradient", name_placement="top", unit="currencyUSD", color={"mode": "continuous-GrYlRd"},
                      min_vizheight=10, max_vizheight=16, text={"titleSize": 12, "valueSize": 14}))
    tok_type_names = {"input": ("input", BLUE), "output": ("output", GREEN),
                      "cacheRead": ("cache read", PURPLE), "cacheCreation": ("cache creation", ORANGE)}
    P.append(timeseries("Tokens by Type", 14, 27, 10, 6,
                        [prom(f"sum by (type) ({delta(tok, '$__interval')})", "{{type}}", interval="1m")],
                        "Tokens de Claude Code por tipo (input, output, cache read, cache creation), apilados por intervalo.",
                        unit="short", draw="bars", fill=80, stack="normal", min_=0, interval="1m",
                        overrides=[by_name(k, ("displayName", name), ("color", fixed(col)))
                                   for k, (name, col) in tok_type_names.items()]))
    P.append(panel("table", "API Tokens Today by API Key / Workspace", 0, 33, 24, 6,
                   [{"datasource": PROM, "refId": "A",
                     "expr": "sum by (api_key_id, workspace_id, model, type) (anthropic_api_tokens_today)",
                     "instant": True, "range": False, "format": "table", "editorMode": "code", "legendFormat": ""}],
                   "Admin API usage_report: tokens del día UTC por api_key, workspace, modelo y tipo.",
                   transformations=[{"id": "groupingToMatrix",
                                     "options": {"columnField": "type", "rowField": "api_key_id", "valueField": "Value",
                                                 "emptyValue": "zero"}},
                                    {"id": "organize", "options": {"renameByName": {"api_key_id\\type": "api_key_id"}}}],
                   fieldConfig={"defaults": {"unit": "short", "custom": {"align": "auto", "cellOptions": {"type": "auto"}},
                                             "thresholds": thresholds(GREEN), "mappings": []}, "overrides": []},
                   options={"showHeader": True, "cellHeight": "sm", "footer": {"show": True, "reducer": ["sum"]}}))
    return P


def variables():
    def ds(name, label, dstype):
        return {"name": name, "label": label, "type": "datasource", "query": dstype, "current": {},
                "hide": 0, "refresh": 1, "regex": "", "includeAll": False, "multi": False, "options": []}

    def q(name, label, query, ds_):
        return {"name": name, "label": label, "type": "query", "datasource": ds_,
                "definition": query, "query": {"query": query, "refId": f"{name}Var", "qryType": 1},
                "refresh": 2, "includeAll": True, "multi": True, "allValue": ".*",
                "current": {"selected": True, "text": ["All"], "value": ["$__all"]},
                "hide": 0, "sort": 1, "regex": "", "options": []}

    return {"list": [
        ds("datasource", "Prometheus", "prometheus"),
        ds("loki", "Loki", "loki"),
        q("model", "Modelo", f"label_values({TOK}, model)", PROM),
        q("session", "Sesión", f"label_values({COST}, session_id)", PROM),
        q("surface", "Superficie", "label_values(claude_ai_usage_percent, surface)", PROM),
    ]}


def dashboard():
    return {
        "uid": "claude-code",
        "title": "Claude Code",
        "description": "Gasto de tokens y coste de Claude: Claude Code (OTLP), API/Console (Admin API) y claude.ai (manual).",
        "tags": ["claude", "anthropic", "cost", "otel"],
        "editable": True,
        "graphTooltip": 1,
        "fiscalYearStartMonth": 0,
        "liveNow": False,
        "refresh": "5s",
        "schemaVersion": 41,
        "time": {"from": "now-30m", "to": "now"},
        "timepicker": {"refresh_intervals": ["5s", "10s", "30s", "1m", "5m", "15m", "30m", "1h"]},
        "timezone": "browser",
        "links": [{"title": "Logs", "type": "link", "icon": "external link", "targetBlank": True, "tooltip": "Eventos de Claude Code en Loki",
                   "url": "/explore?schemaVersion=1&panes=%7B%22logs%22%3A%7B%22datasource%22%3A%22loki%22%2C%22queries%22%3A%5B%7B%22refId%22%3A%22A%22%2C%22expr%22%3A%22%7Bservice_name%3D%5C%22claude-code%5C%22%7D%22%2C%22datasource%22%3A%7B%22type%22%3A%22loki%22%2C%22uid%22%3A%22loki%22%7D%7D%5D%2C%22range%22%3A%7B%22from%22%3A%22now-30m%22%2C%22to%22%3A%22now%22%7D%7D%7D&orgId=1",
                   "asDropdown": False, "includeVars": False, "keepTime": False, "tags": []}],
        "annotations": {"list": [{"builtIn": 1, "datasource": {"type": "grafana", "uid": "-- Grafana --"},
                                  "enable": True, "hide": True, "iconColor": "rgba(0, 211, 255, 1)",
                                  "name": "Annotations & Alerts", "type": "dashboard"}]},
        "templating": variables(),
        "panels": build(),
    }


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboards", "claude-code.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(dashboard(), f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"escrito {out} ({len(dashboard()['panels'])} paneles)")
