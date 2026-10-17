import { createServerSupabaseClient } from '@/config/supabase.server'
import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'

export async function requireClient(clientId: string, coachId: string): Promise<void> {
  const { data, error } = await createServerSupabaseClient()
    .from('clients').select('id').eq('id', clientId).eq('coach_id', coachId).maybeSingle()
  assertDatabaseSuccess(error)
  requireAffectedRow(data)
}
