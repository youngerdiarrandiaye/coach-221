# Lot « rapport mensuel et saisie vocale » : contrat

Décisions de l'utilisateur (16 octobre 2026) : envoi du rapport par **partage direct du PDF** depuis le téléphone (lien WhatsApp de 24 h en secours) ; voix = **dictée du navigateur + compréhension par IA côté serveur** ; les deux chantiers sont menés en parallèle.

Principes inchangés : `coachId` issu de la session, messages en français, thème sombre (noir, vert citron #c8f31d, blanc), Plus Jakarta Sans, Font Awesome, aucun emoji, aucun rouge ni orange, référence de simplicité Wave (voir `docs/CONTRAT_WAVE.md`), 3 clics, **le coach décide** : rien n'est jamais envoyé ni enregistré sans une action explicite du coach, jamais de succès affiché avant la confirmation du serveur. Base locale Docker seulement, aucune migration distante, aucun envoi réel (WhatsApp, notification, IA payante) pendant les tests, aucun secret affiché ni écrit dans un fichier suivi par git.

## A. Rapport mensuel de performance

### A1. Source unique des données (backend)
`GET exports/report/:id/data?month=AAAA-MM` → `{data:{client:{id, prenom, nom, objectif}, month, coach, kpis:{seances_effectuees, seances_planifiees, seances_annulees, taux_presence, volume_kg, series, records, poids_debut, poids_fin, delta_poids}, weeks:[{label, start, volume_kg, seances_effectuees}], poids:[{label, value}], mensurations:[{key, label, unit, debut, fin, delta}], records:[{exercice, type, value, date}]}}`.
- `weeks` : semaines ISO couvrant le mois (jours Dakar). `poids` : points mensuels des 6 derniers mois (moyenne du mois, mois sans mesure ignorés). `records` : records battus pendant le mois (1RM estimé, charge max, répétitions max) avec la valeur et la date.
- Fonction pure testable dans `src/lib` ; le PDF et l'aperçu écran utilisent **cette même source**.
- Isolation : client d'un autre coach = 404 ; mois invalide = 400.

### A2. PDF enrichi (backend)
`GET exports/report/:id?month=AAAA-MM&message=<texte>` : le PDF existant (bandeau CoachSen) est complété par : synthèse du mois (chiffres clés), **courbes en vectoriel** (poids sur 6 mois, volume par semaine, séances par semaine, évolution des mensurations), records battus, séances du mois, paiements du mois si utile, et un encadré **« Message de votre coach »** si `message` est fourni (texte brut, 600 caractères au plus, retours à la ligne conservés, jamais interprété comme du balisage). Pagination propre, pied de page, aucun texte coupé, jusqu'à 100 séances sans casser la mise en page. Garder les couleurs d'indication de zones de santé existantes.

### A3. Lien de secours (backend)
`POST exports/report/:id/share` conserve son comportement (lien WhatsApp valable 24 h). Définir le seau privé `exports` dans `supabase/storage.sql` (idempotent, accès réservé au service) ; le service de stockage est désactivé sur la base locale minimale : la route n'est donc vérifiable que par test avec un faux stockage, à signaler dans le rapport.

### A4. Interface (frontend)
Page `/progress/:clientId/rapport` refaite : choix du mois (mois précédent par défaut), **aperçu à l'écran** (chiffres clés, courbes avec les composants de graphique existants, records) construit depuis `exports/report/:id/data`, zone « Message du coach (facultatif) » avec une suggestion modifiable (par exemple « Bravo pour ce mois, … »), puis :
- **Envoyer** (action principale) : prépare le PDF (bouton désactivé « Préparation du PDF… » tant qu'il n'est pas prêt, afin de rester dans le geste de l'utilisateur) puis `navigator.share({files:[PDF], title, text})` ; si le partage de fichiers n'est pas disponible : téléchargement du PDF avec une explication claire et, en action secondaire, « Envoyer un lien WhatsApp (24 h) ». Annulation du partage par le coach = pas d'erreur.
- **Télécharger le PDF**.
Accès en **3 clics** depuis l'accueil : tuile « Voir la performance » → icône « Rapport » sur la carte du client dans la liste `/progress` → « Envoyer ». Ajouter aussi « Rapport du mois » sur la fiche de performance. Rien ne part sans action du coach ; états chargement, vide (mois sans donnée : message explicite et rapport tout de même possible), erreur avec « Réessayer ».

## B. Saisie vocale

### B1. Compréhension (backend)
`POST voice/parse` `{transcript: string (1 à 1000 caractères), intent?: "auto"|"client"|"payment"|"workout"|"measure"|"session"}` → `{data:{intent, confidence, source:"ai"|"rules", degraded:boolean, fields:{...}, missing:[...], client:{id, name}|null, candidates:[{id, name}], warnings:[...]}}`. **La route ne crée et ne modifie rien.**
- Intentions et champs : `client` {prenom, nom, telephone, email, objectif (PERTE_DE_POIDS|PRISE_DE_MASSE|CARDIO|TONIFICATION|REMISE_EN_FORME|REEDUCATION|AUTRE), sexe} ; `payment` {client_id, montant entier FCFA, methode (ESPECES|WAVE|ORANGE_MONEY), statut, date_paiement} ; `workout` {client_id, exercice, sets:[{reps, charge_kg, rpe}], log_date} ; `measure` {client_id, poids_kg, tour_taille_cm, masse_grasse_pct, ...} ; `session` {client_id, titre, date_heure, duree_minutes}.
- Dates relatives (« demain à 17 h », « lundi ») normalisées dans le fuseau Africa/Dakar à partir de la date du jour. Nombres en lettres français (« vingt-cinq mille », « cent kilos », « trois séries de huit ») et « 25 000 » comprise.
- Rapprochement des noms **uniquement** avec la liste des clients du coach connecté (sans accents ni casse) ; plusieurs possibilités = `client: null` et `candidates` renseignés ; jamais d'invention d'un client.
- IA : variable d'environnement `ANTHROPIC_API_KEY` (serveur seulement, jamais dans Angular ni dans un fichier suivi, jamais journalisée), modèle configurable par `VOICE_MODEL` (défaut : un petit modèle rapide). Sortie structurée validée par zod ; le transcript est une donnée non fiable (consigne d'extraction seule, aucune action, schéma strict). Délai maximal 8 s. **Sans clé ou en cas d'échec : repli sur un analyseur à règles** (`source: "rules"`, `degraded: true` si c'est un échec) qui comprend les phrases simples ; la route ne renvoie pas d'erreur pour cela.
- Aucune conservation ni journalisation du transcript ni de l'audio (seulement des compteurs). Limitation de débit : 30 par minute et 300 par jour par coach (message français, 429).
- Tests sans réseau : faux client IA injecté ; extraction par intention, rejet des sorties invalides, nombres en lettres, dates relatives, rapprochement et ambiguïté, repli sans clé, isolation entre coachs, limite de débit, aucune écriture en base, aucun secret dans les réponses.
- Le chemin IA réel n'est vérifiable qu'avec une clé : à signaler clairement dans le rapport (non vérifié si aucune clé n'est disponible localement).

### B2. Interface (frontend)
- Bouton micro dans la barre de recherche du haut (mobile et ordinateur), accessible. Feuille « Dictée » : écoute (animation discrète, arrêt automatique au silence, bouton Arrêter), transcript en direct, puis « Comprendre » si besoin.
- Dictée par `SpeechRecognition` / `webkitSpeechRecognition`, langue `fr-FR`. Navigateur sans dictée, micro refusé ou pas de HTTPS : message clair et zone de texte pour saisir ou dicter avec le clavier du téléphone, puis le même bouton « Comprendre ». La fonction reste donc utilisable partout.
- Résultat : carte « J'ai compris : … » (intention, champs reconnus, champs manquants signalés, choix du client par pastilles si ambiguïté), bouton « Remplir le formulaire » qui ouvre le formulaire concerné **prérempli** (service partagé de préremplissage lu par les formulaires client, paiement, séance, mesure et saisie d'entraînement) avec la note « Rempli à partir de votre voix. Vérifiez avant d'enregistrer. ». Le coach vérifie et enregistre lui-même : 3 clics (micro, « Remplir le formulaire », Enregistrer).
- Jamais de suppression, d'effacement ni de changement de statut par la voix. Mention de confidentialité claire dans la feuille (voix transcrite par le navigateur, texte analysé par un service d'IA, rien n'est enregistré sans validation).
- États : chargement, erreur (avec « Réessayer »), 429 avec délai, repli signalé discrètement quand la compréhension est approximative (`source: "rules"`).

## C. Responsabilités et fichiers
- Agent backend : `src/`, `supabase/`, `scripts/`, `tests/`, `package.json`, `.env.example`.
- Agent frontend « rapport » : page du rapport, accès depuis la liste de performance et la fiche performance, composant d'aperçu, `frontend/src/theme-report.css` (déjà branchée dans `angular.json`). Ne touche pas aux fichiers de l'agent « voix ».
- Agent frontend « voix » : feuille de dictée, bouton micro (barre de recherche : `navigation-tools.component.ts`), service de préremplissage, lecture du préremplissage dans les formulaires, `frontend/src/theme-voice.css` (déjà branchée). Ne touche pas aux fichiers de l'agent « rapport » (`export.page.ts`, `performance.page.ts`, `list.page.ts`).
- Fichiers partagés (`theme.css`, `app.component.ts`, `angular.json`, `package.json` frontend) : ne pas les modifier sans raison ; si indispensable, modification minimale et signalée dans le rapport.
- Recette : agent principal.
