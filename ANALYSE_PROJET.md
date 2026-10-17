# Analyse de reprise — CoachSen / TerangaCoach

Date : 9 septembre 2026. Analyse du code local, sans modification du code applicatif ni intervention sur Supabase ou Vercel.

## Produit et périmètre

Application francophone de gestion pour coachs sportifs, avec montants en FCFA et usages sénégalais. Le dépôt s'appelle CoachSen ; le produit utilise aussi le nom TerangaCoach.

Fonctionnalités présentes dans le code :

- Inscription, connexion, confirmation par email, demande de réinitialisation du mot de passe, profil et avatar du coach.
- Fiches clients, objectifs, coordonnées, mensurations et archivage logique (`actif = false`).
- Séances individuelles, statuts et génération de séances récurrentes.
- Suivi du poids, mensurations, fréquences cardiaques, graphiques et rapports mensuels PDF.
- Enregistrement des paiements : espèces, Wave et Orange Money. Le code examiné enregistre les paiements ; il ne réalise pas d'encaissement via ces opérateurs.
- Tableau de bord, revenus, statistiques, recherche globale, notifications et exports CSV/JSON/PDF.
- Route de rappels WhatsApp automatiques et partage manuel d'un rapport via un lien `wa.me` contenant une URL signée valable 24 heures.

La présence du code ne constitue pas une validation des parcours en production.

## Architecture

| Emplacement | Rôle |
| --- | --- |
| `src/app` | Next.js App Router : pages publiques, authentification, espace coach et routes serveur |
| `src/features` | Modules métier, formulaires, schémas Zod et Server Actions |
| `src/dao` | Accès aux données Supabase |
| `src/services` | Services d'authentification et de tableau de bord |
| `src/config` | Clients Supabase navigateur/serveur/admin, navigation et constantes |
| `src/entities`, `src/dto` | Types des données et objets de transfert |
| `src/lib/cache.ts` | Données du dashboard et statistiques mises en cache par coach |
| `src/components` | Interface réutilisable et structure de navigation |
| `supabase` | Schéma SQL, politiques d'accès, stockage et évolutions |
| `scripts` | Scripts de configuration du stockage et des récurrences |

Stack déclarée : Next.js 14.2.35, React 18, TypeScript strict, Tailwind CSS 3, composants Base UI/shadcn, React Hook Form et Zod. Supabase fournit authentification, PostgreSQL et stockage. Zustand et React Query sont présents ; GSAP et plusieurs bibliothèques de graphiques/PDF complètent l'interface.

Flux principal : page/formulaire → Server Action → validation et utilisateur authentifié → DAO → Supabase → actualisation des pages/caches. Le dashboard utilise aussi un client administrateur avec des filtres explicites par `coach_id` et un cache par coach (30 secondes ; statistiques : 300 secondes).

Tables définies : `profiles`, `clients`, `sessions`, `progress_entries`, `payments`, `coach_notes` et `session_recurrences`. Les politiques RLS locales filtrent les données par propriétaire. Leur application effective dans la base distante reste à vérifier.

## Constats prioritaires

### 1. Deux erreurs TypeScript dans les PDF

Commande exécutée : `node_modules/.bin/tsc.cmd --noEmit --incremental false`, sortie 1.

- `src/features/progress/RapportPDF.tsx:708` : la propriété `numberOfLines` n'est pas acceptée par le type du composant `Text` utilisé.
- `src/lib/pdf/buildPaymentPdf.ts:43` : l'import dynamique de `jspdf` ne fournit pas de propriété `jsPDF` selon les types actuellement résolus.

Le contrôle de types ne passe donc pas. La compilation de production n'a pas été lancée ; elle reste à valider après correction.

### 2. Routes d'authentification et cron interceptées

`src/middleware.ts:4` n'autorise publiquement que `/`, `/login`, `/register` et `/reset-password`. Le matcher inclut `/check-email`, `/auth/callback` et `/api/cron/session-reminders`.

Sans session, ces routes sont redirigées vers `/login`, alors que le callback doit pouvoir échanger le code d'authentification et que le cron s'authentifie avec son propre secret. Il faut définir des règles adaptées à ces routes, en conservant le contrôle du secret dans le handler cron.

### 3. Parcours de mot de passe incomplet

`src/features/auth/ResetPasswordForm.tsx` permet uniquement de demander un email. Aucun appel `updateUser` ni formulaire de nouveau mot de passe n'a été trouvé dans `src`. Le service renvoie vers `/reset-password` après le callback, mais le middleware redirige les utilisateurs connectés depuis cette page vers `/dashboard`.

Autre défaut dans `src/features/auth/actions.ts:42` : la redirection après inscription avec session immédiate se trouve dans le `try/catch`, qui peut la traiter comme une erreur.

### 4. Erreurs de base de données parfois masquées

Plusieurs DAO récupèrent `data` ou `count` sans examiner `error`. Des lectures peuvent alors apparaître vides et des suppressions ou changements de statut peuvent être annoncés comme réussis malgré un échec de requête. Exemples : `src/dao/clientDao.ts`, `src/dao/sessionDao.ts:156` et `:161`.

### 5. Cohérence de propriété des relations à renforcer

Les politiques SQL vérifient le `coach_id` de la ligne, mais les clés étrangères `client_id` ne garantissent pas que le client appartient au même coach. Les actions de création de séances, paiements et progressions ne vérifient pas explicitement cette relation avant insertion.

Le schéma local permet donc une incohérence de propriété si un identifiant de client tiers est soumis. Prévoir une contrainte relationnelle ou une politique vérifiant les deux propriétaires, et des tests avec deux comptes. Aucun essai sur des données distantes n'a été effectué.

### 6. Rappels et récurrences à fiabiliser

- `vercel.json` prévoit un appel toutes les 15 minutes, mais le cron sélectionne une fenêtre de 10 minutes (séances dans 55 à 65 minutes). Certaines heures de séance ne sont couvertes par aucun passage.
- Aucun suivi persistant des rappels envoyés n'est présent dans le handler ; une répétition de l'appel peut répéter l'envoi.
- Une récurrence est enregistrée avant la validation du nombre de dates générées et avant l'insertion des séances : un échec peut laisser une règle sans séances.
- Sans date de fin, les séances sont générées sur 16 semaines ; aucun renouvellement automatique n'a été identifié.
- Plusieurs calculs de dates utilisent le fuseau local du serveur, tandis que les rappels affichent explicitement `Africa/Dakar`. Le comportement doit être harmonisé et vérifié.

### 7. Indicateurs et documentation

Dans `src/lib/cache.ts`, les séances à venir ne sont pas filtrées sur `PLANIFIEE`, contrairement au DAO correspondant. Une séance future annulée peut apparaître dans le dashboard. Le calcul de rétention inclut les séances futures et ne limite pas son numérateur aux clients actifs : il peut dépasser 100 %.

Le README reste celui du squelette Next.js. `.env.example` omet `CRON_SECRET`, `WHATSAPP_API_TOKEN` et `WHATSAPP_PHONE_NUMBER_ID`, pourtant utilisés par le cron. L'ordre et l'état d'application des fichiers SQL doivent être documentés pour rendre une installation reproductible.

## État de reprise et validation

- Nombreuses modifications locales préexistantes et dossiers applicatifs non suivis par Git. Les préserver lors de toute correction ; préparer ensuite une sauvegarde versionnée propre, sans secrets ni copies de travail.
- `.env.local` est présent et ignoré par Git ; son contenu n'a pas été affiché.
- Aucun fichier de tests applicatifs ni script de tests identifié hors dépendances et copies de travail.
- TypeScript : échec confirmé, deux erreurs ci-dessus.
- `npm.cmd run lint` : échec, 8 erreurs dans 6 fichiers. Trois apostrophes JSX non échappées dans `MetricNorms.tsx`, quatre imports/variables inutilisés dans `ClientsTable.tsx`, `NotificationBell.tsx`, `SendRapportButton.tsx` et `SessionsTable.tsx`, et un `let` à remplacer par `const` dans `sendRapportAction.ts`.
- Aucun parcours navigateur authentifié, aucune migration distante et aucun envoi WhatsApp exécutés.

Ordre de reprise proposé : corriger le typage PDF et les routes d'authentification ; terminer le changement de mot de passe ; fiabiliser les erreurs DAO et les relations entre coachs et clients ; corriger rappels/récurrences et indicateurs ; documenter l'installation puis valider la compilation et les parcours métier avec des données de test.
