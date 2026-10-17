# CoachSen

Application de gestion pour coachs sportifs. Le serveur Next.js expose les API et conserve les accès Supabase. La migration de l'interface vers Angular se trouve dans `frontend/`.

## Développement Angular + API

Angular requiert Node.js `>=24.15.0 <25`. Sous Windows, `scripts/setup-node.ps1` installe la version prévue dans `.tools/` et vérifie le SHA-256 de l'archive. Les lanceurs ci-dessous utilisent automatiquement ce runtime lorsqu'il est présent.

1. Installer les dépendances à la racine avec `npm.cmd ci`.
2. Installer celles de `frontend/` avec `npm.cmd ci` depuis ce dossier, avec la version Node requise dans le `PATH`.
3. Copier `.env.example` vers `.env.local` et renseigner les paramètres Supabase du projet de test. La clé service-role reste exclusivement côté serveur.
4. Depuis la racine, lancer `node scripts/dev.mjs` pour démarrer Angular sur `http://127.0.0.1:4200` et l'API sur le port 3000.

Le proxy Angular transmet `/api` et `/auth` au serveur Next.js. Configurer les URL de retour Supabase pour l'origine Angular utilisée.

## Supabase Docker dédié à CoachSen

La configuration locale est dans `supabase/local.config.toml`. Elle utilise un projet Docker `coachsen-local`, distinct des autres applications, avec API sur 54421, PostgreSQL sur 54422, Studio sur 54423 et boîte e-mail locale sur 54424. La préparation copie les migrations validées dans un espace ignoré par Git, sans modifier les SQL sources.

```powershell
node scripts/prepare-local-supabase.mjs
npm.cmd exec --yes --package=supabase -- supabase start --workdir .tools/coachsen-local
```

Pour relier l'application, récupérer le statut JSON dans `.tools/coachsen-local/status.json` en UTF-8, puis exécuter `node scripts/connect-local-supabase.mjs`. Ce script vérifie l'adresse locale attendue, sauvegarde l'ancienne configuration dans `.env.before-docker.local` et ne publie aucune clé. Redémarrer ensuite `node scripts/dev.mjs`.

L'inscription locale est immédiatement utilisable, sans confirmation e-mail. `node scripts/smoke-local-supabase.mjs` crée un compte de démonstration local ou réutilise celui enregistré dans `.tools/coachsen-local/demo-access.json`, puis vérifie la connexion et les API métier réelles. Ce script refuse une configuration Supabase distante. Les données restent dans les volumes Docker après arrêt ; ne pas réinitialiser la base pour un simple redémarrage.

Le fonctionnement du CLI et des services locaux est décrit dans la [documentation officielle Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Commandes de vérification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
node scripts/angular.mjs build
```

Avec l'interface démarrée, `npx.cmd playwright test` exécute les tests navigateur existants. Ils simulent les réponses API d'authentification ; la recette connectée avec deux coachs reste distincte. Voir [la matrice de validation](docs/QUALITY_MIGRATION.md) pour les critères de parité et les vérifications SQL locales.

## Interface Next.js existante

Les instructions suivantes concernent l'interface Next.js conservée pendant la migration.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
## Getting Started
First, run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
