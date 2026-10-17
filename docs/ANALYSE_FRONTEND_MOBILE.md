# Analyse du frontend CoachSen

Analyse statique du code du 16 octobre 2026. Aucun écran n'a été lancé pour cette analyse : les comportements décrits sont ceux du code, et les limites visuelles restent à vérifier sur appareil.

## 1. Comment le frontend est construit

Le dépôt contient deux interfaces. `src/` conserve Next.js 14, React 18, Tailwind, des composants UI et des fonctionnalités métier. `frontend/` contient la migration Angular 22.1.6, décrite dans le README comme la nouvelle interface. Le serveur Next.js conserve les API et les accès Supabase. La présence d'un code ne prouve pas quelle version est déployée.

Dans Angular, le découpage est le suivant :

| Partie | Fichiers | Rôle |
| --- | --- | --- |
| Démarrage | `frontend/src/main.ts` | HTTP, routeur, navigation par ancres, service worker |
| Coque commune | `frontend/src/app/app.component.ts` | Sidebar, en-tête, recherche, contenu, menus mobile et bouton rapide |
| Routes | `frontend/src/app/app.routes.ts` | Pages publiques, espace connecté, pages chargées à la demande |
| Pages métier | `frontend/src/app/features/` | Accueil, clients, agenda, paiements, progression, statistiques, exports, profil |
| Services | `frontend/src/app/core/` | API, session, notifications, synchronisation, confidentialité, PWA |
| Composants partagés | `frontend/src/app/shared/` | Dialogues, agenda, graphiques, sélection de clients, voix, messages |
| Présentation | `styles.css`, `theme.css`, `theme-report.css`, `theme-voice.css` | Base, thème final, rapports et dictée |

Les composants sont standalone. Les signals portent notamment les états locaux et partagés. Certaines pages CRUD sont réutilisées avec `data.kind` dans les routes : cela réduit la duplication, mais concentre plusieurs responsabilités dans `list.page.ts`, `edit.page.ts` et `detail.page.ts`. L'agenda dispose d'un ensemble plus spécialisé, avec store, API, modèles et composants dédiés.

Le service `Api` consomme `/api/v1/` et extrait l'enveloppe `{ data }`. Le guard `authenticated` vérifie la session avant d'ouvrir la coque. Cette protection d'interface ne remplace pas les autorisations serveur et Supabase.

## 2. Identité visuelle réellement utilisée

Le rendu final prévu est sombre, avec accent citron, surfaces arrondies et police Plus Jakarta Sans. Les icônes viennent de Font Awesome. Les fichiers de police sont chargés depuis les dépendances locales.

Attention : `styles.css` contient encore une base claire vert/crème. `angular.json` charge ensuite `theme.css`, qui impose le thème sombre et surcharge de nombreuses règles. Lire uniquement le CSS de base donnerait donc une analyse incorrecte.

Les variables finales comprennent notamment `--bg: #0a0a0a`, `--surface: #121212`, `--surface-2: #1b1b1b`, `--accent: #c8f31d`. Les panneaux, badges, boutons, listes et graphiques partagent des conventions visuelles. Les montants sont formatés en FCFA sans décimales et les dates utilisent `Africa/Dakar` dans les utilitaires Angular.

## 3. Menus : deux présentations d'un même espace

Sur ordinateur, la sidebar verticale présente Vue d'ensemble, Clients, Séances, Paiements, Progression, Statistiques et Exports. Elle mesure 248 px dans la base et 216 px à partir du seuil de réduction à 1150 px. Le profil et la déconnexion sont accessibles dans l'en-tête. Un bouton flottant ouvre `/workouts/new`.

À **800 px et moins**, le thème masque la sidebar et le bouton flottant général. Il affiche une barre fixe à cinq positions :

| Position | Destination ou action |
| --- | --- |
| Accueil | `/dashboard` |
| Clients | `/clients` |
| Bouton central + | `/workouts/new`, saisie d'entraînement |
| Séances | `/sessions`, agenda |
| Plus | Ouvre la feuille des services secondaires |

Le bouton + n'est pas un menu de création universel : il déclenche une saisie précise. L'agenda possède sa propre action Ajouter une séance.

La feuille Plus contient Paiements, Progression, Statistiques, Exports, Récurrences, Mon profil et Rappels, ainsi que l'installation lorsque disponible et la déconnexion. Elle occupe au maximum 80 vh, défile et présente de grandes lignes tactiles. Un fond assombri la sépare du contenu.

Son état est partagé via `MoreSheet`. Elle se ferme au clic extérieur, avec Échap, après sélection d'un lien et lors des événements du routeur. Elle déclare `role="dialog"`, `aria-modal`, un titre et un état `aria-expanded` sur le déclencheur. `FocusTrap` place le focus dans la feuille, boucle Tab et restaure le focus à la fermeture.

Le choix réutilisable est la hiérarchie : destinations fréquentes au pouce, action principale au centre, services moins fréquents dans Plus. Les destinations doivent être adaptées au métier du nouveau projet.

## 4. Mobile : une composition spécifique

Le mobile ne se contente pas de réduire les dimensions du bureau :

- En-tête compact et sticky avec marque et profil ; plusieurs textes secondaires disparaissent.
- Navigation basse à cibles de 56 px et bouton principal de 60 px.
- Marges horizontales du contenu de 16 px ; formulaires et détails sur une colonne.
- Espacement inférieur du contenu de `104px + safe-area-inset-bottom` pour éviter la barre fixe.
- Adaptation aux zones sûres de l'écran via `env(safe-area-inset-*)`.
- Accueil mobile avec montant masquable, actions directes, activité récente et clients fréquents.
- Séances du jour présentées dans un carrousel horizontal avec scroll snap ; une carte suivante dépasse pour signaler le défilement.
- Barre de prochaine séance au-dessus du menu, avec réserve inférieure portée à 164 px lorsque présente.
- Plusieurs indicateurs et listes deviennent des groupes de lignes séparées plutôt qu'une mosaïque de cartes.
- Toasts déplacés au-dessus du menu ; dialogues et panneaux utilisent des couches supérieures.

Le seuil principal est 800 px. Des ajustements supplémentaires existent à 1150, 900, 700, 600, 430 et 380 px selon les composants. Les règles finales doivent être lues dans leur ordre de cascade ; chaque seuil ne représente pas un mode global distinct.

## 5. Confort d'utilisation et réseau

La recherche globale attend deux caractères et temporise les appels de 250 ms. Un compteur de version empêche une réponse ancienne de remplacer la recherche récente. Chargement, absence de résultats, erreur et nouvelle tentative sont prévus.

La PWA prévoit manifest, icônes et service worker ; l'installation n'est proposée que si le navigateur émet l'événement adapté. Les requêtes `/api/` et `/auth/` ne sont pas mises en cache par le service worker. Une file séparée stocke localement les entraînements en attente, avec propriétaire et identifiant d'idempotence. Il existe donc bien du stockage local métier : « API non cachées » ne signifie pas « aucune donnée personnelle sur l'appareil ».

Le code comprend lien d'évitement, focus visible, libellés accessibles et réduction des animations avec `prefers-reduced-motion`.

## 6. Points à améliorer ou à contrôler avant réutilisation

1. **Cascade CSS coûteuse à maintenir.** Le thème accumule des surcharges et des sélecteurs `:root:root`, parfois davantage. Pour un nouveau projet, partir directement des tokens finaux et de styles par composant réduira les conflits.
2. **Navigation dupliquée.** Les liens desktop, mobile et Plus sont définis séparément. Un registre commun de routes avec une priorité mobile éviterait les divergences.
3. **Feuille modale incomplète côté arrière-plan.** Le focus clavier est piégé, mais la feuille Plus ne montre pas de verrouillage explicite du défilement du document ni de mise en inertie du contenu extérieur. Vérifier tactile et lecteur d'écran.
4. **Changement de largeur avec Plus ouvert.** La feuille est masquée par CSS au-dessus de 800 px, tandis que son état peut rester ouvert. Vérifier et réinitialiser l'état au changement de mode si nécessaire.
5. **État actif des services secondaires.** Le bouton Plus reflète l'ouverture de la feuille ; il ne reflète pas explicitement la route Paiements ou Statistiques. Ajouter un repère de section si cela aide l'orientation.
6. **Empilement des éléments fixes.** Tester menu, prochaine séance, bouton agenda, clavier virtuel, toast et dialogue ensemble, particulièrement en paysage et à fort zoom.
7. **Typage et taille des pages.** `Row` est très générique et certains composants embarquent de grands templates. Des modèles métier et des composants plus petits faciliteront l'évolution.
8. **Recette nécessaire.** Les tests navigateur présents couvrent des parcours et utilisent des API simulées ; leur présence ne prouve pas qu'ils passent. `navigation.spec.mjs` vise surtout recherche et notifications, pas une recette complète de la barre mobile.

## 7. Vérifications de cette analyse

Lecture croisée des manifests, du README, du démarrage, des routes, de la coque, des styles dans leur ordre de chargement, des outils de navigation, de la gestion du focus, du service worker, de la file hors ligne et des tests de navigation. Une revue indépendante a été confiée à un agent pour le mobile et les menus. Aucun code applicatif ni changement local préexistant n'a été modifié. Aucun test navigateur ni audit de contraste n'a été exécuté pour cette livraison documentaire.

Le skill portable correspondant est dans `../skills/mobile-app-navigation/SKILL.md`.

Le lien profil mobile affiche une initiale sans nom accessible explicite : ajouter un aria-label adapt? lors de la r?utilisation. Le skill est livr? dans le d?p?t, sans installation globale. Sa validation automatique est bloqu?e par la d?pendance Python PyYAML absente ; les champs YAML et le contenu ont ?t? contr?l?s manuellement.
