# Site Angular (statique) servi par Nginx ; /api et /auth sont transmis au conteneur « api » (même domaine : cookies de session).
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx ng build --configuration production
# Version déployée (identifiant du commit) : écrite dans /version.json et dans le service worker, qui change ainsi
# à chaque déploiement. Les applications installées détectent la nouvelle version et proposent « Actualiser ».
ARG APP_VERSION=dev
RUN case "$APP_VERSION" in *[!A-Za-z0-9._-]*|"") echo "APP_VERSION invalide" >&2; exit 1;; esac \
 && sed -i "s/__BUILD__/${APP_VERSION}/g" dist/coachsen/browser/sw.js \
 && printf '{"version":"%s"}' "$APP_VERSION" > dist/coachsen/browser/version.json

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/coachsen/browser /usr/share/nginx/html
COPY deploy/mail /usr/share/nginx/html/mail
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
