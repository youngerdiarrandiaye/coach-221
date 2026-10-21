#!/bin/sh
# Remplace les tâches planifiées de Vercel (vercel.json) : appelle les routes /api/cron/* par le réseau interne,
# avec le jeton CRON_SECRET. Jamais exposé au public (nginx renvoie 404 sur /api/cron/).
# Rythme : push-reminders chaque minute, session-reminders toutes les 15 minutes, maintenance à 03:00 (heure de Dakar = UTC),
# résumé hebdomadaire des clients le lundi à 07:00, 08:00, 09:00, 10:00 et 11:00 (les passages suivants ne servent que les clients
# qui restent à servir : l'envoi est unique par client et par semaine).
#
# Journal : un succès ne s'écrit pas. Un 503 (« configuration incomplète », ex. WhatsApp non configuré, facultatif)
# n'est signalé qu'UNE fois par tâche tant qu'il dure ; tout autre échec est écrit à chaque fois.
# Santé : /tmp/alive est mis à jour à chaque passage ; le HEALTHCHECK de l'image échoue s'il n'a pas bougé depuis 3 minutes.
set -u
: "${CRON_SECRET:?CRON_SECRET manquant}"
API="${API_URL:-http://api:3000}"

call() {
  task="$1"
  # busybox wget -S écrit les en-têtes de réponse sur la sortie d'erreur : on en tire le code HTTP.
  code=$(wget -S -q -O /dev/null --header="Authorization: Bearer ${CRON_SECRET}" "${API}/api/cron/${task}" 2>&1 | sed -n 's/.*HTTP\/[0-9.]* \([0-9][0-9]*\).*/\1/p' | tail -1)
  flag="/tmp/unconfigured-${task}"
  case "${code:-0}" in
    2*) rm -f "$flag" ;;
    503)
      if [ ! -f "$flag" ]; then
        touch "$flag"
        echo "$(date -u +%FT%TZ) ${task} : configuration incomplète côté API (503), tâche ignorée tant que cela dure"
      fi ;;
    *) echo "$(date -u +%FT%TZ) échec ${task} (HTTP ${code:-aucune réponse})" ;;
  esac
}

echo "scheduler démarré, API=${API}"
touch /tmp/alive
i=0
while true; do
  call push-reminders
  [ $((i % 15)) -eq 0 ] && call session-reminders
  [ "$(date -u +%H%M)" = "0300" ] && call maintenance
  if [ "$(date -u +%u%M)" = "100" ]; then h=$(date -u +%H); [ "$h" -ge 7 ] && [ "$h" -le 11 ] && call weekly-digest; fi
  touch /tmp/alive
  i=$((i + 1))
  sleep 60
done
