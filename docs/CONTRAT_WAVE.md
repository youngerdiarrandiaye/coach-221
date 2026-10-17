# Lot « simplicité façon Wave » : contrat backend / frontend

Référence produit fournie par l'utilisateur (14 octobre 2026) : l'application Wave, comparée pour sa prise en main en 3 clics. Principes à retenir et à toujours appliquer à CoachSen :

1. **Un chiffre en grand, masquable** (œil) : la confidentialité d'un montant compte quand on tient son téléphone devant quelqu'un.
2. **Une action principale par écran**, très visible.
3. **Grille de 8 icônes** (4 colonnes × 2), libellés courts ; le dernier est « Plus » et ouvre une **feuille basse** « Plus de services ».
4. **Les favoris d'abord** (personnes et services les plus utilisés), puis la liste complète avec une **recherche en haut** (« Chercher par nom »).
5. **Fil d'activité sur l'accueil** : nom, date en gris, montant signé à droite (+ reçu, − sorti).
6. Sections titrées en blocs arrondis, zones tactiles généreuses, très peu de texte.

Le design reste celui de CoachSen (thème sombre, 3 couleurs : noir, vert citron, blanc, police Plus Jakarta Sans, Font Awesome, aucun emoji). Mêmes règles qu'avant : `coachId` issu de la session, messages en français, aucune migration distante, base locale seulement, aucun envoi réel, le coach décide des statuts, jamais de succès affiché avant la confirmation du serveur.

## 1. Backend

### W1. Clients fréquents
`GET clients/frequent?limit=6` (1 à 12, sinon 400) → `{data:[{id, prenom, nom, objectif, score, last_activity_at}]}`.
- Classement sur les 90 derniers jours : séances non annulées ×1, paiements ×2, saisies d'entraînement ×2 (une saisie = les séries enregistrées ensemble), départage par activité la plus récente.
- Clients actifs seulement. Les clients sans activité complètent la liste jusqu'à `limit`, du plus récemment créé au plus ancien (score 0, `last_activity_at` null) : un client tout juste ajouté apparaît aussitôt et un nouveau compte voit quand même des propositions.
- Fonction SQL `clients_frequent` (SECURITY INVOKER, filtres sur `auth.uid()`), rapide (index existants), isolation entre coachs testée.

### W2. Fil d'activité
`GET activity?limit=15` (1 à 50) → `{data:[{type, id, client_id, client, title, amount, pending, at, href}]}` du plus récent au plus ancien, sur 60 jours :
- `payment` : paiements. `amount` = montant en FCFA entier positif ; `pending: true` pour « En attente » ; les paiements annulés sont exclus. `title` = mode de paiement lisible (« Wave », « Espèces », « Orange Money »).
- `session` : séances **effectuées** (`title` = titre de la séance, `amount` null), à la date de la séance.
- `workout` : saisies d'entraînement (`title` = « Squat, 3 séries », `amount` null).
- `href` : chemin d'écran Angular (`/payments/<id>`, `/sessions/<id>`, `/clients/<id>/performance`).
Aucun détail d'un autre coach ; client archivé affiché normalement.

### W3. Outillage
Migration idempotente `supabase/migrations/20261016_frequent_activity.sql` + retour arrière documenté dans `supabase/migrations/down/`, ajout à `scripts/prepare-local-supabase.mjs`, types, tests (PGlite avec les vrais fichiers SQL : classement, repli, limites, isolation entre deux coachs, exclusion des annulés, nombre maximal), route dans le routeur avec la limitation de débit déjà en place. Les 114 tests existants restent verts (`npm test`, qui lance les fichiers l'un après l'autre).

## 2. Frontend (`frontend/`)

- **Accueil mobile façon Wave** :
  - En-tête : « Encaissements du mois » en grand avec un œil pour masquer/afficher les montants (préférence mémorisée dans le navigateur avec gestion d'erreur du stockage ; **masqué par défaut** : points « ••••• » ; le masquage s'applique aux montants de l'accueil, du fil d'activité et de la liste des paiements) ; service `Privacy` partagé.
  - Action principale : les séances du jour restent l'élément central (« Saisir l'entraînement »).
  - Grille 4 × 2 : Saisie, Paiement, Séance, Mesure, Client, Progrès, Agenda, **Plus** ; « Plus » ouvre la feuille basse « Plus de services » (Statistiques, Exports, Récurrences, Profil, Rappels) en réutilisant la feuille du shell (service partagé pour l'ouvrir de l'accueil et de la barre du bas), accessible (dialogue, focus, Échap).
  - **Activité récente** : fil construit avec `GET activity` : pastille ronde (initiale ou icône), titre, client et date en gris, montant à droite avec signe (« +25 000 F » en vert citron pour un paiement reçu, « En attente » sinon, rien pour une séance ou une saisie), chaque ligne ouvre son écran ; « Tout voir » vers /payments ; état de chargement, vide et erreur explicites.
- **Favoris d'abord partout** : chaque sélecteur de client (formulaires paiement, séance, mesure, récurrence, saisie d'entraînement, création rapide de l'agenda) montre d'abord les `clients/frequent` en pastilles (libellé « Fréquents »), puis un champ « Chercher par nom » pour tous les autres clients (liste complète au clavier). Avec plus de 8 clients, les 3 clics restent tenus grâce aux fréquents. Aucune régression de la saisie assistée existante.
- **Recherche en tête des listes** : libellé et texte indicatif « Chercher par nom » en haut des listes clients, paiements, séances.
- **Paiements** : liste précédée du total du mois en grand, masquable avec le même œil.
- **Fiche performance d'un client** : deux grandes actions côte à côte (« Saisir un entraînement » en principal, « Ajouter une mesure »), façon « Recharger / Retirer ».
- **Tests navigateur** : ordre des fréquents, repli, masquage mémorisé et appliqué, fil d'activité (signes, liens, états), feuille « Plus », parcours des 3 clics avec plus de 8 clients (créer des clients de test « Test wave »), balayage mobile sans débordement (comparer à la largeur d'écran fixe, pas à `innerWidth`), audit axe-core sans violation, non-régression des parcours existants.

## 3. Responsabilités
- Backend : `src/`, `supabase/`, `scripts/`, `tests/`, `package.json`.
- Frontend : `frontend/`.
- Recette : agent principal.
