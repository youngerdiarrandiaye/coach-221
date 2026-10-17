import { assertDatabaseSuccess } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { RumInput } from '@/features/workouts/schemas'
import type { RumEventLike } from '@/lib/workoutMath'

export const rumDao = {
  async create(coachId: string, e: RumInput): Promise<void> {
    const { error } = await createServerSupabaseClient().from('rum_events').insert({ ...e, coach_id: coachId })
    assertDatabaseSuccess(error)
  },

  async recent(coachId: string, days = 30): Promise<RumEventLike[]> {
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data, error } = await createServerSupabaseClient().from('rum_events')
      .select('name, task, clicks, duration_ms, value').eq('coach_id', coachId).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(5000)
    assertDatabaseSuccess(error)
    return (data ?? []) as RumEventLike[]
  },
}
