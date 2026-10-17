import { fetchAll } from '@/server/pagination'
import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { ProgressEntryRow } from '@/entities'
import { requireClient } from './requireClient'

export type ProgressWithClient = ProgressEntryRow & {
  clients: { nom: string; prenom: string; taille_cm: number | null }
}

export const progressDao = {
  async findAll(coachId: string): Promise<ProgressWithClient[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await fetchAll(supabase
      .from('progress_entries')
      .select('*, clients(nom, prenom, taille_cm)')
      .eq('coach_id', coachId)
      .order('mesure_date', { ascending: false }))
    assertDatabaseSuccess(error)
    return (data ?? []) as ProgressWithClient[]
  },

  async findByClient(clientId: string, coachId: string): Promise<ProgressEntryRow[]> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await fetchAll(supabase
      .from('progress_entries')
      .select('*')
      .eq('client_id', clientId)
      .eq('coach_id', coachId)
      .order('mesure_date', { ascending: true }))
    assertDatabaseSuccess(error)
    return (data ?? []) as ProgressEntryRow[]
  },

  async create(
    coachId: string,
    payload: {
      client_id:   string
      poids_kg:    number
      notes:       string | null
      mesure_date: string
      frequence_cardiaque_repos_bpm?:  number | null
      frequence_cardiaque_effort_bpm?: number | null
      tour_taille_cm?:                 number | null
      hanches_cm?:                     number | null
      bras_cm?:                        number | null
      cuisse_cm?:                      number | null
      masse_grasse_pct?:               number | null
    },
  ): Promise<ProgressEntryRow | null> {
    await requireClient(payload.client_id, coachId)
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('progress_entries')
      .insert({ ...payload, coach_id: coachId })
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as ProgressEntryRow | null
  },

  async findByClientAndMonth(
    clientId: string,
    coachId: string,
    yearMonth: string, // 'YYYY-MM'
  ): Promise<ProgressEntryRow[]> {
    const supabase = createServerSupabaseClient()
    const start = `${yearMonth}-01`
    const [y, m] = yearMonth.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    const end  = `${next}-01`
    const { data, error } = await fetchAll(supabase
      .from('progress_entries')
      .select('*')
      .eq('client_id', clientId)
      .eq('coach_id', coachId)
      .gte('mesure_date', start)
      .lt('mesure_date', end)
      .order('mesure_date', { ascending: false }))
    assertDatabaseSuccess(error)
    return (data ?? []) as ProgressEntryRow[]
  },

  async remove(id: string, coachId: string): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.from('progress_entries').delete().eq('id', id).eq('coach_id', coachId).select('id').maybeSingle()
    assertDatabaseSuccess(error)
    requireAffectedRow(data)
  },
}
