import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDatabaseSuccess } from '@/lib/databaseResult'
import type { CronLastRun, CronRunInput } from '@/lib/cronRuns'

/** Enregistre une exécution. Ne lève jamais : le suivi ne doit pas changer le comportement ni la réponse d'une tâche. */
export async function recordCronRun(sb: SupabaseClient, run: CronRunInput): Promise<void> {
  try {
    const { error } = await sb.from('cron_runs').insert({
      job: run.job, started_at: run.startedAt.toISOString(), finished_at: (run.finishedAt ?? new Date()).toISOString(),
      ok: run.ok, checked: run.checked ?? 0, sent: run.sent ?? 0, failed: run.failed ?? 0, error: run.error ?? null,
    })
    if (error) console.error('[cron] suivi non enregistré')
  } catch { console.error('[cron] suivi non enregistré') }
}

export async function lastCronRuns(sb: SupabaseClient): Promise<CronLastRun[]> {
  const { data, error } = await sb.rpc('cron_last_runs')
  assertDatabaseSuccess(error)
  return ((data ?? []) as { job: string; last_run_at: string | null; last_ok: boolean | null }[])
}

export async function purgeMaintenance(sb: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await sb.rpc('maintenance_purge')
  assertDatabaseSuccess(error)
  return (data ?? {}) as Record<string, number>
}
