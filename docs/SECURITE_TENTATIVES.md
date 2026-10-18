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

## L'accès direct au Supabase : limité depuis le 18 octobre

Le service d'authentification du Supabase (`/auth/v1/token`) peut être appelé directement, sans passer par l'API de CoachSen, avec la clé publique `anon`. Mesure faite en production :

| | Avant | Après |
|---|---|---|
| 45 essais directs de mots de passe depuis une même IP | tous acceptés (aucune limite effective) | bloqués (429) à partir du 32e essai |
| Connexions normales par l'application | fonctionnent | fonctionnent (leur compteur est séparé) |

Réglages ajoutés au service d'authentification (voir `deploy/supabase/compose.yml`, appliqué par l'API de Coolify) :
- `GOTRUE_RATE_LIMIT_HEADER=X-Forwarded-For` : le compteur est tenu **par adresse IP réelle**, et non pour Kong (sans cela, tous les clients partageaient un seul compteur, ce qui permettait aussi de bloquer l'application en l'épuisant).
- `GOTRUE_RATE_LIMIT_TOKEN_REFRESH=30` : 30 connexions ou renouvellements de session par 5 minutes et par adresse IP (150 auparavant).
- `GOTRUE_PASSWORD_MIN_LENGTH=10` : même longueur minimale que l'application, y compris pour une inscription directe.

À savoir :
- L'API de CoachSen appelle le Supabase depuis **une seule adresse** : son compteur est partagé par tous les coachs, soit **30 connexions ou renouvellements par 5 minutes pour l'ensemble de l'application**. Suffisant pour des dizaines de coachs ; à relever (`GOTRUE_RATE_LIMIT_TOKEN_REFRESH`) quand l'usage grandit.
- Le nombre d'e-mails envoyés par le Supabase est plafonné à 30 par heure pour tous (`GOTRUE_RATE_LIMIT_EMAIL_SENT`, valeur par défaut) : à relever lors d'une vague d'inscriptions.
- Une attaque répartie sur beaucoup d'adresses IP reste possible contre les 40 essais quotidiens par compte de l'application, mais pas contre le Supabase en direct (limité par adresse seulement) : la clé `anon` n'est pas servie aux navigateurs, ce qui limite l'exposition.
- Pistes restantes, pour plus tard : faire parler l'API au Supabase par le réseau interne Docker et fermer `/auth/v1/token`, `/signup` et `/recover` depuis Internet ; régénérer la clé `anon` si elle a fuité (secret JWT du Supabase, puis variables GitHub et Coolify).
- Retour arrière : renvoyer le compose précédent par l'API de Coolify (retirer les trois lignes `GOTRUE_RATE_LIMIT_*` et `GOTRUE_PASSWORD_MIN_LENGTH`) puis redéployer.

## Réglages du Supabase à garder

- `ENABLE_PHONE_SIGNUP=false` : l'inscription par téléphone est fermée (sinon elle était ouverte et confirmée automatiquement). Vérifié : `phone_provider_disabled`.
- `ENABLE_EMAIL_AUTOCONFIRM=false` (par défaut) : les e-mails doivent être confirmés, ce qui exige l'envoi d'e-mails (SMTP) pour que les nouveaux coachs puissent se connecter.
