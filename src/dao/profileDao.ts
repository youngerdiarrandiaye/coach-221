import { assertDatabaseSuccess, requireAffectedRow } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { ProfileRow } from '@/entities'
import type { UpdateProfileDto } from '@/dto'

export const profileDao = {
  async findById(id: string): Promise<ProfileRow | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    assertDatabaseSuccess(error)
    return data as ProfileRow | null
  },

  async update(id: string, dto: UpdateProfileDto): Promise<ProfileRow | null> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle()
    assertDatabaseSuccess(error)
    return requireAffectedRow(data) as ProfileRow | null
  },
}
