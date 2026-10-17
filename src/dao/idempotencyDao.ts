import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { AppError } from '@/exception/AppError'
import { assertDatabaseSuccess } from '@/lib/databaseResult'
import type { IdempotencyOutcome, IdempotencyStore } from '@/server/idempotency'

/** Magasin des clés d'idempotence : clé de service côté serveur uniquement. */
export function idempotencyStore(): IdempotencyStore {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new AppError('Service indisponible. Veuillez réessayer.', 'SERVICE_UNAVAILABLE', 503)
  const sb = createAdminSupabaseClient()
  return {
    async begin(coachId, key, route, hash) {
      const { data, error } = await sb.rpc('idempotency_begin', { p_coach: coachId, p_key: key, p_route: route, p_hash: hash })
      assertDatabaseSuccess(error)
      const row = (Array.isArray(data) ? data[0] : data) as { outcome: IdempotencyOutcome['outcome']; http_status: number | null; body: unknown } | undefined
      if (!row) throw new AppError('Service indisponible. Veuillez réessayer.', 'SERVICE_UNAVAILABLE', 503)
      return { outcome: row.outcome, status: row.http_status, body: row.body }
    },
    async complete(coachId, key, status, body) {
      const { error } = await sb.rpc('idempotency_complete', { p_coach: coachId, p_key: key, p_status: status, p_response: body })
      assertDatabaseSuccess(error)
    },
    async release(coachId, key) {
      const { error } = await sb.rpc('idempotency_release', { p_coach: coachId, p_key: key })
      assertDatabaseSuccess(error)
    },
  }
}
