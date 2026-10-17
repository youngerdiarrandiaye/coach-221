import { fetchAll } from '@/server/pagination'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'
import { AppError } from '@/exception/AppError'
import { requireClient } from './requireClient'
import type { RecurrenceRow } from '@/entities'
import type { RecurrenceFormData } from '@/features/sessions/schemas'

export interface RecurrenceWithClient extends RecurrenceRow {
  clients: { nom: string; prenom: string }
}

export const sessionRecurrenceDao = {
  async createWithSessions(coachId: string, payload: RecurrenceFormData & { date_fin: string }): Promise<string> {
    await requireClient(payload.client_id, coachId)
    const { data, error } = await createServerSupabaseClient().rpc('create_session_recurrence', {
      p_client_id: payload.client_id, p_titre: payload.titre,
      p_description: payload.description || null, p_duree: Number(payload.duree_minutes),
      p_heure: payload.heure, p_jours: Array.from(new Set(payload.jours)),
      p_date_debut: payload.date_debut, p_date_fin: payload.date_fin,
    })
    if (error?.code === '22023') throw new AppError('Aucune s?ance future ou p?riode invalide. V?rifiez les dates et les jours s?lectionn?s.')
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as string
  },
  async findAll(coachId: string): Promise<RecurrenceWithClient[]> {
    const { data, error } = await fetchAll(createServerSupabaseClient().from('session_recurrences')
      .select('*, clients(nom, prenom)').eq('coach_id', coachId).order('created_at', { ascending: false }))
    assertDatabaseSuccess(error)
    return (data ?? []) as RecurrenceWithClient[]
  },
  async findById(id: string, coachId: string): Promise<RecurrenceWithClient | null> {
    const { data, error } = await createServerSupabaseClient().from('session_recurrences')
      .select('*, clients(nom, prenom)').eq('id', id).eq('coach_id', coachId).maybeSingle()
    assertDatabaseSuccess(error)
    return data as RecurrenceWithClient | null
  },
  async countUpcomingSessions(recurrenceId: string): Promise<number> {
    const { count, error } = await createServerSupabaseClient().from('sessions')
      .select('id', { count: 'exact', head: true }).eq('recurrence_id', recurrenceId)
      .eq('statut', 'PLANIFIEE').gt('date_heure', new Date().toISOString())
    assertDatabaseSuccess(error)
    return count ?? 0
  },
  async removeWithFutureSessions(id: string): Promise<void> {
    const { error } = await createServerSupabaseClient().rpc('delete_session_recurrence', { p_id: id })
    assertDatabaseSuccess(error)
  },
}
