import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cronAuth'
import { runWeeklyDigest } from '@/services/weeklyDigestService'
import { smtpConfig } from '@/lib/smtpConfig'
import { realDigestDeps } from '@/server/weeklyDigest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

/** Résumé hebdomadaire des clients : le planificateur l'appelle le lundi matin ; chaque client n'est servi qu'une fois par semaine. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const smtp = smtpConfig()
  if (!smtp || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: { code: 'DIGEST_NOT_CONFIGURED', message: 'Serveur d’e-mail non configuré (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)' } }, { status: 503 })
  }
  try {
    const result = await runWeeklyDigest(realDigestDeps(smtp), new Date().toISOString().slice(0, 10))
    return NextResponse.json({ data: result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[cron] échec du résumé hebdomadaire')
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Échec du résumé hebdomadaire' } }, { status: 500 })
  }
}

export const POST = GET
