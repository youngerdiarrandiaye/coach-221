export interface Reminder {
  id: string
  date_heure: string
  titre: string
  duree_minutes: number
  coach: { telephone: string | null; prenom: string }
  client: { nom: string; prenom: string } | null
}

export type Delivery = { status: 'sent' | 'failed' | 'unknown'; messageId?: string }
export interface ReminderStore {
  findDue(from: string, until: string): Promise<Reminder[]>
  claim(reminder: Reminder): Promise<boolean>
  complete(reminder: Reminder, delivery: Delivery): Promise<void>
}

export function normalizeWhatsAppPhone(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, '')
  const phone = compact.startsWith('+') ? compact.slice(1)
    : compact.startsWith('00') ? compact.slice(2)
      : /^\d{9}$/.test(compact) ? `221${compact}` : compact
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null
}

export async function runSessionReminders(
  store: ReminderStore,
  send: (reminder: Reminder, phone: string) => Promise<Delivery>,
  now = new Date(),
) {
  // Chevauchement intentionnel : les réservations SQL dédupliquent les passages.
  const until = new Date(now.getTime() + 65 * 60_000)
  const due = await store.findDue(now.toISOString(), until.toISOString())
  const results: { sessionId: string; status: string }[] = []
  let cursor = 0
  const workers = await Promise.allSettled(Array.from({ length: Math.min(5, due.length) }, async () => {
    while (cursor < due.length) {
      const reminder = due[cursor++]
      const phone = normalizeWhatsAppPhone(reminder.coach.telephone ?? '')
      if (!phone) { results.push({ sessionId: reminder.id, status: 'invalid_phone' }); continue }
      if (!await store.claim(reminder)) { results.push({ sessionId: reminder.id, status: 'already_claimed' }); continue }
      let delivery: Delivery
      try { delivery = await send(reminder, phone) }
      catch { delivery = { status: 'unknown' } }
      await store.complete(reminder, delivery)
      results.push({ sessionId: reminder.id, status: delivery.status })
    }
  }))
  const failure = workers.find(worker => worker.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return { sent: results.filter(result => result.status === 'sent').length, total: due.length, results }
}
