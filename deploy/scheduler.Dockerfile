# Planificateur interne (remplace les crons Vercel) : appelle /api/cron/* par le réseau Docker.
FROM alpine:3.20
COPY deploy/scheduler.sh /scheduler.sh
RUN chmod +x /scheduler.sh && adduser -D -H scheduler
USER scheduler
CMD ["sh", "/scheduler.sh"]
