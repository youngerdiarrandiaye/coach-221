import { fetchAll } from '@/server/pagination'
import { assertDatabaseSuccess } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { ClientRow, PaymentRow, ProgressEntryRow, RecurrenceRow, SessionRow, WorkoutLogRow, CoachNoteRow } from '@/entities'

export type ClientExportData = {
  client: ClientRow
  sessions: SessionRow[]
  payments: PaymentRow[]
  progress: ProgressEntryRow[]
  workouts: (WorkoutLogRow & { exercice: string | null })[]
  recurrences: RecurrenceRow[]
  notes: CoachNoteRow[]
}

export type ClientDefaults = {
  last_payment: { montant: number; methode: string; statut: string; date_paiement: string } | null
  last_session: { titre: string; duree_minutes: number; date_heure: string } | null
  last_progress: Record<string, unknown> | null
}

export type FrequentClient = { id: string; prenom: string; nom: string; objectif: string | null; score: number; last_activity_at: string | null }
export type ActivityItem = {
  type: 'payment' | 'session' | 'workout'; id: string; client_id: string; client: string; title: string
  amount: number | null; pending: boolean; at: string; href: string
}

/** Toutes les lectures sont limitées au client ET au coach de la session (en plus de la RLS). */
export const clientDataDao = {
  async exportAll(clientId: string, coachId: string, client: ClientRow): Promise<ClientExportData> {
    const sb = createServerSupabaseClient()
    const read = async <T>(table: string, select = '*', order = 'created_at') => {
      const query = sb.from(table).select(select).eq('coach_id', coachId).eq('client_id', clientId).order(order, { ascending: true })
      const { data, error } = await fetchAll(query as unknown as Parameters<typeof fetchAll>[0])
      assertDatabaseSuccess(error)
      return (data ?? []) as T[]
    }
    const [sessions, payments, progress, logs, recurrences, notes] = await Promise.all([
      read<SessionRow>('sessions', '*', 'date_heure'), read<PaymentRow>('payments', '*', 'date_paiement'),
      read<ProgressEntryRow>('progress_entries', '*', 'mesure_date'),
      read<WorkoutLogRow & { exercises: { nom: string } | null }>('workout_logs', '*, exercises(nom)', 'log_date'),
      read<RecurrenceRow>('session_recurrences'), read<CoachNoteRow>('coach_notes'),
    ])
    const workouts = logs.map(({ exercises, ...log }) => ({ ...log, exercice: exercises?.nom ?? null }))
    return { client, sessions, payments, progress, workouts, recurrences, notes }
  },

  /** Fonction SQL client_defaults : une seule requête ; client d'un autre coach = CS404 (404). */
  async defaults(clientId: string): Promise<ClientDefaults> {
    const { data, error } = await createServerSupabaseClient().rpc('client_defaults', { p_client_id: clientId })
    assertDatabaseSuccess(error)
    return data as ClientDefaults
  },

  async sessionTitles(limit: number): Promise<string[]> {
    const { data, error } = await createServerSupabaseClient().rpc('session_title_suggestions', { p_limit: limit })
    assertDatabaseSuccess(error)
    return ((data ?? []) as { titre: string }[]).map(r => r.titre)
  },

  /** Fonction SQL clients_frequent : clients actifs du coach connecté, du plus fréquent au moins fréquent. */
  async frequent(limit: number): Promise<FrequentClient[]> {
    const { data, error } = await createServerSupabaseClient().rpc('clients_frequent', { p_limit: limit })
    assertDatabaseSuccess(error)
    return (data ?? []) as FrequentClient[]
  },

  /** Fonction SQL activity_feed : paiements, séances effectuées et saisies des 60 derniers jours. */
  async activity(limit: number): Promise<ActivityItem[]> {
    const { data, error } = await createServerSupabaseClient().rpc('activity_feed', { p_limit: limit })
    assertDatabaseSuccess(error)
    return (data ?? []) as ActivityItem[]
  },

  async erase(clientId: string, confirmation: string): Promise<Record<string, number>> {
    const { data, error } = await createServerSupabaseClient().rpc('erase_client_data', { p_client_id: clientId, p_confirmation: confirmation })
    assertDatabaseSuccess(error)
    return (data ?? {}) as Record<string, number>
  },
}
