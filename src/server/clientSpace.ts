// Espace client : lecture seule des performances, des statistiques et des rapports du client connecté.
//
// Sécurité : le client et le coach viennent TOUJOURS du compte (table client_accounts, lue avec la session du client,
// que le RLS limite à sa propre ligne), jamais de l'adresse ou du corps de la requête. Les données du coach étant
// fermées au compte d'un client, la lecture s'exécute avec le client à droits complets, restreint ici à ce seul client.
// Rien n'est modifiable depuis cet espace, et seules les colonnes utiles au client sont renvoyées (pas de notes du coach).
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { createServerSupabaseClient, runWithElevatedClient } from '@/config/supabase.server'
import { clientDao } from '@/dao/clientDao'
import { profileDao } from '@/dao/profileDao'
import { progressDao } from '@/dao/progressDao'
import { sessionDao } from '@/dao/sessionDao'
import { workoutDao } from '@/dao/workoutDao'
import { buildJournal, buildWeeks } from '@/lib/clientDigest'
import { coachLabel } from '@/lib/coachName'
import { dakarToday } from '@/lib/workoutMath'
import { handleReport } from './reportExports'
import { reportDeps as coachReportDeps } from './exports'
import type { ReportDeps } from './reportExports'
import { handleTraining } from './training'
import { z } from 'zod'
import { HttpError, readJson, success } from './http'

export interface ClientAccount { client_id: string; coach_id: string; user_id?: string; weekly_digest?: boolean }

/** Le compte client de l'utilisateur connecté (sa propre ligne, grâce au RLS), ou null : ce n'est pas un client. */
export async function findOwnAccount(userId: string): Promise<ClientAccount | null> {
  const { data, error } = await createServerSupabaseClient().from('client_accounts').select('user_id, client_id, coach_id, weekly_digest').eq('user_id', userId).maybeSingle()
  if (error) throw new HttpError(500, 'DATABASE_ERROR', 'Service indisponible.')
  return data as ClientAccount | null
}

/** Rapport du client : comme celui du coach, mais sans la section des paiements (l'espace client ne montre que les performances). */
const reportDeps: ReportDeps = { ...coachReportDeps, load: async (coachId, clientId, month) => { const source = await coachReportDeps.load(coachId, clientId, month); return { ...source, pdf: { ...source.pdf, payments: [] } } } }

const methodError = () => { throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.') }
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** Requête interne pour réutiliser les gestionnaires existants : seuls les paramètres listés ici sont transmis. */
const internal = (path: string, params: Record<string, string>) => new Request(`http://internal/api/v1/${path}?${new URLSearchParams(params)}`)

async function dataOf(response: Response): Promise<unknown> { return (await response.json() as { data: unknown }).data }

export async function overview(account: ClientAccount) {
  const { client_id: clientId, coach_id: coachId } = account
  const today = dakarToday()
  const [client, profile, progressRows, sessionRows, logs, week, month, records] = await Promise.all([
    clientDao.findById(clientId, coachId), profileDao.findById(coachId), progressDao.findByClient(clientId, coachId),
    sessionDao.findByClient(clientId, coachId), workoutDao.listRawLogs(coachId, { clientId }),
    handleTraining(internal('analytics', { clientId, period: 'week' }), ['analytics'], coachId).then(dataOf),
    handleTraining(internal('analytics', { clientId, period: 'month' }), ['analytics'], coachId).then(dataOf),
    handleTraining(internal('records', { clientId }), ['records'], coachId).then(dataOf),
  ])
  if (!client) throw new HttpError(404, 'NOT_FOUND', 'Espace introuvable.')

  const measures = progressRows.map(p => ({
    mesure_date: String(p.mesure_date).slice(0, 10), poids_kg: p.poids_kg, imc: p.imc,
    tour_taille_cm: p.tour_taille_cm ?? null, hanches_cm: p.hanches_cm ?? null, bras_cm: p.bras_cm ?? null, cuisse_cm: p.cuisse_cm ?? null,
    masse_grasse_pct: p.masse_grasse_pct ?? null, frequence_cardiaque_repos_bpm: p.frequence_cardiaque_repos_bpm ?? null, frequence_cardiaque_effort_bpm: p.frequence_cardiaque_effort_bpm ?? null,
  }))
  const sessions = sessionRows.map(s => ({ date_heure: s.date_heure, statut: s.statut, titre: s.titre, duree_minutes: s.duree_minutes }))
  const nowMs = Date.now()
  const startMs = (s: { date_heure: string }) => Date.parse(s.date_heure)
  const upcoming = sessions.filter(s => s.statut === 'PLANIFIEE' && startMs(s) >= nowMs).sort((a, b) => startMs(a) - startMs(b)).slice(0, 3)
  const done = sessions.filter(s => s.statut === 'EFFECTUEE').length
  const missed = sessions.filter(s => s.statut === 'PLANIFIEE' && startMs(s) < nowMs).length
  const digestLogs = logs.map(l => ({ log_date: String(l.log_date).slice(0, 10), exercice_id: l.exercice_id, reps: l.reps, charge_kg: l.charge_kg }))
  const digestMeasures = measures.map(m => ({ mesure_date: m.mesure_date, poids_kg: m.poids_kg == null ? null : Number(m.poids_kg) }))
  const digestSessions = sessions.map(s => ({ date_heure: s.date_heure, statut: s.statut as 'PLANIFIEE' | 'EFFECTUEE' | 'ANNULEE', titre: s.titre, duree_minutes: s.duree_minutes }))

  // Mois ayant des données, du plus récent au plus ancien (pour choisir le rapport à ouvrir).
  const months = Array.from(new Set([
    ...measures.map(m => m.mesure_date.slice(0, 7)), ...sessions.map(s => s.date_heure.slice(0, 7)), ...digestLogs.map(l => l.log_date.slice(0, 7)),
  ])).filter(m => MONTH.test(m)).sort().reverse().slice(0, 12)

  return {
    client: { prenom: client.prenom, nom: client.nom, objectif: client.objectif, taille_cm: client.taille_cm, poids_initial_kg: client.poids_initial_kg, depuis: client.created_at },
    coach: profile ? coachLabel(profile.prenom, profile.nom) : null,
    measures, upcoming,
    attendance: { done, missed, rate: done + missed > 0 ? Math.round(done / (done + missed) * 100) : null },
    analytics: { week, month }, records,
    weeks: buildWeeks({ today, sessions: digestSessions, logs: digestLogs, measures: digestMeasures }),
    journal: buildJournal({ today, sessions: digestSessions, logs: digestLogs, measures: digestMeasures }),
    months,
    settings: { weekly_digest: account.weekly_digest ?? true },
  }
}

const settingsSchema = z.object({ weekly_digest: z.boolean('Valeur invalide.') })

/** me/overview, me/report?month= (PDF), me/report/data?month= (JSON) : lecture seule. me/settings (PUT) : seule écriture, l'envoi du résumé hebdomadaire. */
export async function handleClientSpace(request: Request, path: string[], account: ClientAccount): Promise<Response> {
  const [, section, operation] = path
  if (section === 'settings' && path.length === 2) {
    if (request.method !== 'PUT') return methodError()
    const { weekly_digest } = settingsSchema.parse(await readJson(request))
    if (!account.user_id) throw new HttpError(403, 'FORBIDDEN', 'Accès refusé.')
    const { error } = await createAdminSupabaseClient().from('client_accounts').update({ weekly_digest }).eq('user_id', account.user_id)
    if (error) throw new HttpError(500, 'DATABASE_ERROR', 'Service indisponible.')
    return success({ weekly_digest })
  }
  if (request.method !== 'GET') return methodError()
  return runWithElevatedClient(createAdminSupabaseClient(), async () => {
    if (section === 'overview' && path.length === 2) return success(await overview(account))
    if (section === 'report' && (path.length === 2 || (path.length === 3 && operation === 'data'))) {
      const params = new URL(request.url).searchParams
      // Seuls le mois et le thème sont transmis : pas de message libre imprimé dans le PDF, jamais d'identifiant venant de la requête.
      const forwarded: Record<string, string> = {}
      const month = params.get('month'); if (month !== null) forwarded['month'] = month
      const theme = params.get('theme'); if (theme !== null) forwarded['theme'] = theme
      return handleReport(internal('exports/report', forwarded), account.client_id, operation, account.coach_id, reportDeps)
    }
    throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
  })
}
