import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { assertDatabaseSuccess } from '@/lib/databaseResult'
import type { RateHit, RateStore } from '@/lib/rateLimit'

/** Magasin des compteurs : clé de service côté serveur uniquement. Null si la configuration manque (pas de limite). */
export function rateLimitStore(): RateStore | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null
  const sb = createAdminSupabaseClient()
  return {
    async hit(key, windowSeconds, max): Promise<RateHit> {
      const { data, error } = await sb.rpc('rate_limit_hit', { p_key: key, p_window_seconds: windowSeconds, p_max: max })
      assertDatabaseSuccess(error)
      const row = (Array.isArray(data) ? data[0] : data) as RateHit | undefined
      if (!row) throw new Error('réponse vide')
      return row
    },
  }
}
