# Kit thèmes CoachSen

Tout ce qu'il faut pour reprendre l'apparence de CoachSen dans une autre application : les **3 thèmes** (Nuit citron, Corail, Lagon), les couleurs prêtes à copier, le code de changement de thème, des écrans de référence en captures, et les autres briques réutilisables (message, confirmation, graphique, PDF, application installable).

Ouvrez **`index.html`** dans votre navigateur pour voir le tout d'un coup d'œil (palettes et captures).

```
kit-themes/
  index.html          galerie visuelle : palettes + toutes les captures
  tokens/
    themes.css        LES 3 THÈMES en variables CSS + une petite base (carte, bouton, champ, puce)  ← à copier en premier
    tokens.json       les mêmes valeurs en JSON (pour Flutter, React Native, Figma, etc.)
  code/               fichiers de CoachSen donnés comme exemples (Angular) : thème, message, confirmation, graphique, PDF, PWA
  screens/            captures (mobile 390 px et ordinateur 1280 px) dans les 3 thèmes, plus rapports PDF et composants
```

## 1. Les trois thèmes

| | Nuit citron | Corail | Lagon |
|---|---|---|---|
| Ambiance | sombre, vert citron | clair, rose et orange | sombre, anthracite et turquoise |
| Idéal | en salle de sport | en plein jour | net et reposant |
| Fond `--bg` | `#0a0a0a` | `#fbf6f8` | `#0c0d0e` |
| Cartes `--surface` | `#121212` | `#ffffff` | `#161819` |
| Champs `--surface-2` | `#1b1b1b` | `#f7eef2` | `#1e2123` |
| Bordures `--edge` | `#2a2a2a` | `#eadde4` | `#2c3133` |
| Texte `--text` | `#f2f2f2` | `#1d1620` | `#f2f5f6` |
| Texte secondaire `--soft` | `#9b9b9b` | `#7d6f78` | `#8f9c9f` |
| **Accent `--accent`** | **`#c8f31d`** | **`#ff1f6b`** | **`#5fc9d2`** |
| Texte sur accent `--on-accent` | `#0a0a0a` | `#ffffff` | `#062a2e` |
| Dégradé `--grad` | (aplat) | rose → orange `#ff1f6b → #ff6a4d → #ff9f43` | turquoise foncé `#3b8a92 → #2b6870` |

Règles de lisibilité à garder : le texte posé sur l'accent est toujours `--on-accent` (sombre sur citron et turquoise, blanc sur rose) ; l'accent n'est jamais utilisé comme couleur de texte sur fond blanc.

## 2. Mettre les thèmes dans une autre application (5 minutes)

1. **Copier** `tokens/themes.css` dans votre projet et le charger.
2. **Utiliser les variables** partout (`background: var(--surface)`, `color: var(--accent)`…) : plus aucune couleur écrite en dur.
3. **Changer de thème** en posant `data-theme="corail"` ou `"lagon"` sur `<html>` (rien pour Nuit citron). Le fichier `code/theme-switch.js` le fait pour vous et mémorise le choix sur l'appareil ; `code/theme.service.ts` est la version Angular (service avec un signal).
4. **Barre du navigateur** : dans `index.html`, `<meta name="theme-color" content="#0a0a0a">` et `<meta name="color-scheme" content="dark">` ; le script les met à jour à chaque changement.
5. **Police** : Plus Jakarta Sans (`npm i @fontsource/plus-jakarta-sans`, puis importer les graisses 400 à 800).

Pour un **nouveau thème** : dupliquez un bloc de `themes.css`, changez `data-theme` et les 9 valeurs de couleur, et vérifiez le contraste du texte sur `--accent`.

Autres applications que le web : `tokens/tokens.json` contient les mêmes valeurs (Flutter, React Native, Figma Tokens…).

## 3. Écrans de référence

Chaque écran existe dans les trois thèmes (`screens/<thème>-<format>-<écran>.png`) :

| Écran | Fichier (exemple Nuit citron) |
|---|---|
| Connexion | `nuit-mobile-connexion.png` |
| Accueil du coach (encaissements, aujourd'hui, prochaine séance) | `nuit-mobile-accueil.png`, `nuit-bureau-accueil.png` |
| Liste des clients | `nuit-mobile-clients.png` |
| Fiche client | `nuit-mobile-fiche-client.png` |
| Performance (volume, séances, records) | `nuit-mobile-performance.png` |
| Agenda | `nuit-mobile-agenda.png`, `nuit-bureau-agenda.png` |
| Paiements en FCFA | `nuit-mobile-paiements.png` |
| Espace client (lecture seule) | `nuit-mobile-espace-client.png`, `nuit-mobile-espace-progression.png` |
| Apparence (choix du thème) | `nuit-mobile-profil-apparence.png` |
| Menu « Plus » | `nuit-mobile-menu-plus.png` |
| Rapport mensuel PDF | `nuit-pdf-rapport.png`, `corail-pdf-rapport.png`, `lagon-pdf-rapport.png` |
| Composants | `composant-confirmation.png`, `composant-dictee.png` |

## 4. Composants et briques réutilisables (dossier `code/`)

| Brique | Fichiers | À retenir |
|---|---|---|
| Choix du thème | `theme-picker.component.ts`, `theme.service.ts` | 3 aperçus cliquables, un clic |
| Messages (toasts) | `toast.service.ts`, `toast-host.component.ts` | succès / information / erreur, bouton d'action (« Réessayer »), un message de même clé remplace l'ancien |
| Confirmation avant action sensible | `confirm.service.ts`, `confirm-host.component.ts` | suppression, annulation : une fenêtre demande toujours de confirmer, avec la conséquence en une phrase |
| Graphique léger | `perf-chart.component.ts` | barres ou courbe en SVG pur, sans bibliothèque, suit les couleurs du thème |
| PDF aux couleurs du thème | `pdf-palette.ts` | fond blanc, seul le bandeau, l'accent et les gris changent ; demande `?theme=corail` |
| Application installable (PWA) | `manifest.webmanifest`, `service-worker.js` | hors ligne, mise à jour à chaque déploiement, alertes et pastille sur l'icône |
| CSS complet des thèmes | `theme-nuit-base.css`, `theme-corail.css`, `theme-lagon.css` | **exemples** : très liés aux composants de CoachSen (64 Ko). La base portable est `tokens/themes.css` |

## 5. Principes de conception à reprendre

- **Trois clics au maximum** pour toute action courante (encaisser, noter une séance, ajouter un client). Les actions répétitives sont automatisées.
- **Montants en FCFA**, masquables d'un bouton quand un client regarde l'écran.
- **Confirmer avant toute action sensible** (suppression, retrait d'accès, effacement), avec la conséquence expliquée.
- **Cibles tactiles de 48 px** minimum, barre du bas fixe sur téléphone, barre du haut fixe.
- **Un message d'erreur dit quoi faire**, jamais un code technique.
- **Le coach garde la main** : rien n'est enregistré sans validation (dictée, IA).
- **Mises à jour sans friction** : à chaque déploiement, l'application installée propose « Actualiser » et rien n'est perdu.

## 6. Reprendre les mêmes thèmes sur les PDF

Les PDF suivent le thème choisi : le bandeau d'en-tête prend la couleur de marque, le fond reste blanc pour l'impression. `code/pdf-palette.ts` contient les trois palettes (couleurs RVB) et la fonction `paletteFor(theme)`. Les autres couleurs (gris, filets) sont calculées pour garder un bon contraste sur papier.

## 7. Limites

- Les captures utilisent des **données de démonstration** fictives (clients, montants).
- Les fichiers de `code/` sont ceux de CoachSen (Angular, Next.js) : à adapter à votre technologie. Seuls `tokens/` et `theme-switch.js` sont indépendants d'un framework.
- Les icônes viennent de Font Awesome (`@fortawesome/fontawesome-free`), à installer séparément.
