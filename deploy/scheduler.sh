#!/bin/sh
# Remplace les tâches planifiées de Vercel (vercel.json) : appelle les routes /api/cron/* par le réseau interne,
# avec le jeton CRON_SECRET. Jamais exposé au public (nginx renvoie 404 sur /api/cron/).
# Rythme : push-reminders chaque minute, session-reminders toutes les 15 minutes, maintenance à 03:00 (heure de Dakar = UTC).
set -u
: "${CRON_SECRET:?CRON_SECRET manquant}"
API="${API_URL:-http://api:3000}"
call() { wget -q -O /dev/null --header="Authorization: Bearer ${CRON_SECRET}" "${API}/api/cron/$1" || echo "$(date -u +%FT%TZ) échec $1"; }
echo "scheduler démarré, API=${API}"
i=0
while true; do
  call push-reminders
  [ $((i % 15)) -eq 0 ] && call session-reminders
  [ "$(date -u +%H%M)" = "0300" ] && call maintenance
  i=$((i + 1))
  sleep 60
done
