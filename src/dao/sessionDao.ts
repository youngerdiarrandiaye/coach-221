import { fetchAll } from '@/server/pagination'
import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { SessionRow } from '@/entities'
import { getStartOfWeek, getEndOfWeek } from '@/utils/date'
import { requireClient } from './requireClient'

export type SessionWithClient = SessionRow & {
  clients: { nom: string; prenom: string; telephone: string; avatar_url: string | null }
}

export const sessionDao = {
  async countThisWeek(coachId: string): Promise<number> {
    const supabase = createServerSupabaseClient()
    const { count, error } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .gte('date_heure', getStartOfWeek().toISOString())
      .lte('date_heure', getEndOfWeek().toISOString())
    assertDatabaseSuccess(error)
    return count ?? 0
  },

  async countUpcoming(coachId: string): Promise<number> {
    const supabase = createServerSupabaseClient()
    const { count, error } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .eq('statut', 'PLANIFIEE')
      .gt('date_heure', new Date().toISOString())
    assertDatabaseSuccess(error)
    return count ?? 0
  },

  async findAll(
    coachId: string,
    options?: { search?: string; clientId?: string; statut?: SessionRow['statut']; sort?: 'newest' | 'oldest' },
  ): Promise<SessionWithClient[]> {
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('sessions')
      .select('*, clients(nom, prenom, telephone, avatar_url)')
      .eq('coach_id', coachId)
    if (options?.search)   query = query.ilike('titre', `%${options.search}%`)
    if (options?.clientId) query = query.eq('client_id', options.clientId)
    if (options?.statut)   query = query.eq('statut', options.statut)
    const ascending = options?.sort === 'oldest'
    const { data, error } = await fetchAll(query.order('date_heure', { ascending }))
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionWithClient[]
  },

  async findById(id: string, coachId: string): Promise<SessionWithClient | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('sessions')
      .select('*, clients(nom, prenom, telephone, avatar_url)')
      .eq('id', id)
      .eq('coach_id', coachId)
      .maybeSingle()
    assertDatabaseSuccess(error)
    return data as SessionWithClient | null
  },

  async findThisWeek(coachId: string): Promise<SessionRow[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await fetchAll(supabase
      .from('sessions')
      .select('*')
      .eq('coach_id', coachId)
      .gte('date_heure', getStartOfWeek().toISOString())
      .lte('date_heure', getEndOfWeek().toISOString())
      .order('date_heure', { ascending: true }))
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionRow[]
  },

  async findInNextMinutes(coachId: string, minutes: number): Promise<SessionWithClient[]> {
    const supabase = createServerSupabaseClient()
    const now   = new Date()
    const until = new Date(now.getTime() + minutes * 60_000)
    const { data, error } = await fetchAll(supabase
      .from('sessions')
      .select('*, clients(nom, prenom, telephone, avatar_url)')
      .eq('coach_id', coachId)
      .eq('statut', 'PLANIFIEE')
      .gte('date_heure', now.toISOString())
      .lte('date_heure', until.toISOString())
      .order('date_heure', { ascending: true }))
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionWithClient[]
  },

  /** Séances planifiées du jour (Dakar = UTC toute l'année), y compris celles déjà commencées : ce sont celles qu'il reste à saisir. */
  async findToday(coachId: string): Promise<SessionWithClient[]> {
    const supabase = createServerSupabaseClient()
    const start = new Date(); start.setUTCHours(0, 0, 0, 0)
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1)
    const { data, error } = await supabase
      .from('sessions')
      .select('*, clients(nom, prenom, telephone, avatar_url)')
      .eq('coach_id', coachId)
      .eq('statut', 'PLANIFIEE')
      .gte('date_heure', start.toISOString())
      .lt('date_heure', end.toISOString())
      .order('date_heure', { ascending: true })
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionWithClient[]
  },

  async findUpcoming(coachId: string, limit = 5): Promise<SessionWithClient[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('sessions')
      .select('*, clients(nom, prenom, telephone, avatar_url)')
      .eq('coach_id', coachId)
      .eq('statut', 'PLANIFIEE')
      .gt('date_heure', new Date().toISOString())
      .order('date_heure', { ascending: true })
      .limit(limit)
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionWithClient[]
  },

  async findByClient(clientId: string, coachId: string): Promise<SessionRow[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await fetchAll(supabase
      .from('sessions')
      .select('*')
      .eq('client_id', clientId)
      .eq('coach_id', coachId)
      .order('date_heure', { ascending: false }))
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionRow[]
  },

  async findByClientAndMonth(
    clientId: string,
    coachId: string,
    yearMonth: string, // 'YYYY-MM'
  ): Promise<SessionRow[]> {
    const supabase = createServerSupabaseClient()
    const [y, m] = yearMonth.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const end   = new Date(Date.UTC(y, m, 1)).toISOString()
    const { data, error } = await fetchAll(supabase
      .from('sessions')
      .select('*')
      .eq('client_id', clientId)
      .eq('coach_id', coachId)
      .gte('date_heure', start)
      .lt('date_heure', end)
      .order('date_heure', { ascending: true }))
    assertDatabaseSuccess(error)
    return (data ?? []) as SessionRow[]
  },

  async create(coachId: string, payload: Omit<SessionRow, 'id' | 'coach_id' | 'created_at' | 'updated_at' | 'occurrence_date'> & { occurrence_date?: string | null }): Promise<SessionRow | null> {
    await requireClient(payload.client_id, coachId)
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('sessions')
      .insert({ ...payload, coach_id: coachId })
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as SessionRow | null
  },

  async update(
    id: string,
    coachId: string,
    payload: Partial<Pick<SessionRow, 'titre' | 'description' | 'date_heure' | 'duree_minutes' | 'notes'>>,
  ): Promise<SessionRow | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('sessions')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('coach_id', coachId)
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as SessionRow | null
  },

  async remove(id: string, coachId: string): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('sessions').delete().eq('id', id).eq('coach_id', coachId).select('id').maybeSingle()
    assertDatabaseSuccess(error)
    requireAffectedRow(data)
  },

  async updateStatus(id: string, coachId: string, statut: SessionRow['statut']): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('sessions')
      .update({ statut, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('coach_id', coachId)
      .select('id').maybeSingle()
    assertDatabaseSuccess(error)
    requireAffectedRow(data)
  },
}
