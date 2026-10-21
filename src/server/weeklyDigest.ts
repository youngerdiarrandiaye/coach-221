import nodemailer from 'nodemailer'
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { runWithElevatedClient } from '@/config/supabase.server'
import type { SmtpConfig } from '@/lib/smtpConfig'
import type { DigestMail } from '@/lib/weeklyDigestMail'
import type { DigestAccount, WeeklyDigestDeps } from '@/services/weeklyDigestService'
import { overview } from './clientSpace'

export function realMailer(config: SmtpConfig) {
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.port === 465, auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  })
  return async (to: string, mail: DigestMail) => { await transport.sendMail({ from: config.from, to, subject: mail.subject, text: mail.text, html: mail.html }) }
}

const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** Appels réels : comptes à servir, adresse du client, données de l'espace, envoi et marquage. */
export function realDigestDeps(config: SmtpConfig): WeeklyDigestDeps {
  const admin = createAdminSupabaseClient()
  const send = realMailer(config)
  return {
    async due(weekStart, limit) {
      const { data, error } = await admin.from('client_accounts').select('user_id, client_id, coach_id')
        .eq('weekly_digest', true).or(`last_digest_week.is.null,last_digest_week.lt.${weekStart}`).order('user_id').limit(limit)
      if (error) throw new Error('lecture impossible')
      return (data ?? []) as DigestAccount[]
    },
    async emailOf(userId) { return (await admin.auth.admin.getUserById(userId)).data?.user?.email ?? null },
    async load(account) {
      const o = await runWithElevatedClient(admin, () => overview({ client_id: account.client_id, coach_id: account.coach_id }))
      return { prenom: o.client.prenom, coach: o.coach, weeks: o.weeks, upcoming: o.upcoming }
    },
    send,
    async markSent(userId, weekStart) {
      const { error } = await admin.from('client_accounts').update({ last_digest_week: weekStart }).eq('user_id', userId)
      if (error) throw new Error('marquage impossible')
    },
    spaceUrl: `${siteUrl()}/espace`,
  }
}
