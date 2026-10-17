import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { lastCronRuns } from '@/dao/cronRunDao'
import { isCronAuthorized } from '@/lib/cronAuth'
import { computeCronHealth } from '@/lib/cronRuns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/** Sonde de disponibilité des tâches planifiées : 503 si l'une est en retard. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: { code: 'NOT_CONFIGURED', message: 'Configuration du suivi incomplète' } }, { status: 503 })
  }
  try {
    const { jobs, healthy } = computeCronHealth(await lastCronRuns(createAdminSupabaseClient()))
    return NextResponse.json({ data: { jobs } }, { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[cron] échec de lecture du suivi')
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Suivi indisponible' } }, { status: 500 })
  }
}
