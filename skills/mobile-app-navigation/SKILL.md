---
name: mobile-app-navigation
description: Adapter une interface applicative aux mobiles avec sidebar desktop, barre de navigation basse, action principale et feuille Plus, selon les principes de CoachSen. Utiliser pour reproduire cette organisation dans un autre projet en adaptant ses routes et son identité.
---

# Navigation applicative mobile

Conserver le framework, le métier et les choix du projet cible. Reproduire les principes de CoachSen sans imposer Angular ni copier son backend.

## Examiner le projet

Lire la coque, les routes, les composants et les styles dans leur ordre réel de chargement. Identifier les destinations fréquentes, l'action principale et les services secondaires. Préserver les modifications locales. Distinguer inspection du code et comportement vérifié dans un navigateur.

Créer une configuration de navigation commune : route, libellé, icône, priorité mobile, règle d'état actif. Adapter les destinations au métier. Les permissions de présentation ne remplacent jamais les contrôles serveur.

## Composer les menus

Sur ordinateur : sidebar persistante, en-tête et contenu. Sur mobile : en-tête compact et barre fixe basse. CoachSen bascule à 800 px ; adapter ce seuil au projet.

La référence possède cinq positions : Accueil, Clients, action principale centrale, Séances, Plus. Le bouton central ouvre une saisie d'entraînement précise ; choisir l'action équivalente du nouveau produit. Adapter le nombre de positions aux parcours plutôt que copier ces libellés.

Regrouper les destinations secondaires dans Plus. Préserver les URL et les parcours sur tous les écrans. Représenter les sous-routes et les sections secondaires dans les états actifs ; Plus ne doit pas indiquer seulement son ouverture si cela empêche de comprendre la section courante.

## Feuille Plus

Réutiliser le dialogue accessible du projet si disponible. Prévoir titre, role dialog, aria-modal, aria-expanded sur le déclencheur, focus initial, boucle Tab, Échap et retour du focus. Fermer après navigation et au clic sur le fond ; prévoir une commande de fermeture accessible.

Verrouiller le défilement du fond et rendre le contenu extérieur inerte pendant l'ouverture. Restaurer ces états à la fermeture. Fermer ou convertir la feuille lors du passage au mode desktop pour éviter un dialogue caché encore actif.

Repères CoachSen : lignes tactiles de 56 px, coins supérieurs arrondis, hauteur maximale de 80 vh, défilement interne. Adapter au zoom et au clavier virtuel.

## Réorganiser le contenu mobile

Prioriser information essentielle, prochaine action et activité récente. Transformer les grilles denses en listes et les formulaires en une colonne. Conserver accessibles les informations masquées de la vue principale.

Viser des cibles d'au moins 44 px. Ne pas réduire systématiquement le texte pour tout faire tenir. Prévenir les débordements avec min-width:0, minmax(0,1fr) et retours à la ligne appropriés. Réserver le défilement horizontal aux contenus pertinents ; un carrousel peut laisser dépasser la carte suivante pour signaler la suite.

Prendre en compte env(safe-area-inset-bottom) et la zone sûre supérieure. Réserver dans le contenu les hauteurs cumulées des éléments fixes. CoachSen utilise 104 px plus la zone sûre pour le menu seul et 164 px avec la prochaine séance ; recalculer ces valeurs selon le projet. Placer les toasts au-dessus du menu et les dialogues au-dessus des éléments fixes. Tester paysage et clavier virtuel.

## Présentation et états

Utiliser les tokens du projet : fond, surfaces, textes, bordures, accent, rayons et espacements. Si la même identité est demandée, CoachSen emploie #0a0a0a, surfaces #121212/#1b1b1b, accent #c8f31d, Plus Jakarta Sans et Font Awesome. Sinon conserver l'identité cible.

Construire directement le thème final ; éviter les couches contradictoires et les sélecteurs de spécificité croissante observés dans CoachSen. Préserver focus visible, noms accessibles des boutons à icône et prefers-reduced-motion. Donner au lien profil un nom complet même si seul l'avatar est visible.

Prévoir chargement, vide, erreur, nouvelle tentative et soumission en cours. Pour une recherche asynchrone, temporiser si nécessaire et empêcher les réponses obsolètes d'écraser les résultats récents.

PWA, dictée et file hors ligne sont facultatives selon le besoin. Une file nécessite propriétaire, politique de conservation et idempotence serveur. Ne pas cacher les réponses authentifiées dans un cache générique ni exposer de clé serveur dans le navigateur.

## Vérification et livraison

Vérifier à 320, 375/390, 430, 800, 801 et environ 1280 px, en ajustant les deux largeurs autour du seuil retenu. Contrôler absence de débordement global, dernier élément visible, sous-routes, feuille Plus, focus et clavier, changement de largeur avec feuille ouverte, zoom, paysage et éléments fixes simultanés. Essayer noms et montants longs.

Exécuter les vérifications adaptées au projet et les tests navigateur disponibles sur les comportements modifiés. Rapporter les changements, les contrôles réellement exécutés et les limites ; ne pas présenter une lecture statique comme une recette sur téléphone.
