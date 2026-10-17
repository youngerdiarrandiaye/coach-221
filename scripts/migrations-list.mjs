// Liste ordonnée des fichiers SQL d'une base CoachSen neuve (chemins relatifs à supabase/).
// Source unique : utilisée par scripts/migrate-production.mjs (application automatique au déploiement)
// et par scripts/build-production-sql.mjs (assemblage manuel). Ajouter une nouvelle migration À LA FIN uniquement.
// L'ordre est celui de scripts/prepare-local-supabase.mjs, avec le seau « avatars » (storage.sql) en dernier.
export const MIGRATIONS = [
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
