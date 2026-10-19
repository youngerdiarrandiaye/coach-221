// Logique pure des rappels Web Push : aucune dépendance réseau ni base ; le magasin et l'envoi sont injectés.

export const PUSH_FAILURE_LIMIT = 10
export const PUSH_WINDOW_MINUTES = 24 * 60
export const DEFAULT_PUSH_PREFS = { enabled: true, offsets: [30] as number[] }

export interface PushSubscriptionRecord { id: string; endpoint: string; p256dh: string; auth: string; failures: number }
export interface UpcomingSession {
  id: string
  coach_id: string
  titre: string
  date_heure: string
  client: { nom: string; prenom: string } | null
}
export interface CoachPushState { prefs: { enabled: boolean; offsets: number[] } | null; subscriptions: PushSubscriptionRecord[] }
export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  kind: 'session-reminder' | 'test' | 'update'
  /** Version déployée (kind « update » seulement) : le service worker s'en sert pour se mettre à jour. */
  version?: string
  client?: string
  session?: string
  minutes?: number
  startsAt?: string
}
export interface PushStore {
  listUpcoming(from: string, until: string): Promise<UpcomingSession[]>
  loadCoaches(coachIds: string[]): Promise<Map<string, CoachPushState>>
  /** INSERT ... ON CONFLICT DO NOTHING RETURNING : retourne les délais réellement réservés par cet appel. */
  reserve(sessionId: string, coachId: string, offsets: number[]): Promise<number[]>
  release(sessionId: string, offsets: number[]): Promise<void>
}
export interface DeliveryStore {
  markSuccess(subscription: PushSubscriptionRecord): Promise<void>
  /** Incrémente failures ; supprime l'abonnement à PUSH_FAILURE_LIMIT. Retourne true si supprimé. */
  markFailure(subscription: PushSubscriptionRecord): Promise<boolean>
  remove(subscription: PushSubscriptionRecord): Promise<void>
}
export type PushSender = (subscription: PushSubscriptionRecord, payload: PushPayload, options: { ttl: number; urgency: 'high' }) => Promise<void>

/** « 20 min », « 1 h », « 1 h 30 ». */
export function formatRemaining(minutes: number): string {
  const m = Math.max(1, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`
}

export function dakarHourMinute(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Dakar' }).format(new Date(iso))
}

/** Minutes restantes arrondies au-dessus, minimum 1. */
export const minutesRemaining = (startMs: number, nowMs: number) => Math.max(1, Math.ceil((startMs - nowMs) / 60_000))

export function sessionPayload(s: UpcomingSession, now: Date): PushPayload {
  const minutes = minutesRemaining(new Date(s.date_heure).getTime(), now.getTime())
  const client = s.client ? `${s.client.prenom} ${s.client.nom}`.trim() : 'Client'
  return {
    title: client,
    body: `Séance ${s.titre} dans ${formatRemaining(minutes)}, ${dakarHourMinute(s.date_heure)}`,
    url: `/sessions/${s.id}`,
    tag: `session-${s.id}`,
    kind: 'session-reminder',
    client, session: s.titre, minutes, startsAt: new Date(s.date_heure).toISOString(),
  }
}

export const testPayload = (): PushPayload => ({
  title: 'CoachSen', body: 'Vos rappels de séance fonctionnent.', url: '/', tag: 'test', kind: 'test',
})

/** Annonce d'une nouvelle version de l'application : envoyée aux appareils abonnés après chaque déploiement réussi. */
export const updatePayload = (version: string): PushPayload => ({
  title: 'CoachSen est à jour', body: 'Une nouvelle version est prête. Touchez pour l’ouvrir.', url: '/dashboard', tag: 'coachsen-update', kind: 'update', version,
})

/** Version acceptée par le webhook : identifiant de commit ou numéro, rien d'autre (elle finit dans une notification). */
export const validVersion = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,40}$/.test(value)

/** TTL = secondes jusqu'au début de la séance, au plus 3600. */
export const ttlSeconds = (startMs: number, nowMs: number) => Math.min(3600, Math.max(0, Math.ceil((startMs - nowMs) / 1000)))

/** Délais atteints : (début - maintenant) <= délai. Séance déjà commencée : aucun. */
export function reachedOffsets(offsets: number[], startMs: number, nowMs: number): number[] {
  const left = startMs - nowMs
  if (left <= 0) return []
  return Array.from(new Set(offsets)).filter(o => left <= o * 60_000).sort((a, b) => a - b)
}

const statusOf = (error: unknown) => (error as { statusCode?: number } | null)?.statusCode

export interface DeliveryResult { sent: number; failed: number; removed: number; temporaryOnly: boolean }

/** Envoie à tous les abonnements ; une erreur sur l'un n'empêche pas les autres. */
export async function deliver(
  store: DeliveryStore, send: PushSender, subscriptions: PushSubscriptionRecord[], payload: PushPayload, ttl: number,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, failed: 0, removed: 0, temporaryOnly: false }
  let temporary = 0
  await Promise.all(subscriptions.map(async sub => {
    try {
      await send(sub, payload, { ttl, urgency: 'high' })
      result.sent++
      try { await store.markSuccess(sub) } catch { /* sans incidence sur l'envoi */ }
    } catch (error) {
      result.failed++
      try {
        const status = statusOf(error)
        if (status === 404 || status === 410) { await store.remove(sub); result.removed++ }
        else { temporary++; if (await store.markFailure(sub)) result.removed++ }
      } catch { /* une panne SQL ne doit pas masquer les autres envois */ }
    }
  }))
  result.temporaryOnly = result.sent === 0 && temporary > 0
  return result
}

/**
 * Passage du cron. Réserver d'abord (push_sent), envoyer ensuite : une panne SQL ne provoque jamais d'envoi.
 * Si TOUS les envois échouent temporairement, les réservations sont libérées pour qu'un prochain passage réessaie.
 */
export async function runPushReminders(store: PushStore & DeliveryStore, send: PushSender, now = new Date()) {
  const totals = { checked: 0, sent: 0, failed: 0, removed: 0 }
  const nowMs = now.getTime()
  const sessions = await store.listUpcoming(now.toISOString(), new Date(nowMs + PUSH_WINDOW_MINUTES * 60_000).toISOString())
  totals.checked = sessions.length
  if (!sessions.length) return totals
  const coaches = await store.loadCoaches(Array.from(new Set(sessions.map(s => s.coach_id))))
  for (const session of sessions) {
    const coach = coaches.get(session.coach_id)
    const prefs = coach?.prefs ?? DEFAULT_PUSH_PREFS
    if (!coach || !prefs.enabled || !coach.subscriptions.length) continue
    const startMs = new Date(session.date_heure).getTime()
    const reached = reachedOffsets(prefs.offsets, startMs, nowMs)
    if (!reached.length) continue
    // Un chevauchement de passages ou de délais ne produit qu'une seule réservation gagnante.
    const reserved = await store.reserve(session.id, session.coach_id, reached)
    if (!reserved.length) continue
    const result = await deliver(store, send, coach.subscriptions, sessionPayload(session, now), ttlSeconds(startMs, nowMs))
    totals.sent += result.sent; totals.failed += result.failed; totals.removed += result.removed
    if (result.temporaryOnly) { try { await store.release(session.id, reserved) } catch { /* à réessayer manuellement */ } }
  }
  return totals
}
