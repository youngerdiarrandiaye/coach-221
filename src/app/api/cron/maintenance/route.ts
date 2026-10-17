import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { purgeMaintenance, recordCronRun } from '@/dao/cronRunDao'
import { isCronAuthorized } from '@/lib/cronAuth'
import { cronErrorLabel } from '@/lib/cronRuns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: { code: 'NOT_CONFIGURED', message: 'Configuration de la maintenance incomplète' } }, { status: 503 })
  }
  const sb = createAdminSupabaseClient()
  const startedAt = new Date()
  try {
    const purged = await purgeMaintenance(sb)
    const total = Object.values(purged).reduce((sum, n) => sum + Number(n), 0)
    await recordCronRun(sb, { job: 'maintenance', startedAt, ok: true, checked: Object.keys(purged).length, sent: total })
    return NextResponse.json({ data: { purged } })
  } catch (error) {
    // Ne journaliser aucun détail SQL ni donnée.
    console.error('[cron] échec de la maintenance')
    await recordCronRun(sb, { job: 'maintenance', startedAt, ok: false, failed: 1, error: cronErrorLabel(error) })
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Échec de la maintenance' } }, { status: 500 })
  }
}

export const POST = GET
