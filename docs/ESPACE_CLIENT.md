# Espace client

Un client invité par son coach dispose de son propre espace, **en lecture seule** : ses performances, ses statistiques et ses rapports. Il ne voit ni les paiements, ni les notes du coach, ni les autres clients.

## Parcours

1. Le coach enregistre un client **avec son adresse e-mail** (formulaire client). Le serveur crée le compte de connexion du client et lui envoie automatiquement un e-mail « Votre espace CoachSen est prêt » (même modèle que la réinitialisation du mot de passe, texte adapté : `deploy/mail/recovery.html`).
2. Le client touche le bouton : il arrive sur `/update-password`, choisit son mot de passe, puis est conduit à `/espace`.
3. Ensuite il se connecte normalement sur la page de connexion ; son rôle l'envoie directement vers son espace. Un lien expiré (1 heure) se remplace par « Mot de passe oublié ? » avec la même adresse, ou par un renvoi du coach.
4. Sur la fiche du client, le panneau **Espace client** montre l'état (pas d'accès, invité, actif), permet d'envoyer ou renvoyer le lien (1 par minute et par client, 30 par heure et par coach) et de **retirer l'accès**.

**Clients déjà enregistrés** : sur la liste des clients, un bandeau « N clients sans espace » propose d'envoyer d'un coup les liens à ceux qui ont une adresse e-mail (25 par envoi, 6 envois par heure ; le reste au passage suivant). Les clients sans e-mail ou dont l'adresse a déjà un compte sont comptés à part, rien n'est envoyé deux fois.

L'accès est coupé automatiquement quand le coach supprime le client ou l'efface définitivement, et quand l'adresse e-mail du client est changée (l'ancienne adresse perd l'accès, la nouvelle est invitée).

## Contenu de l'espace (`/espace`)

- **Résumé** : séances du mois, volume, records, assiduité, poids de départ et actuel, prochaines séances, la semaine en cours, le journal des derniers jours.
- **Progression** : courbe du poids, mesures, volume et séances (7 ou 30 jours), records par exercice.
- **Rapports** : rapport mensuel (aperçu et PDF, thème de l'application), détail semaine par semaine (8 semaines) et journal quotidien (14 jours).

## Résumé hebdomadaire par e-mail

Chaque **lundi matin** (07:00 à 11:00, heure de Dakar), le client reçoit un e-mail résumant la **dernière semaine terminée** (lundi au dimanche) : séances effectuées sur prévues, séries et volume, poids moyen et écart, prochaines séances, lien vers son espace. Le client peut le désactiver (case « Recevoir mon résumé chaque lundi par e-mail » sur la page Résumé).

- Tâche : `/api/cron/weekly-digest` (jeton `CRON_SECRET`, jamais exposée au public), appelée par le planificateur (`deploy/scheduler.sh`) chaque heure le lundi de 07:00 à 11:00. **Un client n'est servi qu'une fois par semaine** (`client_accounts.last_digest_week`) : un échec d'envoi est retenté à l'heure suivante, jamais de doublon. Par lots de 100 clients.
- Pas d'e-mail vide : sans séance, série, pesée ni séance à venir, rien n'est envoyé.
- **Configuration obligatoire (une fois)** : un serveur d'e-mail SMTP pour l'application. Sans elle, la tâche répond 503 et le planificateur l'ignore (signalé une fois dans son journal). Secrets GitHub à créer (le pipeline les recopie dans Coolify) : `SMTP_HOST`, `SMTP_PORT` (587 ou 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (par exemple `CoachSen <adresse@votre-domaine>`). Avec Gmail : `smtp.gmail.com`, 587, l'adresse Gmail, un mot de passe d'application, et la même adresse en expéditeur.
  `gh secret set SMTP_HOST --repo <dépôt>` (idem pour les quatre autres ; la valeur est demandée sans s'afficher).
- Rien d'autre à faire : les e-mails d'invitation et de connexion continuent de passer par le SMTP du Supabase (réglé à part).

## Sécurité

- Le rôle est écrit dans `app_metadata.role = 'client'` par le serveur (jamais modifiable par l'utilisateur, contrairement à `user_metadata`).
- **Un compte client n'a pas de profil de coach** : toutes les tables du coach référencent `profiles(id)`, il ne peut donc rien créer ni posséder, même en appelant directement l'API Supabase avec la clé publique. Deux déclencheurs SQL (`handle_new_user` et `drop_client_profile`) l'assurent : GoTrue écrit le rôle *après* la création du compte, le second déclencheur retire le profil créé entre-temps. Le test de bout en bout a révélé ce détail ; `tests/client-space-db.test.mjs` le couvre.
- `client_accounts` (lien compte → fiche client → coach, clé composite) est en lecture seule pour les utilisateurs : un coach voit ses comptes, un client sa propre ligne ; seul le serveur écrit.
- Les routes `/api/v1/me/*` (lecture seule) déduisent le client **du compte connecté**, jamais de l'adresse ou du corps de la requête (`clientId` en paramètre est ignoré). Les données du coach étant fermées au compte d'un client (le RLS ne lui montre rien, voulu), la lecture s'exécute avec le client à droits complets, limitée à ce seul client et à des colonnes choisies (`src/server/clientSpace.ts`, `runWithElevatedClient` dans `src/config/supabase.server.ts`).
- Un client reçoit **403** sur toutes les routes du coach ; un coach reçoit 403 sur `/me`. Côté Angular, deux gardes (`authenticated`, `clientOnly`) renvoient chacun vers son espace.

## Vérifications

- `tests/client-space-db.test.mjs` (SQL, PGlite) et `tests/client-space.test.mjs` (invitation, relance, retrait, synthèses).
- Test de bout en bout local (pile Supabase locale, 55 contrôles) : isolation entre clients d'un même coach, absence de profil de coach, accès REST direct refusé, retrait d'accès, suppression et effacement d'un client, changement d'adresse. Script : `.tools/e2e/e2e-client.mjs` (hors dépôt).

## Limites connues

- Une adresse e-mail ne peut servir qu'à un seul compte : si elle a déjà un compte CoachSen (coach, ou client d'un autre coach), le lien n'est pas envoyé et le coach en est informé.
- Pas de notifications push ni de messagerie pour le client (lecture seule).
- Le rapport PDF du client est celui du rapport mensuel (séances, mesures, records) **sans la section des paiements**.
- Le lien de première connexion expire après 1 heure (réglage `GOTRUE_MAILER_OTP_EXP` de Supabase).
