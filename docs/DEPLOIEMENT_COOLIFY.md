# Déployer CoachSen sur le VPS (Coolify), à côté de l'app de stock

Rédigé le 17 octobre 2026. Rien n'a été déployé : ce document et les fichiers du dossier `deploy/` préparent la mise en ligne.
Complète `docs/MISE_EN_LIGNE.md` (variables, base, tâches planifiées, recette), qui suppose Vercel : ici, tout est sur le VPS.

## 1. Architecture : deux applications, rien en commun

| | App de stock (existante) | CoachSen (nouvelle) |
|---|---|---|
| Projet Coolify | le sien | **un projet « CoachSen » séparé** |
| Base de données | son Supabase actuel | **un Supabase dédié à CoachSen** (nouveau service Coolify) |
| Réseau Docker | le sien | `coachsen_net` (voir `deploy/docker-compose.yml`) |
| Domaine | le sien | un sous-domaine à part (ex. `coachsen.votredomaine.com`) |
| Secrets | les siens | de nouvelles valeurs (clé de service, JWT, VAPID, `CRON_SECRET`) |
| Ports publiés sur l'hôte | ceux déjà utilisés | **aucun** : Coolify (Traefik) route le domaine vers le conteneur `web` |

Ne pas réutiliser le Supabase de l'app de stock : dans Supabase, la table des utilisateurs (`auth.users`) est partagée par toute l'instance. Les coachs de CoachSen se mélangeraient aux utilisateurs du stock, avec une même clé de service qui voit tout. Une instance dédiée évite cela.

Conteneurs de CoachSen (`deploy/docker-compose.yml`) :
- `web` : site Angular (Nginx). C'est le seul exposé. Il transmet `/api/*` et `/auth/*` à `api` : le navigateur ne parle qu'à un seul domaine, donc les cookies de session restent valables.
- `api` : l'API Next.js. Interne. Elle détient la clé de service Supabase (jamais envoyée à Angular).
- `scheduler` : remplace les tâches planifiées de Vercel (rappels push chaque minute, rappels WhatsApp toutes les 15 minutes, maintenance à 03:00). Interne ; Nginx renvoie 404 sur `/api/cron/*` côté public.
- Plafonds de ressources : 768 Mo et 1 CPU pour l'API, pour ne pas priver l'app de stock.

## 2. Avant de commencer : l'état du serveur

Sur le VPS (en SSH), à me communiquer sans mot de passe ni clé :

```
free -h && df -h / && docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Un Supabase auto-hébergé complet demande environ 2 Go de mémoire libre en plus de l'existant. Si le serveur est juste, la base de CoachSen peut être un projet Supabase Cloud séparé (rien d'autre ne change dans ce document).

## 3. Étapes

1. **Sauvegarder** d'abord l'existant : un instantané du VPS chez l'hébergeur et un `pg_dump` du Supabase de l'app de stock.
2. **Coolify** : créer le projet « CoachSen » ; y ajouter un service **Supabase** (nouvelle instance, ses propres mots de passe générés). Lui donner un domaine, ex. `supa-coachsen.votredomaine.com`. Noter l'URL, la clé `anon` et la clé `service_role`.
3. **Base** : jouer, sur une copie de test d'abord, `supabase/schema.sql`, `recurrences.sql`, `storage.sql`, puis `supabase/migrations/*` dans l'ordre (voir MISE_EN_LIGNE.md §4). Puis `node scripts/setup-storage.mjs` pour les seaux de stockage.
4. **Auth Supabase** : Site URL = l'adresse du site ; Redirect URL = `https://coachsen.votredomaine.com/auth/callback` ; expéditeur d'e-mail configuré.
5. **Application** : dans le projet CoachSen, ajouter une ressource « Docker Compose » depuis le dépôt Git, fichier **`deploy/docker-compose.prod.yml`** (images prêtes, publiées par le pipeline : le VPS ne compile rien). Domaine HTTPS sur le service `web`, port 80. Variables en plus de celles du §6 : `GHCR_OWNER` (votre compte ou organisation GitHub, en minuscules). Le fichier `deploy/docker-compose.yml` (avec compilation sur place) sert aux essais en local.
   Les images sont privées sur GHCR : sur le VPS, `docker login ghcr.io` avec un jeton GitHub limité à `read:packages` (ou rendre les paquets publics : ils ne contiennent aucun secret).
6. **Variables** (onglet Environment de Coolify, jamais dans Git) : celles du tableau de MISE_EN_LIGNE.md §3. Valeurs neuves : `CRON_SECRET` aléatoire long, clés VAPID neuves (`node -e "console.log(require('web-push').generateVAPIDKeys())"`), `FRONTEND_ORIGIN` = `https://coachsen.votredomaine.com`. **`RATE_LIMIT_DISABLED` ne doit pas exister.**
7. **Déployer**, puis la recette de MISE_EN_LIGNE.md §8 (connexion, séance, PDF, rappels, second coach isolé).
8. **Surveillance et sauvegardes** : sauvegarde quotidienne programmée de la base CoachSen (Coolify) ; contrôle externe sur `/api/cron/health` avec le jeton.

## 3 bis. Pipeline GitHub Actions (`.github/workflows/deploy.yml`)

À chaque envoi sur `main` : 1) `ci.yml` (types, lint, tests, compilation Angular) ; 2) construction de trois images (`api`, `web`, `scheduler`) et publication sur GHCR, étiquetées `latest` et par l'identifiant du commit ; 3) le pipeline fixe la variable `IMAGE_TAG` dans Coolify, ordonne le déploiement par l'API de Coolify, puis attend que `/` et `/api/v1/auth/session` répondent 200 (5 minutes au plus). Si une étape échoue, rien de la suite ne part.

À créer dans GitHub (Settings du dépôt) :

| Où | Nom | Valeur |
|---|---|---|
| Secrets | `COOLIFY_URL` | adresse de Coolify, ex. `https://coolify.votredomaine.com` (adresse de votre Coolify) |
| Secrets | `COOLIFY_APP_UUID` | identifiant de la ressource CoachSen (dans son URL Coolify) |
| Secrets | `COOLIFY_API_TOKEN` | jeton créé dans Coolify (Keys & Tokens > API tokens), droit de déploiement seulement |
| Variables | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` | valeurs publiques du Supabase de CoachSen et adresse du site (clé `anon` uniquement) |
| Environments | `production` | facultatif : exiger une validation manuelle avant chaque déploiement |

Aucune clé de service, clé VAPID ni `CRON_SECRET` dans GitHub : elles restent dans Coolify. Dans Coolify, activer l'API (Settings > Advanced > API Access).

À vérifier au premier déploiement (je n'ai pas pu l'essayer sans accès à votre Coolify) : que l'appel qui fixe `IMAGE_TAG` est accepté par la version 4.4.3, et que les conteneurs repartent bien sur la nouvelle étiquette. Sinon, définir `IMAGE_TAG` à la main dans Coolify puis lancer « Deploy ».

## 4. Retour arrière

Les deux applications étant séparées, couper CoachSen (arrêter le projet Coolify) ne touche pas l'app de stock. Revenir à une version précédente : dans Coolify, mettre `IMAGE_TAG` sur l'identifiant (7 caractères) d'un commit précédent (chaque image est conservée sous cette étiquette), puis « Redeploy ». Pour la base : restaurer la sauvegarde du §3.1 ou le script `supabase/migrations/down/`.

## 5. Sécurité

- Un mot de passe d'administration Coolify a été écrit dans une conversation : le changer, activer la double authentification, et n'utiliser que des clés SSH pour `root` (désactiver la connexion SSH par mot de passe).
- N'ouvrir que les ports 80, 443 et SSH sur le pare-feu du VPS ; ne pas publier les ports de Postgres.
