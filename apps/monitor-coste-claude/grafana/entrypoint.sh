#!/bin/sh
# Copia el provisioning (montado en solo lectura) y aplica los umbrales de alerta de .env.
set -eu
SRC=/etc/grafana/provisioning-src
DST=/tmp/grafana-provisioning
rm -rf "$DST" && mkdir -p "$DST" && cp -r "$SRC/." "$DST/"
num() { echo "$1" | grep -Eq '^[0-9]+([.][0-9]+)?$' && echo "$1" || echo "$2"; }
sed -i \
  -e "s/__ALERT_BURN_RATE_USD_HR__/$(num "${ALERT_BURN_RATE_USD_HR:-5}" 5)/g" \
  -e "s/__ALERT_DAILY_COST_USD__/$(num "${ALERT_DAILY_COST_USD:-20}" 20)/g" \
  -e "s/__ALERT_CLAUDE_AI_WEEKLY_PCT__/$(num "${ALERT_CLAUDE_AI_WEEKLY_PCT:-90}" 90)/g" \
  "$DST/alerting/alerts.yaml"
export GF_PATHS_PROVISIONING="$DST"
exec /run.sh "$@"
