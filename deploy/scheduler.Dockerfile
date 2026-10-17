# Planificateur interne (remplace les crons Vercel) : appelle /api/cron/* par le réseau Docker.
FROM alpine:3.20
COPY deploy/scheduler.sh /scheduler.sh
RUN chmod +x /scheduler.sh && adduser -D -H scheduler
USER scheduler
# Sain tant que la boucle a tourné dans les 3 dernières minutes (le script touche /tmp/alive à chaque passage).
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=2 CMD find /tmp/alive -mmin -3 2>/dev/null | grep -q . || exit 1
CMD ["sh", "/scheduler.sh"]
