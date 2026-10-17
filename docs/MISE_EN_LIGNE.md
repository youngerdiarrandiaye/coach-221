# Mise en ligne de CoachSen : liste de contrôle

Rédigé le 14 octobre 2026. Rien n'a été déployé ni appliqué à distance : ce document prépare la bascule, il ne l'exécute pas. Conformément à AGENTS.md, chaque migration est d'abord jouée dans une base de test, et aucune clé n'est publiée.

## 1. Ce qui a été vérifié

| Contrôle | Résultat |
|---|---|
| Build de production Angular (`ng build --configuration production`) | Réussi : 464 kB de code initial (seuil d'alerte 700 kB), aucun avertissement, `index.html`, `manifest.webmanifest`, `sw.js` et les icônes présents |
| Build de production de l'API Next.js (`next build`, dossier isolé `.next-build`) | Réussi |
| Contrôle de types serveur et Angular, lint | Réussis |
| Tests du serveur | 114 réussis, lancés par `npm test` qui exécute les fichiers l'un après l'autre (tout en parallèle manque de mémoire sur la machine de développement) |
| Parcours dans Chrome (3 clics, formulaires, agenda sur le vrai serveur, rappels, accueil mobile, 45 pages sur 3 largeurs) | Réussis sur la base locale |
| Audit d'accessibilité axe-core (WCAG 2.1 A et AA, 11 écrans, ordinateur et mobile) | Aucune violation détectée |
| Secrets dans le code envoyé aux navigateurs (Angular et Next côté client) | Aucun : clé de service, clé privée VAPID, secret des tâches planifiées, jeton WhatsApp absents |

Non vérifié : tout ce qui dépend d'un vrai hébergement (HTTPS, cookies à travers la redirection, envoi réel de notifications push et de messages WhatsApp, installation de la PWA sur un téléphone, tâches planifiées de l'hébergeur).

## 2. Architecture de production : deux hébergements

Le dépôt contient encore l'ancienne application React de l'API Next.js, avec ses propres pages (`/dashboard`, `/clients`, `/login`…). Elles entrent en conflit avec les routes d'Angular. Il faut donc deux projets :

1. **API** : la racine du dépôt (Next.js). Seules les routes `/api/v1/*`, `/auth/callback` et `/api/cron/*` servent à l'application Angular.
2. **Site Angular** : le dossier `frontend/`, publié comme site statique (sortie du build : `frontend/dist/coachsen/browser`).

Le site Angular appelle `/api/v1/...` et `/auth/...` en chemins relatifs. En production, le projet Angular doit donc rediriger ces chemins vers l'API, pour que les cookies de session restent sur le domaine d'Angular. Exemple de `frontend/vercel.json` (à créer au moment du déploiement, avec le vrai domaine de l'API) :

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://VOTRE-API.example.com/api/:path*" },
    { "source": "/auth/:path*", "destination": "https://VOTRE-API.example.com/auth/:path*" },
    { "source": "/((?!api/|auth/|.*\\..*).*)", "destination": "/index.html" }
  ],
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ]
}
```

À vérifier après le premier déploiement : la connexion fonctionne (le cookie de session est bien posé sur le domaine Angular), une mutation passe le contrôle CSRF, et `/auth/callback` ramène bien sur le site Angular.

## 3. Variables d'environnement de l'API

Créez des valeurs de production. Ne réutilisez ni les clés locales, ni celles de `.env.local`.

| Variable | Valeur attendue |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Projet Supabase de production |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé de service du projet de production, uniquement côté API |
| `NEXT_PUBLIC_APP_URL`, `FRONTEND_ORIGIN` | Adresse HTTPS du site Angular (sans barre finale). `FRONTEND_ORIGIN` sert au contrôle CSRF et à la redirection de `/auth/callback` |
| `CRON_SECRET` | Longue valeur aléatoire neuve, utilisée comme jeton Bearer par les tâches planifiées |
| `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `WHATSAPP_REMINDER_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE` | Compte WhatsApp Business de production |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Nouvelle paire de clés : `node -e "console.log(require('web-push').generateVAPIDKeys())"`, et `VAPID_SUBJECT=mailto:votre-adresse` |

**`RATE_LIMIT_DISABLED` ne doit JAMAIS être défini en production** : cette variable désactive la limitation de débit (connexion, inscription, mots de passe, exports) et ne sert qu'aux tests locaux, où tous les essais viennent de la même adresse. En production, vérifiez que les adresses des visiteurs arrivent bien dans l'en-tête `x-forwarded-for` : sinon tous les visiteurs partageraient le même compteur.

Changer la clé VAPID invalide les abonnements push existants : les coachs devront les réactiver depuis leur profil.

## 4. Base de données distante

1. Faites une sauvegarde complète (`pg_dump`) de la base distante.
2. Créez une copie de test (branche Supabase ou projet séparé) et jouez-y les migrations d'abord.
3. Comparez l'état de la base distante avec le dépôt, car je ne sais pas quelles migrations y ont déjà été appliquées. Ordre des fichiers : `schema.sql`, `recurrences.sql`, `storage.sql`, puis `supabase/migrations/` : `add_progress_metrics.sql`, `20260909_reliability.sql`, `20261012_workout_logs.sql`, `20261013_push_reminders.sql`, `20261014_agenda.sql`, `20261015_hardening.sql` (limitation de débit, suivi des tâches, idempotence, effacement d'un client).
4. La migration de l'agenda ajoute un déclencheur de détection de conflits. Les chevauchements déjà présents ne bloquent rien et ne sont pas modifiés. Son retour arrière est dans `supabase/migrations/down/20261014_agenda_down.sql` (à ne jouer qu'à la main).
5. Après application, relancez les tests de la base (PGlite) et les parcours de recette sur la copie.

## 5. Supabase Auth

- **Site URL** : l'adresse du site Angular.
- **Redirect URLs** : `https://VOTRE-SITE/auth/callback`.
- En local l'inscription est immédiate. En production, si la confirmation par e-mail est activée, le parcours passe par la page « Vérifiez votre e-mail » : testez-le de bout en bout, y compris le lien de mot de passe oublié.
- Configurez l'expéditeur des e-mails (domaine vérifié) avant d'inviter des coachs.

## 6. Tâches planifiées

`vercel.json` à la racine planifie `session-reminders` (toutes les 15 minutes, WhatsApp) et `push-reminders` (chaque minute).

- La fréquence « chaque minute » exige un plan Vercel qui l'autorise. Sans cela, l'offre gratuite n'accepte que des passages quotidiens et les rappels de 10 ou 20 minutes arriveraient en retard.
- Alternative : un planificateur externe (GitHub Actions, un service de cron en ligne) qui appelle `https://VOTRE-API/api/cron/push-reminders` toutes les minutes avec l'en-tête `Authorization: Bearer <CRON_SECRET>`.
- Contrôlez qu'un appel sans jeton renvoie 401.
- Trois tâches au total : `session-reminders` (WhatsApp), `push-reminders` (notifications) et `maintenance` (une fois par jour : purge des anciennes données techniques).
- Branchez un service de surveillance externe sur `GET https://VOTRE-API/api/cron/health` avec l'en-tête `Authorization: Bearer <CRON_SECRET>` : il répond 503 si une tâche est en retard (rappels push 5 min, WhatsApp 35 min, maintenance 26 h). Sur une base neuve, il répond 503 tant qu'aucune tâche n'a tourné.

## 7. PWA

- L'installation exige HTTPS.
- `sw.js` ne met jamais en cache `/api` ni `/auth`.
- Sur iPhone, les notifications push ne fonctionnent que si l'application est installée sur l'écran d'accueil (iOS 16.4 et plus).
- Testez l'installation et un rappel réel sur un Android et un iPhone.

## 8. Recette avant ouverture

1. Inscription, confirmation, connexion, déconnexion, mot de passe oublié.
2. Créer un client, planifier une séance, provoquer un conflit (409), créer une série récurrente, annuler « celle-ci et les suivantes ».
3. Saisir un entraînement, battre un record, ouvrir la performance du client.
4. Enregistrer un paiement, télécharger le reçu, la fiche client et le rapport mensuel en PDF.
5. Activer les rappels sur un téléphone, envoyer un essai, puis attendre un vrai rappel de séance.
6. Se connecter avec un second coach : il ne voit rien du premier.
7. Contrôler les largeurs 320, 390 et 1440 px, et l'installation de la PWA.

## 9. Limites connues

- Prolonger une série n'existe pas encore (les exceptions enregistrées ne sont lues par aucune fonction).
- Une séance « effectuée » a son horaire et sa durée figés (choix à confirmer).
- Une récurrence exige une date de fin ou un nombre d'occurrences.
- La grille hebdomadaire n'a pas de navigation clavier cellule par cellule.
- Les PDF utilisent la police Helvetica, pas Plus Jakarta Sans.
- Les cases du mois font 36 px de large à 320 px (moins que les 48 px visés).
- L'ancienne application React du dépôt reste présente et n'est pas utilisée par Angular.

## 10. Retour arrière

Gardez l'ancienne version déployée disponible. Pour la base : restaurez la sauvegarde du point 4.1, ou jouez le script de retour arrière de la migration concernée.
