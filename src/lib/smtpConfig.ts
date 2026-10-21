/** Serveur d'e-mail du résumé hebdomadaire (SMTP). Sans configuration complète, la tâche est désactivée (503). */
export interface SmtpConfig { host: string; port: number; user: string; pass: string; from: string }

export function smtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim(), user = env.SMTP_USER?.trim(), pass = env.SMTP_PASS, from = env.SMTP_FROM?.trim()
  const port = Number(env.SMTP_PORT || 587)
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port <= 0) return null
  return { host, port, user, pass, from }
}
