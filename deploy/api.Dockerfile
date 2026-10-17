# API CoachSen (Next.js) : seules les routes /api/v1/*, /auth/callback et /api/cron/* servent l'application Angular.
# Construction : docker build -f deploy/api.Dockerfile --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... --build-arg NEXT_PUBLIC_APP_URL=... .
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variables publiques lues au moment du build (elles ne sont pas des secrets : clé « anon » seulement).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S coachsen && adduser -S coachsen -G coachsen
COPY --from=build --chown=coachsen:coachsen /app/.next/standalone ./
COPY --from=build --chown=coachsen:coachsen /app/.next/static ./.next/static
COPY --from=build --chown=coachsen:coachsen /app/public ./public
# Migrations automatiques (service « migrate » du compose) : script sans dépendance et fichiers SQL
COPY --from=build --chown=coachsen:coachsen /app/scripts/migrate-production.mjs /app/scripts/migrations-list.mjs ./scripts/
COPY --from=build --chown=coachsen:coachsen /app/supabase ./supabase
USER coachsen
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
