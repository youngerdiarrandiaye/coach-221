import { fetchAll } from '@/server/pagination'
import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { ClientRow } from '@/entities'

export const clientDao = {
  async countActifs(coachId: string): Promise<number> {
    const supabase = createServerSupabaseClient()
    const { count, error } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .eq('actif', true)
    assertDatabaseSuccess(error)
    return count ?? 0
  },

  async findAll(coachId: string, search?: string): Promise<ClientRow[]> {
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('clients')
      .select('*')
      .eq('coach_id', coachId)
      .eq('actif', true)

    if (search) {
      query = query.or(
        `nom.ilike.%${search}%,prenom.ilike.%${search}%,telephone.ilike.%${search}%`
      )
    }

    const { data, error } = await fetchAll(query.order('created_at', { ascending: false }))
    assertDatabaseSuccess(error)
    return (data ?? []) as ClientRow[]
  },

  async findById(id: string, coachId: string): Promise<ClientRow | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('coach_id', coachId)
      .maybeSingle()
    assertDatabaseSuccess(error)
    return data as ClientRow | null
  },

  async create(coachId: string, payload: Omit<ClientRow, 'id' | 'coach_id' | 'created_at' | 'updated_at'>): Promise<ClientRow | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('clients')
      .insert({ ...payload, coach_id: coachId })
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as ClientRow | null
  },

  async update(id: string, coachId: string, payload: Partial<ClientRow>): Promise<ClientRow | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('clients')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('coach_id', coachId)
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as ClientRow | null
  },

  async softDelete(id: string, coachId: string): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('clients')
      .update({ actif: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('coach_id', coachId)
      .select('id').maybeSingle()
    assertDatabaseSuccess(error)
    requireAffectedRow(data)
  },
}
