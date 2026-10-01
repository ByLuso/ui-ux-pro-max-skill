#!/usr/bin/env bash
# Registra manualmente el % de uso de claude.ai (web / móvil) en el Pushgateway.
#   ./log-usage.sh <web|movil> <porcentaje_semanal> [porcentaje_sesion]
# Ejemplo: ./log-usage.sh web 42 15
set -euo pipefail

PUSHGATEWAY_URL="${PUSHGATEWAY_URL:-http://localhost:9091}"

usage() { echo "Uso: $0 <web|movil> <porcentaje_semanal> [porcentaje_sesion]" >&2; exit 1; }
[[ $# -lt 2 || $# -gt 3 ]] && usage

surface="$1"
case "$surface" in
  web) ;;
  movil|móvil|mobile) surface="movil" ;;
  *) usage ;;
esac

is_pct() { [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]] && awk -v v="$1" 'BEGIN{exit !(v>=0 && v<=100)}'; }

push() {  # push <window> <valor>
  local window="$1" value="$2"
  is_pct "$value" || { echo "Porcentaje inválido: $value (0-100)" >&2; exit 1; }
  cat <<METRICS | curl -fsS -X PUT --data-binary @- \
    "$PUSHGATEWAY_URL/metrics/job/claude_ai_manual/surface/$surface/window/$window"
# TYPE claude_ai_usage_percent gauge
claude_ai_usage_percent{window="$window"} $value
# TYPE claude_ai_usage_last_update_timestamp_seconds gauge
claude_ai_usage_last_update_timestamp_seconds{window="$window"} $(date +%s)
METRICS
  echo "✓ claude_ai_usage_percent{surface=\"$surface\",window=\"$window\"} = $value"
}

push weekly "$2"
[[ $# -eq 3 ]] && push session "$3"
exit 0
