// Développement local : déclenche le cron des rappels push toutes les 30 s (ou une fois avec --once).
// Usage : node scripts/run-push-reminders.mjs [--once] [--url http://127.0.0.1:3100]
import { readFile } from 'node:fs/promises'

const once = process.argv.includes('--once')
const urlIndex = process.argv.indexOf('--url')
const base = (urlIndex > 0 ? process.argv[urlIndex + 1] : process.env.PUSH_CRON_URL) || 'http://127.0.0.1:3100'

async function readSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET
  try {
    const text = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
    return text.match(/^CRON_SECRET=(.*)$/m)?.[1].trim().replace(/^["']|["']$/g, '')
  } catch { return undefined }
}

const secret = await readSecret()
if (!secret) { console.error('CRON_SECRET introuvable (environnement ou .env.local).'); process.exit(1) }

async function pass() {
  const time = new Date().toISOString()
  try {
    const response = await fetch(`${base}/api/cron/push-reminders`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30_000) })
    const body = await response.json().catch(() => ({}))
    console.log(time, response.status, JSON.stringify(body.data ?? body.error ?? {}))
    return response.ok
  } catch (error) {
    console.error(time, 'échec de connexion :', error.name)
    return false
  }
}

if (once) process.exit(await pass() ? 0 : 1)
console.log(`Rappels push : passage toutes les 30 s vers ${base} (Ctrl+C pour arrêter).`)
for (;;) { await pass(); await new Promise(resolve => setTimeout(resolve, 30_000)) }
