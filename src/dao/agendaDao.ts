import { createServerSupabaseClient } from '@/config/supabase.server'
import { assertDatabaseSuccess } from '@/lib/databaseResult'
import { MAX_PERIOD_ROWS, periodBounds } from '@/lib/agenda'
import type { ConflictSummary } from '@/exception/SessionConflictError'
import type { SessionStatus } from '@/entities'
import type { SessionWithClient } from './sessionDao'
import { requireClient } from './requireClient'

export type Scope = 'ONE' | 'FOLLOWING' | 'ALL'
export interface SessionPatch { titre?: string; description?: string | null; notes?: string | null; date_heure?: string; duree_minutes?: number }
export interface RecurrenceInput {
  client_id: string; titre: string; description: string | null; duree_minutes: number; heure: string
  frequence: string; intervalle: number; jours: number[]; date_debut: string; date_fin: string | null
  nb_occurrences: number | null; on_conflict: 'REJECT' | 'SKIP'
}
export interface RecurrenceCreated { id: string; created: number; skipped: { date: string; reason: 'CONFLICT' }[] }

const SELECT = '*, clients(nom, prenom, telephone, avatar_url)'

/** Accès SQL de l'agenda : toute règle métier (conflits, version, portée) est appliquée dans les fonctions SQL atomiques. */
export const agendaDao = {
  async findByPeriod(coachId: string, o: { from: string; to: string; clientId?: string; statut?: SessionStatus; search?: string }): Promise<SessionWithClient[]> {
    const { start, end } = periodBounds(o.from, o.to)
    let query = createServerSupabaseClient().from('sessions').select(SELECT)
      .eq('coach_id', coachId).gte('date_heure', start).lt('date_heure', end)
    if (o.clientId) query = query.eq('client_id', o.clientId)
    if (o.statut) query = query.eq('statut', o.statut)
    if (o.search) query = query.ilike('titre', `%${o.search}%`)
    const { data, error } = await query.order('date_heure', { ascending: true }).order('id', { ascending: true }).limit(MAX_PERIOD_ROWS)
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionWithClient[]
  },

  async findConflicts(debut: string, duree: number, excludeId?: string): Promise<ConflictSummary[]> {
    const { data, error } = await createServerSupabaseClient().rpc('agenda_find_conflicts', { p_debut: debut, p_duree: duree, p_exclude: excludeId ?? null })
    assertDatabaseSuccess(error)
    return (data ?? []) as ConflictSummary[]
  },

  async conflictSummaries(ids: string[]): Promise<ConflictSummary[]> {
    if (!ids.length) return []
    const { data, error } = await createServerSupabaseClient().rpc('agenda_session_summaries', { p_ids: ids })
    assertDatabaseSuccess(error)
    return (data ?? []) as ConflictSummary[]
  },

  async update(id: string, expectedUpdatedAt: string, scope: Scope, patch: SessionPatch): Promise<{ updated: number }> {
    const { data, error } = await createServerSupabaseClient().rpc('agenda_update_session', {
      p_id: id, p_scope: scope, p_expected: expectedUpdatedAt, p_patch: patch,
    })
    assertDatabaseSuccess(error)
    return { updated: Number((data as { updated?: number } | null)?.updated ?? 0) }
  },

  async setStatus(id: string, statut: SessionStatus, scope: Scope): Promise<{ updated: number }> {
    const { data, error } = await createServerSupabaseClient().rpc('agenda_set_session_status', { p_id: id, p_statut: statut, p_scope: scope })
    assertDatabaseSuccess(error)
    return { updated: Number((data as { updated?: number } | null)?.updated ?? 0) }
  },

  async remove(id: string, scope: Scope): Promise<{ deleted: number }> {
    const { data, error } = await createServerSupabaseClient().rpc('agenda_delete_session', { p_id: id, p_scope: scope })
    assertDatabaseSuccess(error)
    return { deleted: Number((data as { deleted?: number } | null)?.deleted ?? 0) }
  },

  async createRecurrence(coachId: string, input: RecurrenceInput): Promise<RecurrenceCreated> {
    await requireClient(input.client_id, coachId)
    const { data, error } = await createServerSupabaseClient().rpc('agenda_create_recurrence', {
      p_client_id: input.client_id, p_titre: input.titre, p_description: input.description, p_duree: input.duree_minutes,
      p_heure: input.heure, p_frequence: input.frequence, p_intervalle: input.intervalle,
      p_jours: input.frequence === 'HEBDOMADAIRE' ? input.jours : null,
      p_date_debut: input.date_debut, p_date_fin: input.date_fin, p_nb: input.nb_occurrences, p_on_conflict: input.on_conflict,
    })
    assertDatabaseSuccess(error)
    return data as RecurrenceCreated
  },
}
