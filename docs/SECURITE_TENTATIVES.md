# Limitation des tentatives et mots de passe

Rédigé le 18 octobre 2026. Vérifié en production le même jour.

## Ce qui protège aujourd'hui

| Protection | Règle | Où |
|---|---|---|
| Connexion | 10 tentatives par 10 minutes, par adresse IP **et** par compte | `src/lib/rateLimit.ts` (`RATE_RULES.login`) |
| Connexion, plafond quotidien | 40 tentatives par jour et par compte : freine une attaque répartie sur de nombreuses IP | `RATE_RULES.loginDay` |
| Inscription | 5 par heure et par IP | `RATE_RULES.register` |
| Mot de passe oublié, renvoi de confirmation | 5 par heure, par IP et par e-mail | `RATE_RULES.reset` |
| Exports, saisie vocale, écritures | plafonds par minute, heure ou jour | `RATE_RULES.*` |
| Mot de passe | 10 caractères minimum, 128 au plus ; refus des mots de passe courants, des suites et répétitions, et de ceux bâtis sur le nom ou l'e-mail | `src/features/auth/passwordPolicy.ts` |

- Les compteurs sont en base (fonction de fiabilisation) ; l'identité (IP, e-mail) y est **hachée**, jamais stockée en clair.
- Au-delà de la limite : réponse 429 avec le délai à attendre ; le formulaire affiche le décompte et n'envoie plus rien avant la fin.
- La limitation est « ouverte » par défaut : si la base des compteurs est indisponible, la requête passe (et un message est écrit dans le journal), pour ne pas bloquer tous les coachs.
- **Vérifié en production** : avec des adresses IP falsifiées (en-tête `X-Forwarded-For`) et des e-mails tous différents, la 6e demande de « mot de passe oublié » est bloquée. L'adresse IP n'est donc pas falsifiable à travers Traefik et Nginx.
- `RATE_LIMIT_DISABLED=1` désactive tout : réservé aux tests, **jamais en production**.

## Le point faible connu : l'accès direct au Supabase

Le service d'authentification du Supabase (`/auth/v1/token`) n'a **aucune limite de tentatives de son côté** : 40 essais directs de mots de passe ont tous été acceptés lors du test. Le limiteur de l'application ne le protège pas, car un attaquant qui parle au Supabase directement ne passe pas par l'API de CoachSen.

Ce qui limite le risque aujourd'hui : cet accès exige la clé `anon`, que le site Angular ne sert jamais (il ne parle qu'à l'API de CoachSen). Mais une clé `anon` n'est pas conçue pour rester secrète : si elle fuit, la limitation disparaît.

Pistes de durcissement, à traiter avant une ouverture large :
1. Limiter `/auth/v1/token`, `/signup`, `/recover` et `/otp` au niveau de Kong (plugin `rate-limiting`). **Prérequis** : que Kong voie la vraie adresse IP du client (`KONG_TRUSTED_IPS` et `KONG_REAL_IP_HEADER`), faute de quoi tous les clients partagent un seul compteur et un attaquant bloquerait l'application.
2. Faire parler l'API de CoachSen au Supabase par le réseau interne Docker, puis fermer ces routes depuis Internet (seuls `/auth/v1/verify` pour les liens de confirmation, et les images publiques du stockage doivent rester accessibles).
3. Régénérer la clé `anon` (donc le secret JWT du Supabase) si elle a été exposée, en la changeant aussi dans les variables GitHub et Coolify.

## Réglages du Supabase à garder

- `ENABLE_PHONE_SIGNUP=false` : l'inscription par téléphone est fermée (sinon elle était ouverte et confirmée automatiquement). Vérifié : `phone_provider_disabled`.
- `ENABLE_EMAIL_AUTOCONFIRM=false` (par défaut) : les e-mails doivent être confirmés, ce qui exige l'envoi d'e-mails (SMTP) pour que les nouveaux coachs puissent se connecter.
