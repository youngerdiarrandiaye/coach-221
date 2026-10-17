import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { recordCronRun } from '@/dao/cronRunDao'
import { cronStore } from '@/dao/pushDao'
import { isCronAuthorized } from '@/lib/cronAuth'
import { cronErrorLabel } from '@/lib/cronRuns'
import { runPushReminders } from '@/lib/pushReminders'
import { sendWebPush, vapidConfig } from '@/server/pushSender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!vapidConfig() || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: { code: 'PUSH_NOT_CONFIGURED', message: 'Configuration des notifications push incomplète' } }, { status: 503 })
  }
  const sb = createAdminSupabaseClient()
  const startedAt = new Date()
  try {
    const result = await runPushReminders(cronStore(sb), sendWebPush)
    await recordCronRun(sb, { job: 'push-reminders', startedAt, ok: true, checked: result.checked, sent: result.sent, failed: result.failed })
    return NextResponse.json({ data: result })
  } catch (error) {
    await recordCronRun(sb, { job: 'push-reminders', startedAt, ok: false, failed: 1, error: cronErrorLabel(error) })
    // Ne jamais journaliser les abonnements, messages ou clés.
    console.error('[cron] échec de traitement des rappels push')
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Échec de traitement des rappels push' } }, { status: 500 })
  }
}

export const POST = GET
