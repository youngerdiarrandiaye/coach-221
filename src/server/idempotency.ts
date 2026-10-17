import { createHash } from 'node:crypto'
import { HttpError } from './http'

export type IdempotencyOutcome = { outcome: 'new' | 'replay' | 'mismatch' | 'pending'; status: number | null; body: unknown }
export type IdempotencyStore = {
  begin(coachId: string, key: string, route: string, hash: string): Promise<IdempotencyOutcome>
  complete(coachId: string, key: string, status: number, body: unknown): Promise<void>
  release(coachId: string, key: string): Promise<void>
}
export type IdempotencyOptions = { waitMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'null'
}

/** Empreinte du corps validé : insensible à l'ordre des clés. */
export const requestHash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex')

/**
 * Exécute `work` une seule fois par (coach, clé) : un rejeu renvoie la réponse mémorisée, une requête
 * simultanée identique attend la première (puis 409 si elle dure trop), un corps différent est refusé (422).
 * Un traitement en échec libère la clé pour permettre un nouvel essai.
 */
export async function runIdempotent(
  store: IdempotencyStore,
  id: { coachId: string; key: string; route: string; hash: string },
  work: () => Promise<{ status: number; body: unknown }>,
  options: IdempotencyOptions = {},
): Promise<{ status: number; body: unknown; replayed: boolean }> {
  const waitMs = options.waitMs ?? 8000, pollMs = options.pollMs ?? 250
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  let waited = 0
  for (;;) {
    const r = await store.begin(id.coachId, id.key, id.route, id.hash)
    if (r.outcome === 'mismatch') throw new HttpError(422, 'IDEMPOTENCY_MISMATCH', 'Cette clé d’idempotence a déjà été utilisée pour une requête différente.')
    if (r.outcome === 'replay') return { status: r.status ?? 200, body: r.body, replayed: true }
    if (r.outcome === 'new') break
    if (waited >= waitMs) throw new HttpError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Une requête identique est en cours de traitement. Réessayez dans un instant.')
    await sleep(pollMs)
    waited += pollMs
  }
  let result: { status: number; body: unknown }
  try { result = await work() } catch (error) {
    try { await store.release(id.coachId, id.key) } catch { /* la reprise automatique libérera la clé */ }
    throw error
  }
  try { await store.complete(id.coachId, id.key, result.status, result.body) }
  catch {
    try { await store.complete(id.coachId, id.key, result.status, result.body) } catch { console.error('[idempotence] réponse non mémorisée') }
  }
  return { ...result, replayed: false }
}
