import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { deliveryStore } from '@/dao/pushDao'
import type { PushSubscriptionRecord } from '@/lib/pushReminders'
import { handleDeployHook } from '@/server/deployHook'
import { sendWebPush, vapidConfig } from '@/server/pushSender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

export const POST = (request: Request) => handleDeployHook(request, {
  secret: process.env.DEPLOY_WEBHOOK_SECRET,
  configured: Boolean(vapidConfig() && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  send: sendWebPush,
  store: () => deliveryStore(createAdminSupabaseClient()),
  page: async (after, limit) => {
    const { data, error } = await createAdminSupabaseClient().from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, failures').gt('id', after).order('id').limit(limit)
    if (error) throw error
    return (data ?? []) as PushSubscriptionRecord[]
  },
})
