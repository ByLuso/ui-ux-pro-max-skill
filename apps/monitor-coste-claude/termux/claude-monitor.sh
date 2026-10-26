#!/usr/bin/env bash
# Stack de monitorización de Claude sin Docker: pensado para Termux (Android),
# funciona igual en cualquier Linux arm64/amd64 sin root.
#
#   ./termux/claude-monitor.sh install   # descarga binarios (~400 MB, una vez)
#   ./termux/claude-monitor.sh start     # arranca todo y abre Grafana
#   ./termux/claude-monitor.sh status | stop | logs <servicio> | open
#   ./termux/claude-monitor.sh reset-password [nueva]   # si Grafana no acepta admin/admin
#
# Usa las mismas configuraciones que docker-compose.yml (fuente única) y solo
# reescribe hostnames y rutas: los servicios escuchan en 127.0.0.1.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"             # claude-usage-monitor/
CM_HOME="${CM_HOME:-$HOME/.claude-monitor}"
BIN="$CM_HOME/bin" DATA="$CM_HOME/data" RUN="$CM_HOME/run" LOGS="$CM_HOME/logs" CONF="$CM_HOME/conf"
BIND="${BIND:-127.0.0.1}"   # BIND=0.0.0.0 para abrir Grafana desde otro dispositivo de la red

OTELCOL_V=0.115.1 PROM_V=3.1.0 LOKI_V=3.3.2 PUSHGW_V=1.10.0 GRAFANA_V=12.2.0
SERVICES=(loki otelcol pushgateway prometheus usage-exporter grafana)

case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=amd64 ;;
  *) echo "Arquitectura no soportada: $(uname -m) (se necesita arm64 o amd64)" >&2; exit 1 ;;
esac
IS_TERMUX=0; [[ -n "${TERMUX_VERSION:-}" || -d /data/data/com.termux ]] && IS_TERMUX=1

log() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

fetch() {  # fetch <url> <destino>
  [[ -s "$2" ]] && return 0
  log "Descargando $(basename "$2")"
  curl -fL --retry 3 --progress-bar -o "$2.part" "$1" && mv "$2.part" "$2"
}

cmd_install() {
  if (( IS_TERMUX )); then
    log "Instalando paquetes de Termux (python, curl, unzip, tar)"
    pkg install -y python curl unzip tar >/dev/null
  fi
  for c in python3 curl unzip tar; do command -v "$c" >/dev/null || die "Falta '$c'"; done
  mkdir -p "$BIN" "$CM_HOME/dl"
  local dl="$CM_HOME/dl"
  local gh=https://github.com

  fetch "$gh/open-telemetry/opentelemetry-collector-releases/releases/download/v$OTELCOL_V/otelcol-contrib_${OTELCOL_V}_linux_$ARCH.tar.gz" "$dl/otelcol.tgz"
  tar -xzf "$dl/otelcol.tgz" -C "$BIN" otelcol-contrib

  fetch "$gh/prometheus/prometheus/releases/download/v$PROM_V/prometheus-$PROM_V.linux-$ARCH.tar.gz" "$dl/prometheus.tgz"
  tar -xzf "$dl/prometheus.tgz" -C "$BIN" --strip-components=1 "prometheus-$PROM_V.linux-$ARCH/prometheus"

  fetch "$gh/grafana/loki/releases/download/v$LOKI_V/loki-linux-$ARCH.zip" "$dl/loki.zip"
  unzip -oq "$dl/loki.zip" -d "$BIN" && mv -f "$BIN/loki-linux-$ARCH" "$BIN/loki"

  fetch "$gh/prometheus/pushgateway/releases/download/v$PUSHGW_V/pushgateway-$PUSHGW_V.linux-$ARCH.tar.gz" "$dl/pushgateway.tgz"
  tar -xzf "$dl/pushgateway.tgz" -C "$BIN" --strip-components=1 "pushgateway-$PUSHGW_V.linux-$ARCH/pushgateway"

  fetch "https://dl.grafana.com/oss/release/grafana-$GRAFANA_V.linux-$ARCH.tar.gz" "$dl/grafana.tgz"
  rm -rf "$CM_HOME/grafana" && mkdir -p "$CM_HOME/grafana"
  tar -xzf "$dl/grafana.tgz" -C "$CM_HOME/grafana" --strip-components=1

  chmod +x "$BIN"/*
  rm -rf "$dl"   # libera ~400 MB
  log "Instalado en $CM_HOME ($(du -sh "$CM_HOME" | cut -f1)). Siguiente: $0 start"
}

load_env() {
  if [[ -f "$REPO/.env" ]]; then set -a; . "$REPO/.env"; set +a
  elif [[ -f "$REPO/.env.example" ]]; then set -a; . "$REPO/.env.example"; set +a; fi
}

num() { [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]] && echo "$1" || echo "$2"; }

render_configs() {
  rm -rf "$CONF" && mkdir -p "$CONF" "$DATA"/{prometheus,loki,pushgateway,grafana/plugins}
  # Collector: Loki en localhost, receptores solo en BIND
  sed -e "s#http://loki:3100#http://127.0.0.1:3100#" -e "s#0\.0\.0\.0:#127.0.0.1:#g" \
      -e "s#endpoint: 127.0.0.1:4317#endpoint: $BIND:4317#" -e "s#endpoint: 127.0.0.1:4318#endpoint: $BIND:4318#" \
      "$REPO/otel-collector/otel-collector-config.yaml" > "$CONF/otelcol.yaml"
  sed -e "s#otel-collector:8889#127.0.0.1:8889#" -e "s#usage-exporter:9101#127.0.0.1:9101#" \
      -e "s#pushgateway:9091#127.0.0.1:9091#" "$REPO/prometheus/prometheus.yml" > "$CONF/prometheus.yml"
  sed -e "s# /loki# $DATA/loki#g" "$REPO/loki/loki-config.yaml" > "$CONF/loki.yaml"
  # Grafana: provisioning con URLs locales + umbrales de alerta de .env
  cp -r "$REPO/grafana/provisioning" "$CONF/provisioning"
  sed -i -e "s#http://prometheus:9090#http://127.0.0.1:9090#" -e "s#http://loki:3100#http://127.0.0.1:3100#" \
      "$CONF/provisioning/datasources/datasources.yaml"
  sed -i "s#path: /var/lib/grafana/dashboards#path: $REPO/grafana/dashboards#" "$CONF/provisioning/dashboards/dashboards.yaml"
  sed -i -e "s/__ALERT_BURN_RATE_USD_HR__/$(num "${ALERT_BURN_RATE_USD_HR:-5}" 5)/g" \
         -e "s/__ALERT_DAILY_COST_USD__/$(num "${ALERT_DAILY_COST_USD:-20}" 20)/g" \
         -e "s/__ALERT_CLAUDE_AI_WEEKLY_PCT__/$(num "${ALERT_CLAUDE_AI_WEEKLY_PCT:-90}" 90)/g" \
         "$CONF/provisioning/alerting/alerts.yaml"
  # Plugins que Grafana instalaría desde Internet: desactivados también aquí
  rm -rf "$CONF/provisioning/plugins"
}

is_running() { [[ -f "$RUN/$1.pid" ]] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }

launch() {  # launch <nombre> <cmd...>
  local name=$1; shift
  if is_running "$name"; then log "$name ya está en marcha"; return; fi
  nohup "$@" >"$LOGS/$name.log" 2>&1 &
  echo $! >"$RUN/$name.pid"
  log "$name (pid $!)"
}

wait_http() {  # wait_http <nombre> <url> <segundos>
  local i
  for ((i = 0; i < $3; i++)); do curl -sf --noproxy '*' -o /dev/null "$2" && return 0; sleep 1; done
  die "$1 no responde en $2 — mira: $0 logs $1"
}

cmd_start() {
  [[ -x "$BIN/loki" && -x "$CM_HOME/grafana/bin/grafana" ]] || die "Primero: $0 install"
  load_env
  mkdir -p "$RUN" "$LOGS"
  render_configs
  (( IS_TERMUX )) && command -v termux-wake-lock >/dev/null && termux-wake-lock || true

  launch loki "$BIN/loki" -config.file="$CONF/loki.yaml"
  wait_http loki "http://127.0.0.1:3100/ready" 60
  launch otelcol "$BIN/otelcol-contrib" --config="$CONF/otelcol.yaml"
  launch pushgateway "$BIN/pushgateway" --web.listen-address=127.0.0.1:9091 \
    --persistence.file="$DATA/pushgateway/pushgateway.db" --persistence.interval=1m
  launch prometheus "$BIN/prometheus" --config.file="$CONF/prometheus.yml" \
    --storage.tsdb.path="$DATA/prometheus" --storage.tsdb.retention.time="${PROMETHEUS_RETENTION:-90d}" \
    --web.listen-address=127.0.0.1:9090 --web.enable-lifecycle
  launch usage-exporter env EXPORTER_PORT=9101 PUSHGATEWAY_URL=http://127.0.0.1:9091 \
    python3 "$REPO/usage-exporter/exporter.py"
  launch grafana env \
    GF_PATHS_DATA="$DATA/grafana" GF_PATHS_LOGS="$LOGS" GF_PATHS_PLUGINS="$DATA/grafana/plugins" \
    GF_PATHS_PROVISIONING="$CONF/provisioning" GF_SERVER_HTTP_ADDR="$BIND" GF_SERVER_HTTP_PORT=3000 \
    GF_SECURITY_ADMIN_USER="${GRAFANA_ADMIN_USER:-admin}" GF_SECURITY_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-admin}" \
    GF_USERS_DEFAULT_THEME=dark GF_DASHBOARDS_MIN_REFRESH_INTERVAL=5s \
    GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH="$REPO/grafana/dashboards/claude-code.json" \
    GF_ANALYTICS_REPORTING_ENABLED=false GF_ANALYTICS_CHECK_FOR_UPDATES=false \
    GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false GF_NEWS_NEWS_FEED_ENABLED=false GF_PLUGINS_PREINSTALL_DISABLED=true \
    "$CM_HOME/grafana/bin/grafana" server --homepath "$CM_HOME/grafana" --config "$REPO/grafana/grafana.ini"

  wait_http grafana "http://127.0.0.1:3000/api/health" 120
  wait_http usage-exporter "http://127.0.0.1:9101/healthz" 20
  cat <<EOF

  ✓ Todo arriba. Grafana:  http://localhost:3000  (${GRAFANA_ADMIN_USER:-admin} / ${GRAFANA_ADMIN_PASSWORD:-admin})
    Formulario claude.ai:  http://localhost:9101/form
    Telemetría de Claude Code: export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 (ver README)

EOF
  cmd_open
}

cmd_stop() {
  local s
  for ((i = ${#SERVICES[@]} - 1; i >= 0; i--)); do
    s=${SERVICES[$i]}
    if is_running "$s"; then kill "$(cat "$RUN/$s.pid")" && log "parado $s"; fi
    rm -f "$RUN/$s.pid"
  done
  (( IS_TERMUX )) && command -v termux-wake-unlock >/dev/null && termux-wake-unlock || true
}

cmd_status() {
  local s
  for s in "${SERVICES[@]}"; do
    if is_running "$s"; then printf '  \033[32m●\033[0m %-15s pid %s\n' "$s" "$(cat "$RUN/$s.pid")"
    else printf '  \033[31m○\033[0m %-15s parado\n' "$s"; fi
  done
}

cmd_reset_password() {
  [[ -x "$CM_HOME/grafana/bin/grafana" ]] || die "Primero: $0 install"
  local pass="${1:-admin}"
  mkdir -p "$DATA/grafana"
  GF_PATHS_DATA="$DATA/grafana" GF_PATHS_LOGS="$LOGS" \
    "$CM_HOME/grafana/bin/grafana" cli --homepath "$CM_HOME/grafana" --config "$REPO/grafana/grafana.ini" \
    admin reset-admin-password "$pass" 2>&1 | grep -E "successfully|rror" || true
  log "Usuario: admin  ·  Contraseña: $pass"
}

cmd_open() {
  local url=http://localhost:3000/d/claude-code/claude-code
  if command -v termux-open-url >/dev/null; then termux-open-url "$url"
  elif command -v xdg-open >/dev/null; then xdg-open "$url" >/dev/null 2>&1 || true
  else echo "Abre $url en el navegador"; fi
}

case "${1:-}" in
  install) cmd_install ;;
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status)  cmd_status ;;
  open)    cmd_open ;;
  reset-password) cmd_reset_password "${2:-}" ;;
  logs)    [[ -n "${2:-}" ]] || die "Uso: $0 logs <${SERVICES[*]}>"; tail -n 50 -f "$LOGS/$2.log" ;;
  *) echo "Uso: $0 {install|start|stop|restart|status|open|logs <servicio>|reset-password [nueva]}"; exit 1 ;;
esac
