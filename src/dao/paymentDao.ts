import { fetchAll } from '@/server/pagination'
import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { PaymentRow } from '@/entities'
import { getStartOfMonth, getEndOfMonth } from '@/utils/date'
import { requireClient } from './requireClient'

export type PaymentWithClient = PaymentRow & {
  clients: { nom: string; prenom: string }
}

export const paymentDao = {
  async sumThisMonth(coachId: string): Promise<number> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await fetchAll(supabase
      .from('payments')
      .select('montant')
      .eq('coach_id', coachId)
      .eq('statut', 'PAYE')
      .gte('date_paiement', getStartOfMonth().toISOString().split('T')[0])
      .lte('date_paiement', getEndOfMonth().toISOString().split('T')[0]))
    assertDatabaseSuccess(error)
    return (data ?? []).reduce((sum, row) => sum + Number(row.montant), 0)
  },

  async sumPending(coachId: string): Promise<number> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await fetchAll(supabase
      .from('payments')
      .select('montant')
      .eq('coach_id', coachId)
      .eq('statut', 'EN_ATTENTE'))
    assertDatabaseSuccess(error)
    return (data ?? []).reduce((sum, row) => sum + Number(row.montant), 0)
  },

  async findAll(
    coachId: string,
    options?: { search?: string; methode?: string; sort?: 'newest' | 'oldest' | 'highest' | 'lowest' },
  ): Promise<PaymentWithClient[]> {
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('payments')
      .select('*, clients(nom, prenom)')
      .eq('coach_id', coachId)
    if (options?.search)  query = query.ilike('description', `%${options.search}%`)
    if (options?.methode) query = query.eq('methode', options.methode)
    const sortField = (options?.sort === 'highest' || options?.sort === 'lowest') ? 'montant' : 'date_paiement'
    const ascending = options?.sort === 'oldest' || options?.sort === 'lowest'
    const { data, error } = await fetchAll(query.order(sortField, { ascending }))
    assertDatabaseSuccess(error)
    return (data ?? []) as PaymentWithClient[]
  },

  async findById(id: string, coachId: string): Promise<PaymentWithClient | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('payments')
      .select('*, clients(nom, prenom)')
      .eq('id', id)
      .eq('coach_id', coachId)
      .maybeSingle()
    assertDatabaseSuccess(error)
    return data as PaymentWithClient | null
  },

  async findRecent(coachId: string, limit = 5): Promise<PaymentWithClient[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('payments')
      .select('*, clients(nom, prenom)')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .limit(limit)
    assertDatabaseSuccess(error)
    return (data ?? []) as PaymentWithClient[]
  },

  /** Paiements en attente du coach (les plus anciens d'abord), avec le téléphone du client pour la relance. */
  async findPending(coachId: string, limit = 5): Promise<(PaymentRow & { clients: { nom: string; prenom: string; telephone: string | null } })[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('payments')
      .select('*, clients(nom, prenom, telephone)')
      .eq('coach_id', coachId)
      .eq('statut', 'EN_ATTENTE')
      .order('date_paiement', { ascending: true })
      .limit(limit)
    assertDatabaseSuccess(error)
    return (data ?? []) as (PaymentRow & { clients: { nom: string; prenom: string; telephone: string | null } })[]
  },

  async findByClient(clientId: string, coachId: string): Promise<PaymentRow[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await fetchAll(supabase
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .eq('coach_id', coachId)
      .order('date_paiement', { ascending: false }))
    assertDatabaseSuccess(error)
    return (data ?? []) as PaymentRow[]
  },

  async findByClientAndMonth(
    clientId: string,
    coachId: string,
    yearMonth: string, // 'YYYY-MM'
  ): Promise<PaymentRow[]> {
    const supabase = createServerSupabaseClient()
    const [y, m] = yearMonth.split('-').map(Number)
    const start  = `${yearMonth}-01`
    const end    = new Date(Date.UTC(y, m, 1)).toISOString().split('T')[0]
    const { data, error } = await fetchAll(supabase
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .eq('coach_id', coachId)
      .gte('date_paiement', start)
      .lt('date_paiement', end)
      .order('date_paiement', { ascending: false }))
    assertDatabaseSuccess(error)
    return (data ?? []) as PaymentRow[]
  },

  async create(coachId: string, payload: Omit<PaymentRow, 'id' | 'coach_id' | 'created_at' | 'updated_at'>): Promise<PaymentRow | null> {
    await requireClient(payload.client_id, coachId)
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('payments')
      .insert({ ...payload, coach_id: coachId })
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as PaymentRow | null
  },

  async update(
    id: string,
    coachId: string,
    payload: Partial<Pick<PaymentRow, 'montant' | 'methode' | 'statut' | 'description' | 'date_paiement'>>,
  ): Promise<PaymentRow | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('payments')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('coach_id', coachId)
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as PaymentRow | null
  },

  async remove(id: string, coachId: string): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('payments').delete().eq('id', id).eq('coach_id', coachId).select('id').maybeSingle()
    assertDatabaseSuccess(error)
    requireAffectedRow(data)
  },
}
