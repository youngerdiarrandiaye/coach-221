import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDatabaseSuccess } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '@/features/push/schemas'
import { PUSH_FAILURE_LIMIT, type CoachPushState, type DeliveryStore, type PushStore, type PushSubscriptionRecord, type UpcomingSession } from '@/lib/pushReminders'

const SUB_COLUMNS = 'id, endpoint, p256dh, auth, failures'

/** Suppression / compteur d'échecs : valable avec le client coach (RLS) comme avec la clé service-role. */
export function deliveryStore(sb: SupabaseClient): DeliveryStore {
  const remove = async (sub: PushSubscriptionRecord) => {
    const { error } = await sb.from('push_subscriptions').delete().eq('id', sub.id)
    assertDatabaseSuccess(error)
  }
  return {
    async markSuccess(sub) {
      const { error } = await sb.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failures: 0 }).eq('id', sub.id)
      assertDatabaseSuccess(error)
    },
    async markFailure(sub) {
      const failures = sub.failures + 1
      if (failures >= PUSH_FAILURE_LIMIT) { await remove(sub); return true }
      const { error } = await sb.from('push_subscriptions').update({ failures }).eq('id', sub.id)
      assertDatabaseSuccess(error)
      return false
    },
    remove,
  }
}

type SessionRowWithClient = Omit<UpcomingSession, 'client'> & { clients: UpcomingSession['client'] | UpcomingSession['client'][] }

/** Magasin du cron : client service-role, jamais exposé au navigateur. */
export function cronStore(sb: SupabaseClient): PushStore & DeliveryStore {
  return {
    ...deliveryStore(sb),
    async listUpcoming(from, until) {
      const rows: UpcomingSession[] = []
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await sb.from('sessions').select('id, coach_id, titre, date_heure, clients(nom, prenom)')
          .eq('statut', 'PLANIFIEE').gt('date_heure', from).lte('date_heure', until)
          .order('date_heure', { ascending: true }).order('id').range(offset, offset + 499)
        assertDatabaseSuccess(error)
        for (const r of (data ?? []) as unknown as SessionRowWithClient[])
          rows.push({ id: r.id, coach_id: r.coach_id, titre: r.titre, date_heure: r.date_heure, client: Array.isArray(r.clients) ? r.clients[0] ?? null : r.clients })
        if ((data?.length ?? 0) < 500) break
      }
      return rows
    },
    async loadCoaches(coachIds) {
      const map = new Map<string, CoachPushState>()
      if (!coachIds.length) return map
      const [subs, prefs] = await Promise.all([
        sb.from('push_subscriptions').select(`coach_id, ${SUB_COLUMNS}`).in('coach_id', coachIds),
        sb.from('reminder_prefs').select('coach_id, enabled, offsets').in('coach_id', coachIds),
      ])
      assertDatabaseSuccess(subs.error); assertDatabaseSuccess(prefs.error)
      for (const id of coachIds) map.set(id, { prefs: null, subscriptions: [] })
      for (const p of (prefs.data ?? []) as { coach_id: string; enabled: boolean; offsets: number[] }[]) map.get(p.coach_id)!.prefs = { enabled: p.enabled, offsets: p.offsets }
      for (const s of (subs.data ?? []) as (PushSubscriptionRecord & { coach_id: string })[]) map.get(s.coach_id)!.subscriptions.push(s)
      return map
    },
    async reserve(sessionId, coachId, offsets) {
      const { data, error } = await sb.from('push_sent')
        .upsert(offsets.map(offset_min => ({ session_id: sessionId, offset_min, coach_id: coachId })), { onConflict: 'session_id,offset_min', ignoreDuplicates: true })
        .select('offset_min')
      assertDatabaseSuccess(error)
      return ((data ?? []) as { offset_min: number }[]).map(r => r.offset_min)
    },
    async release(sessionId, offsets) {
      const { error } = await sb.from('push_sent').delete().eq('session_id', sessionId).in('offset_min', offsets)
      assertDatabaseSuccess(error)
    },
  }
}

export const pushDao = {
  async upsertSubscription(p: { endpoint: string; p256dh: string; auth: string; user_agent: string | null }): Promise<string> {
    const { data, error } = await createServerSupabaseClient().rpc('upsert_push_subscription', {
      p_endpoint: p.endpoint, p_p256dh: p.p256dh, p_auth: p.auth, p_user_agent: p.user_agent,
    })
    assertDatabaseSuccess(error)
    return data as string
  },

  async removeByEndpoint(coachId: string, endpoint: string): Promise<boolean> {
    const { data, error } = await createServerSupabaseClient().from('push_subscriptions')
      .delete().eq('coach_id', coachId).eq('endpoint', endpoint).select('id')
    assertDatabaseSuccess(error)
    return (data ?? []).length > 0
  },

  async listSubscriptions(coachId: string): Promise<PushSubscriptionRecord[]> {
    const { data, error } = await createServerSupabaseClient().from('push_subscriptions').select(SUB_COLUMNS).eq('coach_id', coachId)
    assertDatabaseSuccess(error)
    return (data ?? []) as PushSubscriptionRecord[]
  },

  async getSettings(coachId: string): Promise<ReminderSettings> {
    const { data, error } = await createServerSupabaseClient().from('reminder_prefs')
      .select('enabled, offsets, system, updated_at').eq('coach_id', coachId).maybeSingle()
    assertDatabaseSuccess(error)
    return (data as ReminderSettings | null) ?? DEFAULT_REMINDER_SETTINGS
  },

  async saveSettings(coachId: string, s: Omit<ReminderSettings, 'updated_at'>): Promise<ReminderSettings> {
    const { data, error } = await createServerSupabaseClient().from('reminder_prefs')
      .upsert({ coach_id: coachId, ...s, updated_at: new Date().toISOString() }, { onConflict: 'coach_id' })
      .select('enabled, offsets, system, updated_at').single()
    assertDatabaseSuccess(error)
    return data as ReminderSettings
  },

  deliveryStore: () => deliveryStore(createServerSupabaseClient() as unknown as SupabaseClient),
}
