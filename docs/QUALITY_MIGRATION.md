# Validation de la migration Angular

Responsabilité : agent qualité, en collaboration avec les responsables frontend et backend.
La présence d'une route ne prouve pas sa parité fonctionnelle. Les parcours connectés doivent être vérifiés sur une base de test dédiée avec deux coachs.

## Matrice de parité : 26 pages Next.js

| Route | Contrôle de réception Angular |
| --- | --- |
| `/` | Présentation, liens connexion/inscription, adaptation mobile |
| `/login` | Connexion, erreur explicite, session renouvelée, retour espace coach |
| `/register` | Validation, création, confirmation email sans fuite de compte |
| `/check-email` | Instructions confirmation et retour connexion |
| `/reset-password` | Demande de lien, comportement cohérent connecté/déconnecté |
| `/update-password` | Session de récupération, confirmation, changement effectif |
| `/dashboard` | Chiffres exacts, séances planifiées, aucun mélange de coachs |
| `/clients` | Liste, recherche, filtres, archivage et erreurs de chargement |
| `/clients/new` | Champs, validation serveur, enregistrement unique |
| `/clients/:id` | Coordonnées, séances, paiements et progression du bon client |
| `/clients/:id/edit` | Modification conservée après rechargement |
| `/sessions` | Liste/calendrier, filtres, statuts, dates Dakar |
| `/sessions/new` | Client propriétaire, horaire, durée et validation |
| `/sessions/:id` | Détail, statut, suppression contrôlée |
| `/sessions/:id/edit` | Modification horaire sans décalage de fuseau |
| `/sessions/recurrences` | Création atomique et suppression conservant historique |
| `/payments` | Filtres, tri et sommes limitées aux statuts pertinents |
| `/payments/new` | FCFA entiers, mode, date, client propriétaire, double clic |
| `/payments/:id` | Montant/statut exacts et reçu PDF |
| `/payments/:id/edit` | Mise à jour et invalidation des statistiques |
| `/progress` | Sélection client et état vide |
| `/progress/:clientId` | Mesures, graphiques, création/modification/suppression |
| `/progress/:clientId/rapport` | Mois, données cohérentes, PDF et partage |
| `/stats` | Revenus, activité, rétention bornée et périodes Dakar |
| `/export` | CSV/JSON/PDF complets et limités au coach connecté |
| `/profile` | Coordonnées, préférences, avatar et déconnexion |

## Critères transversaux bloquants

- L'API retourne du JSON avec un statut HTTP correct, sans redirection HTML vers la connexion.
- Les mutations avec cookies refusent les origines étrangères ; les contrôles serveur restent indépendants des guards Angular.
- L'identifiant coach vient de la session vérifiée, jamais du corps fourni par le navigateur.
- Un identifiant de client, paiement, séance ou rapport d'un autre coach ne permet aucune lecture ni écriture.
- Les erreurs de base ne sont jamais présentées comme des listes vides ou des écritures réussies ; les détails SQL/secrets ne sont pas renvoyés au navigateur.
- Montants FCFA strictement entiers, positifs et dans la capacité SQL ; ni arrondi silencieux ni notation exponentielle dans les formulaires.
- Une mutation ne doit pas être rejouée automatiquement après une réponse réseau incertaine ; bloquer les doubles soumissions côté interface.
- Dates métier en `Africa/Dakar`, conservation des statuts et invalidation des agrégats après mutation.
- Aucun secret Supabase service-role ou WhatsApp dans les fichiers Angular distribués.
- Chargement, erreur, état vide, clavier et affichage mobile vérifiés sur chaque module.

## Vérifications locales reproductibles

`npm test` exécute les validations métier et PostgreSQL via PGlite. La suite SQL charge les vrais fichiers du dépôt, applique deux fois la migration de fiabilité, puis vérifie les politiques RLS avec deux coachs, les clés étrangères composites, les transactions des récurrences, les revenus et les réservations de rappels. Elle n'accède pas à Supabase distant.

`npm run typecheck` vérifie le frontend Next et le serveur. `npm run lint` vérifie les règles existantes. La compilation Next de production ne doit pas partager `.next` avec un serveur de développement actif.

Une compilation Angular et ses tests sont requis avant bascule. Les tests de helpers ou les réponses HTTP anonymes ne remplacent pas les parcours navigateur authentifiés ni une validation de l'application effective des migrations SQL distantes.

## Scénario de recette avant bascule

### État local au 12 septembre 2026

- `npm.cmd test` : 29 tests réussis, aucun échec, dont migrations exécutées dans PGlite, isolation de deux coachs et validation du protocole multipart pour l'avatar.
- `npm.cmd run typecheck` et `npm.cmd run lint` : réussis côté Next.js/serveur.
- `node scripts/angular.mjs build` : compilation de production réussie, bundle initial de 280,90 Ko (budget avertissement : 700 Ko). Sous le bac à sable Windows, les lectures des dossiers parents étaient refusées ; la validation a nécessité une exécution autorisée hors bac à sable.
- `node node_modules/@playwright/test/cli.js test` : 13 tests navigateur réussis avec API simulée : authentification, recherche (dont réponses obsolètes), notifications, photo de profil et conservation après erreur, séances du client et préremplissage, neuf mesures et affichage mobile. Le débordement du libellé masqué des tableaux a été corrigé en le contenant dans la zone de défilement.
- Pages Angular tableau de bord/statistiques et exports, ainsi que styles globaux, ajoutés pour résoudre les références de fichiers absentes. Les téléchargements et données réels restent à vérifier en recette connectée.
- Les quatre écarts précédemment identifiés sont implémentés : recherche multi-entités et notifications des séances dans les deux prochaines heures ; envoi de photo de profil ; graphique chronologique et historique des neuf mesures ; prochaines séances du client et création préremplie.
- Les notifications sont chargées à l'ouverture puis actualisables manuellement. Les graphiques présentent une mesure à la fois, sans superposition. La fiche client filtre les séances futures planifiées et les trie par date ; un client fourni dans l'URL de création n'est présélectionné que s'il figure dans la liste autorisée retournée par l'API.
- Les erreurs d'envoi de photo conservent l'image précédente. Le serveur refuse les médias non multipart (415) et les formulaires multipart malformés (400), conserve la validation des formats et tailles, et déduit toujours le coach de la session.
- Ces résultats locaux ne valident ni les parcours Supabase réels ni la parité complète. `storage.sql` n'est pas exécuté par la suite SQL actuelle.

### Recette connectée

Blocage constaté le 12 septembre : l'hôte Supabase configuré dans `.env.local` renvoie une erreur DNS NXDOMAIN, également hors bac à sable, alors que `supabase.com` se résout. La référence du projet dans la clé publique correspond à celle de l'URL. L'inscription réelle reste bloquée jusqu'au rétablissement du projet ou à la configuration d'un projet actif. Les pannes réseau d'authentification sont maintenant traduites en HTTP 503 avec un message français, au lieu de HTTP 400. Aucun compte réel n'a été créé pendant ce diagnostic.

1. Sur Supabase de test, créer deux coachs et un client chacun, puis appliquer les migrations documentées.
2. Coach A : créer séance, série et paiement ; recharger et vérifier montants, horaires, statistiques et reçu.
3. Coach B : soumettre les identifiants du coach A sur chaque API ; aucune donnée ni modification ne doit être obtenue.
4. Tester expiration session, rafraîchissement, déconnexion et récupération de mot de passe.
5. Couper l'API pendant une écriture : erreur visible, aucune fausse confirmation ni répétition automatique.
6. Vérifier exports, PDF, mobile et clavier ; comparer chaque ligne de la matrice à Next avant activation générale.
