# Lot « fiabilisation » : contrat backend / frontend

Complément de `docs/AGENDA_CONTRACT.md` (mêmes principes : `coachId` issu de la session, erreurs `{ "error": { "code", "message", ... } }` avec le bon statut HTTP, messages en français, aucune migration distante, base locale Docker seulement, migrations idempotentes avec retour arrière documenté, aucune donnée existante supprimée par une migration, aucun envoi réel de WhatsApp ou de notification push dans les tests, aucun secret affiché).

## 1. Backend

### B1. Limitation de débit
- Table `rate_limits(key text, window_start timestamptz, count int, primary key (key, window_start))` et fonction `rate_limit_hit(p_key, p_window_seconds, p_max)` renvoyant `(allowed boolean, retry_after int)`, incrément atomique, exécutable seulement par le serveur (clé de service), jamais par un navigateur.
- Règles : connexion 10 / 10 min par IP et par e-mail ; inscription 5 / heure par IP ; réinitialisation de mot de passe 5 / heure par e-mail et par IP ; `POST rum` 120 / minute par coach ; `POST push/test` 5 / heure par coach ; exports PDF 30 / 10 min par coach ; mutations générales 300 / minute par coach.
- Dépassement : 429 `RATE_LIMITED`, `retry_after` (secondes) dans le corps et en-tête `Retry-After`, message « Trop de tentatives. Réessayez dans N secondes. »
- IP : premier élément de `x-forwarded-for`, sinon « inconnue ». En cas de panne de la base, ne pas bloquer l'utilisateur (ouvert par défaut) mais journaliser sans détail sensible.

### B2. Rétention et maintenance
- Route `GET|POST /api/cron/maintenance` (Bearer `CRON_SECRET`, mêmes règles que les autres crons), ajoutée à `vercel.json` une fois par jour : supprime `rum_events` de plus de 90 jours, `rate_limits` de plus de 2 jours, `idempotency_keys` de plus de 7 jours, `cron_runs` de plus de 30 jours, `push_sent` de séances terminées depuis plus de 30 jours.

### B3. Suivi des tâches planifiées
- Table `cron_runs(id, job, started_at, finished_at, ok, checked, sent, failed, error)` alimentée par `session-reminders`, `push-reminders` et `maintenance` (sans changer leur comportement ni leurs réponses).
- Route `GET /api/cron/health` (Bearer `CRON_SECRET`) : `{data:{jobs:[{job, last_run_at, last_ok, stale, max_age_minutes}]}}`, statut 503 si une tâche est en retard (push 5 min, WhatsApp 35 min, maintenance 26 h). Elle sert aux sondes de disponibilité externes.

### B4. Droit d'accès et d'effacement d'un client
- `GET clients/:id/export` : fichier JSON `{client, sessions, payments, progress, workouts, recurrences}` limité à ce client, en téléchargement (`Content-Disposition`).
- `POST clients/:id/erase` `{confirmation: "<Prénom Nom exact>"}` : suppression définitive en une transaction (fonction SQL `erase_client_data`) de séances (y compris effectuées), paiements, mesures, séries d'entraînement, récurrences, réservations de rappels et notes du client, puis du client. Réponse `{data:{erased:{...compteurs}}}`. Confirmation fausse : 400. Client d'un autre coach : 404. Une trace sans donnée personnelle est écrite dans `audit_log(coach_id, action, entity, entity_id, created_at, counts jsonb)`.
- `DELETE clients/:id` conserve son comportement (archivage).

### B5. Valeurs proposées, sans charger tout l'historique
- `GET clients/:id/defaults` → `{data:{last_payment:{montant, methode, statut, date_paiement}|null, last_session:{titre, duree_minutes, date_heure}|null, last_progress:{mesure_date, poids_kg, ...}|null}}`.
- `GET sessions/titles?limit=20` → `{data:["Haut du corps", ...]}`, titres les plus fréquents du coach.

### B6. Idempotence de la saisie d'entraînement
- `POST workouts` accepte l'en-tête optionnel `Idempotency-Key` (UUID). Table `idempotency_keys(coach_id, key, route, request_hash, response jsonb, status, created_at, primary key (coach_id, key))`. Même clé et même corps : la réponse d'origine est renvoyée avec l'en-tête `Idempotency-Replayed: true`, sans rien réinsérer, même en cas de requêtes simultanées. Même clé avec un corps différent : 422 `IDEMPOTENCY_MISMATCH`.

### B7. Outillage
- `scripts/run-tests.mjs` : lance les fichiers de `tests/` l'un après l'autre (évite les manques de mémoire) ; `npm test` l'utilise. Intégration continue `.github/workflows/ci.yml` : typecheck, lint, tests, build Angular (sans navigateur).

## 2. Frontend (`frontend/`)

- **F2** Les formulaires utilisent `clients/:id/defaults` et `sessions/titles` au lieu de charger tout l'historique. La saisie d'entraînement et les rappels chargent seulement la fenêtre utile (`sessions?from&to`).
- **F3** Fiche client : « Exporter les données » et « Supprimer définitivement ce client » (explication de l'irréversibilité, saisie du nom exact, deux étapes), distinct de « Archiver ».
- **F4** Erreur 429 : message clair avec le délai, aussi sur la connexion.
- **F5** Saisie d'entraînement hors ligne : file d'attente dans IndexedDB (repli localStorage), envoyée avec `Idempotency-Key` au retour du réseau, au démarrage et au retour sur l'application. Jamais de message de réussite avant la confirmation du serveur : état explicite « En attente de synchronisation », pastille avec le nombre d'éléments en attente, panneau pour réessayer ou supprimer un élément refusé.
- **F6** Police hébergée avec l'application (`@fontsource/plus-jakarta-sans`), plus aucune requête vers Google Fonts.
- **F7** Tests navigateur : hors ligne (`setOffline`), 429 simulé, effacement d'un client, absence du chargement de tout l'historique, absence de requêtes externes, libellés lisibles.

## 3. Responsabilités

- Backend : `src/`, `supabase/`, `scripts/`, `tests/`, `package.json`, `.github/`, `vercel.json`, `.env.example`.
- Frontend : `frontend/`.
- Intégration et recette : agent principal.
