import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const local = new URL('.tools/coachsen-local/supabase/', root)
await mkdir(new URL('migrations/', local), { recursive: true })
await writeFile(new URL('config.toml', local), await readFile(new URL('supabase/local.config.toml', root)))
// Copies numérotées : la CLI conserve l'historique et n'applique chaque fichier qu'une fois.
const files = [
  ['20260909000100_schema.sql', 'schema.sql'],
  ['20260909000200_recurrences.sql', 'recurrences.sql'],
  ['20260909000300_progress_metrics.sql', 'migrations/add_progress_metrics.sql'],
  ['20260909000400_reliability.sql', 'migrations/20260909_reliability.sql'],
  ['20261012000100_workout_logs.sql', 'migrations/20261012_workout_logs.sql'],
  ['20261013000100_push_reminders.sql', 'migrations/20261013_push_reminders.sql'],
  ['20261014000100_agenda.sql', 'migrations/20261014_agenda.sql'],
  ['20261015000100_hardening.sql', 'migrations/20261015_hardening.sql'],
  ['20261016000100_frequent_activity.sql', 'migrations/20261016_frequent_activity.sql'],
]
for (const [target, source] of files) {
  const content = await readFile(new URL('supabase/' + source, root))
  const destination = new URL('migrations/' + target, local)
  let previous
  try { previous = await readFile(destination) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (previous && !previous.equals(content)) throw new Error(`Migration locale déjà préparée et différente : ${target}. Créez une nouvelle migration.`)
  await writeFile(destination, content)
}
console.log('Supabase CoachSen préparé dans .tools/coachsen-local (API 54421, Studio 54423).')
