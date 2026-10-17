export type CronJob = 'session-reminders' | 'push-reminders' | 'maintenance'
export type CronRunInput = { job: CronJob; startedAt: Date; finishedAt?: Date; ok: boolean; checked?: number; sent?: number; failed?: number; error?: string | null }
export type CronLastRun = { job: string; last_run_at: string | null; last_ok: boolean | null }
export type CronJobHealth = { job: CronJob; last_run_at: string | null; last_ok: boolean | null; stale: boolean; max_age_minutes: number }

/** Retard maximal toléré par tâche (contrat B3) : push 5 min, WhatsApp 35 min, maintenance 26 h. */
export const CRON_MAX_AGE_MINUTES: Record<CronJob, number> = { 'push-reminders': 5, 'session-reminders': 35, maintenance: 26 * 60 }

/** Une tâche jamais exécutée est considérée en retard. */
export function computeCronHealth(rows: CronLastRun[], now = new Date()): { jobs: CronJobHealth[]; healthy: boolean } {
  const jobs = (Object.keys(CRON_MAX_AGE_MINUTES) as CronJob[]).map(job => {
    const row = rows.find(r => r.job === job)
    const last = row?.last_run_at ? new Date(row.last_run_at).getTime() : null
    const max = CRON_MAX_AGE_MINUTES[job]
    return {
      job, last_run_at: last === null ? null : new Date(last).toISOString(), last_ok: row?.last_ok ?? null,
      stale: last === null || now.getTime() - last > max * 60_000, max_age_minutes: max,
    }
  })
  return { jobs, healthy: jobs.every(j => !j.stale) }
}

/** Erreur courte et sans donnée sensible pour la colonne error. */
export const cronErrorLabel = (error: unknown): string =>
  error instanceof Error && /^[A-Z_]{3,40}$/.test(error.message) ? error.message : 'ECHEC_TRAITEMENT'
