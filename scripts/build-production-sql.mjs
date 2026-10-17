// scripts/build-production-sql.mjs
// Assemble, dans l'ordre, tout le SQL d'une base CoachSen NEUVE (Supabase dédié) en un seul fichier à coller dans
// Supabase Studio > SQL Editor, ou à passer à psql. Lit seulement les fichiers du dépôt : aucun accès réseau, aucune clé.
// Usage : node scripts/build-production-sql.mjs [sortie]   (défaut : deploy/coachsen-production.sql)
//
// Ordre identique à celui des migrations locales (scripts/prepare-local-supabase.mjs), plus le seau « avatars ».
// Le script de retour arrière de chaque migration est dans supabase/migrations/down/ : il n'est jamais inclus ici.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const out = new URL(process.argv[2] ?? 'deploy/coachsen-production.sql', root)
const files = [
  'schema.sql',
  'recurrences.sql',
  'migrations/add_progress_metrics.sql',
  'migrations/20260909_reliability.sql',
  'migrations/20261012_workout_logs.sql',
  'migrations/20261013_push_reminders.sql',
  'migrations/20261014_agenda.sql',
  'migrations/20261015_hardening.sql',
  'migrations/20261016_frequent_activity.sql',
  'storage.sql',
]
const parts = [`-- CoachSen : base de production NEUVE. Généré par scripts/build-production-sql.mjs.
-- À jouer UNE SEULE FOIS sur une base vide (Supabase dédié à CoachSen), après une sauvegarde.
-- Ne jamais le jouer sur la base d'une autre application.
`]
for (const file of files) {
  const text = await readFile(new URL('supabase/' + file, root), 'utf8')
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12)
  parts.push(`\n-- ===== ${file} (sha256 ${hash}) =====\n${text.trimEnd()}\n`)
}
await mkdir(dirname(fileURLToPath(out)), { recursive: true })
await writeFile(out, parts.join(''))
const total = parts.join('').length
console.log(`${files.length} fichiers assemblés (${(total / 1024).toFixed(0)} Ko) : ${fileURLToPath(out)}`)
