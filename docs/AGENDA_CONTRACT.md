# Agenda CoachSen : audit et contrat backend / frontend

Document de coordination (AGENTS.md). Le backend est l'API Next.js (`src/server`) avec Supabase/PostgreSQL, sans ORM. Les consignes du « master prompt » parlant de NestJS s'appliquent à cette architecture : Contrôleur = `src/server/router.ts`, Service = fonctions de `src/server` et `src/lib`, Repository = `src/dao`, Base = SQL dans `supabase/`.

## 1. Audit de l'existant (12 octobre 2026)

| Élément | État | Action |
|---|---|---|
| Liste des séances (filtre statut, recherche) | Existant (`list.page.ts`, cartes) | Conserver comme « Mode liste » |
| Vue semaine | Incomplet : bande de 7 jours et agenda du jour (`session-calendar.ts`) | Vraie vue semaine : grille horaire sur ordinateur, liste par jour sur mobile |
| Vue jour | Incomplet : agenda du jour sans grille horaire | Vue jour avec grille horaire et créneaux cliquables |
| Vue mois | Absent | Créer |
| Filtres client et statut dans l'agenda | Absent (filtre statut seulement dans la liste ; l'API accepte `clientId`) | Créer, un seul clic |
| Création rapide | Incomplet : formulaire pleine page, titre et durée repris du dernier historique, heure par défaut | Panneau de création rapide ouvert depuis un créneau ou « Ajouter » |
| Modification | Existant (page d'édition) | Modification depuis le panneau de détail, avec contrôle de version |
| Changement de statut (Effectuée, Annulée, Planifiée) | Existant (`PATCH sessions/:id/status`, page détail) | Boutons dans le panneau de détail ; annulation avec confirmation ; le coach décide toujours |
| Annulation avec portée (série) | Absent | Créer |
| Séances récurrentes | Incomplet : hebdomadaire par jours seulement, 366 jours max, création atomique (`create_session_recurrence`), suppression des futures | Ajouter fréquence, intervalle, nombre d'occurrences, exceptions |
| Modification / annulation par portée (cette occurrence, suivantes, série) | Absent | Créer |
| Détection des conflits horaires | Absent (aucune contrainte, aucun contrôle) | Créer : serveur, base, message Angular |
| Conflits entre créations simultanées | Absent | Verrou par coach dans la base |
| Modification concurrente | Absent | Contrôle de version (`updated_at`) |
| Rappels WhatsApp | Existant (`/api/cron/session-reminders`, réservation par `(séance, horaire)`, séances `PLANIFIEE` seulement) | Ne pas casser ; vérifier la compatibilité avec séries, annulations, changements d'horaire |
| Rappels push | Existant (`/api/cron/push-reminders`) | Idem |
| Isolation entre coachs | Existant (RLS, `coachId` issu de la session) | Conserver et tester pour chaque nouvelle route |
| Tests | Base PGlite et fonctions pures (`tests/`) | Compléter |

## 2. Principes communs

- Le `coachId` vient toujours de la session vérifiée, jamais du navigateur.
- Le coach décide des statuts : aucune séance ne passe à « Effectuée » automatiquement.
- Dates métier en `Africa/Dakar` (UTC+0 toute l'année, mais ne pas coder cette hypothèse : utiliser le fuseau nommé).
- Format d'erreur : `{ "error": { "code": "...", "message": "français lisible", ...champs additionnels } }` avec le statut HTTP adapté.
- Aucun envoi réel de WhatsApp ni de notification push pendant les tests.
- Aucune migration distante : base locale Docker seulement (`supabase_db_coachsen-local`, port 54422).
- Migrations idempotentes, avec un script de retour arrière documenté ; aucune donnée existante n'est supprimée ni modifiée.

## 3. Contrat d'API (`/api/v1`)

Représentation d'une séance : `id, client_id, titre, description, date_heure (ISO UTC), duree_minutes, statut (PLANIFIEE|EFFECTUEE|ANNULEE), notes, recurrence_id|null, occurrence_date|null (AAAA-MM-JJ, jour Dakar de l'occurrence d'origine), created_at, updated_at, clients {prenom, nom}`.

### Lecture

- `GET sessions?from=AAAA-MM-JJ&to=AAAA-MM-JJ&clientId=<uuid>&statut=PLANIFIEE|EFFECTUEE|ANNULEE` : séances du coach dont l'horaire est dans la période `[from, to]` (jours Dakar, bornes incluses), triées par horaire. Période maximale 100 jours (sinon 400), 1000 lignes maximum. Sans `from`/`to`, le comportement actuel est conservé.

### Création et conflits

- `POST sessions` `{client_id, titre, description?, date_heure, duree_minutes}` : 201 `{data: séance}`. Conflit : 409 `SESSION_CONFLICT` avec `conflicts: [{id, titre, client, date_heure, duree_minutes}]`.
- `POST sessions/conflicts` `{date_heure, duree_minutes, exclude_id?}` : 200 `{data: {conflicts: [...]}}`, sans rien modifier, pour avertir le coach pendant la saisie.
- Règle de conflit : deux séances du même coach, hors `ANNULEE`, se chevauchent si `début_a < fin_b` et `début_b < fin_a`. Une séance de 18 h à 19 h ne chevauche pas une séance qui se termine à 18 h.

### Modification, statut, suppression

- `PATCH sessions/:id` `{titre?, description?, notes?, date_heure?, duree_minutes?, expected_updated_at, scope?}` : `scope` vaut `ONE` (défaut), `FOLLOWING` ou `ALL` et n'a de sens que pour une séance de série. Réponse 200 `{data: {updated: n, session}}`. Version périmée : 409 `STALE_VERSION`. Conflit : 409 `SESSION_CONFLICT` (tout ou rien pour les portées multiples). Le client d'une séance reste non modifiable (`CLIENT_IMMUTABLE`).
- `PATCH sessions/:id/status` `{statut, scope?}` : `EFFECTUEE` seulement pour une occurrence (`ONE`). L'annulation accepte `ONE|FOLLOWING|ALL` et ne touche que les occurrences futures encore `PLANIFIEE` ; les séances `EFFECTUEE` ne sont jamais modifiées. Remettre `PLANIFIEE` revérifie les conflits.
- `DELETE sessions/:id?scope=ONE|FOLLOWING|ALL` : supprime la séance ou les occurrences futures `PLANIFIEE` de la série ; l'historique est conservé.

### Récurrences

- `POST recurrences` `{client_id, titre, description?, duree_minutes, heure: "HH:mm", frequence: QUOTIDIENNE|HEBDOMADAIRE|MENSUELLE, intervalle: 1..12 (défaut 1), jours: [0..6] (obligatoire si HEBDOMADAIRE), date_debut, date_fin?, nb_occurrences?: 1..200, on_conflict?: REJECT|SKIP}`. « Toutes les deux semaines » = `HEBDOMADAIRE` + `intervalle: 2`. « Personnalisée » = intervalle et jours libres. Mensuelle : même quantième que `date_debut`. Il faut `date_fin` ou `nb_occurrences` (au plus 366 jours / 200 occurrences). Réponse 201 `{data: {id, created, skipped: [{date, reason: "CONFLICT"}]}}` ; avec `REJECT` (défaut) tout conflit donne 409 `SESSION_CONFLICT` et rien n'est créé.
- `GET recurrences` expose en plus `frequence, intervalle, nb_occurrences`.
- Les exceptions (occurrence modifiée ou annulée seule) sont enregistrées pour éviter les doublons et les recréations ; une occurrence est identifiée par `(recurrence_id, occurrence_date)`, unique.
- `DELETE recurrences/:id` conserve son comportement actuel (séances futures `PLANIFIEE` supprimées, historique conservé).

### Codes d'erreur

`400 VALIDATION_ERROR` (messages en français), `401 UNAUTHENTICATED`, `403 CSRF_REJECTED`, `404 NOT_FOUND`, `409 SESSION_CONFLICT`, `409 STALE_VERSION`, `405` méthode non permise.

## 4. Responsabilités

- Backend (`src/`, `supabase/`, `scripts/`, `tests/`, `package.json`) : migration, API, tests, rapport.
- Frontend (`frontend/`) : agenda Jour / Semaine / Mois / Liste, création rapide, détail, récurrences, conflits, filtres, responsive, accessibilité, tests navigateur.
- Intégration et recette : agent principal.
