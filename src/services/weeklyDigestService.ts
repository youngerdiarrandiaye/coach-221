// Envoi du résumé hebdomadaire aux clients. Sans accès direct à la base ni au réseau : tout passe par `deps`
// (src/server/weeklyDigest.ts branche les vrais appels ; les tests, des faux).
import type { WeekDigest as Week } from '@/lib/clientDigest'
import { buildDigestMail, hasDigestContent, type DigestMail } from '@/lib/weeklyDigestMail'

export interface DigestAccount { user_id: string; client_id: string; coach_id: string }

export interface DigestData {
  prenom: string
  coach: string | null
  weeks: Week[]
  upcoming: { titre: string; date_heure: string; duree_minutes: number }[]
}

export interface WeeklyDigestDeps {
  /** Comptes à servir : résumé activé et pas déjà envoyé pour cette semaine, au plus `limit`. */
  due(weekStart: string, limit: number): Promise<DigestAccount[]>
  emailOf(userId: string): Promise<string | null>
  load(account: DigestAccount): Promise<DigestData>
  send(to: string, mail: DigestMail): Promise<void>
  markSent(userId: string, weekStart: string): Promise<void>
  spaceUrl: string
}

export interface DigestRun { week: string; checked: number; sent: number; skipped: number; failed: number }

/** Lundi (AAAA-MM-JJ) de la semaine qui contient `day`. */
export function mondayOf(day: string): string {
  const ms = Date.parse(day + 'T00:00:00Z')
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
}

/** Nombre maximal de clients par passage ; la tâche repasse toutes les heures le lundi et reprend là où elle s'est arrêtée. */
export const DIGEST_BATCH = 100

/**
 * Résume la dernière semaine terminée. Un client est marqué « envoyé » seulement après l'envoi réussi : un échec
 * (serveur d'e-mail indisponible) sera retenté au passage suivant, et jamais deux e-mails pour la même semaine.
 * Un client sans activité ni séance à venir est marqué sans e-mail (pas de message vide).
 */
export async function runWeeklyDigest(deps: WeeklyDigestDeps, today: string, batch = DIGEST_BATCH): Promise<DigestRun> {
  const thisWeek = mondayOf(today)
  const run: DigestRun = { week: '', checked: 0, sent: 0, skipped: 0, failed: 0 }
  const accounts = await deps.due(thisWeek, batch)
  for (const account of accounts) {
    run.checked++
    try {
      const data = await deps.load(account)
      // weeks[0] = semaine en cours (lundi d'aujourd'hui) ; weeks[1] = dernière semaine terminée.
      const week = data.weeks.find(w => w.start < thisWeek) ?? null
      if (!week) { run.skipped++; await deps.markSent(account.user_id, thisWeek); continue }
      run.week = week.start
      const previousWeek = data.weeks.find(w => w.start < week.start) ?? null
      const email = await deps.emailOf(account.user_id)
      if (!email || !hasDigestContent({ week, upcoming: data.upcoming })) { run.skipped++; await deps.markSent(account.user_id, thisWeek); continue }
      await deps.send(email, buildDigestMail({ prenom: data.prenom, coach: data.coach, week, previousWeek, upcoming: data.upcoming, spaceUrl: deps.spaceUrl }))
      await deps.markSent(account.user_id, thisWeek)
      run.sent++
    } catch {
      // Jamais de détail dans le journal : ni adresse, ni contenu.
      run.failed++
    }
  }
  return run
}
