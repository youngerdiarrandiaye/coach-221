import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { recordCronRun } from '@/dao/cronRunDao'
import { isCronAuthorized } from '@/lib/cronAuth'
import { cronErrorLabel } from '@/lib/cronRuns'
import { assertDatabaseSuccess } from '@/lib/databaseResult'
import { runSessionReminders, type Reminder, type ReminderStore, type Delivery } from '@/services/reminderService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = process.env.WHATSAPP_API_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const version = process.env.WHATSAPP_API_VERSION
  const template = process.env.WHATSAPP_REMINDER_TEMPLATE
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'fr'
  if (!token || !phoneId || !version || !/^v[0-9]+\.[0-9]+$/.test(version) || !template ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Configuration des rappels incompl?te' }, { status: 503 })
  }

  const sb = createAdminSupabaseClient()
  const store: ReminderStore = {
    async findDue(from, until) {
      const due: Reminder[] = []
      for (let offset = 0; due.length < 25; offset += 100) {
        const { data, error } = await sb.from('sessions')
          .select('id, titre, date_heure, duree_minutes, clients(nom, prenom), profiles!sessions_coach_id_fkey(telephone, prenom), session_reminders(scheduled_for)')
          .eq('statut', 'PLANIFIEE').gt('date_heure', from).lte('date_heure', until)
          .order('date_heure', { ascending: true }).order('id').range(offset, offset + 99)
        assertDatabaseSuccess(error)
        for (const row of data ?? []) {
          const claimed = (row.session_reminders as { scheduled_for: string }[]).some(
            claim => new Date(claim.scheduled_for).getTime() === new Date(row.date_heure).getTime(),
          )
          if (claimed) continue
          due.push({
            id: row.id, titre: row.titre, date_heure: row.date_heure, duree_minutes: row.duree_minutes,
            coach: row.profiles as unknown as Reminder['coach'],
            client: row.clients as unknown as Reminder['client'],
          })
          if (due.length === 25) break
        }
        if ((data?.length ?? 0) < 100) break
      }
      return due
    },
    async claim(reminder) {
      const { error } = await sb.from('session_reminders').insert({
        session_id: reminder.id, scheduled_for: reminder.date_heure, status: 'sending',
      })
      if (error?.code === '23505') return false
      assertDatabaseSuccess(error)
      return true
    },
    async complete(reminder, delivery) {
      const { error } = await sb.from('session_reminders').update({
        status: delivery.status, provider_message_id: delivery.messageId ?? null, updated_at: new Date().toISOString(),
      }).eq('session_id', reminder.id).eq('scheduled_for', reminder.date_heure)
      assertDatabaseSuccess(error)
    },
  }

  async function send(reminder: Reminder, phone: string): Promise<Delivery> {
    const heure = new Date(reminder.date_heure).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar',
    })
    const clientName = reminder.client ? reminder.client.prenom + ' ' + reminder.client.nom : 'votre client'
    const response = await fetch('https://graph.facebook.com/' + version + '/' + phoneId + '/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: phone, type: 'template',
        template: {
          name: template, language: { code: language },
          components: [{ type: 'body', parameters: [
            reminder.coach.prenom || 'Coach', reminder.titre, clientName, heure, String(reminder.duree_minutes),
          ].map(text => ({ type: 'text', text })) }],
        },
      }),
    })
    if (!response.ok) return { status: response.status >= 500 ? 'unknown' : 'failed' }
    const body = await response.json() as { messages?: { id: string }[] }
    return body.messages?.[0]?.id ? { status: 'sent', messageId: body.messages[0].id } : { status: 'unknown' }
  }

  const startedAt = new Date()
  try {
    const result = await runSessionReminders(store, send)
    const failed = result.results.filter(r => r.status === 'failed' || r.status === 'unknown').length
    await recordCronRun(sb, { job: 'session-reminders', startedAt, ok: true, checked: result.total, sent: result.sent, failed })
    return NextResponse.json(result)
  } catch (error) {
    await recordCronRun(sb, { job: 'session-reminders', startedAt, ok: false, failed: 1, error: cronErrorLabel(error) })
    // Ne pas journaliser les messages, coordonn?es ou cl?s d'acc?s.
    console.error('[cron] ?chec de traitement des rappels')
    return NextResponse.json({ error: '?chec de traitement des rappels' }, { status: 500 })
  }
}

export const POST = GET
