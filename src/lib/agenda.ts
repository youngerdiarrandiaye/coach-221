// Fonctions pures de l'agenda : période, chevauchement, dates. Aucune dépendance réseau ni base.
import { isCalendarDate } from '@/lib/validation'

export const AGENDA_TIME_ZONE = 'Africa/Dakar'
export const MAX_PERIOD_DAYS = 100
export const MAX_PERIOD_ROWS = 1000

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Décalage (ms) du fuseau nommé par rapport à UTC à un instant donné. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Instant (ISO UTC) du début du jour civil `date` dans le fuseau de l'agenda. */
export function zonedDayStart(date: string, timeZone = AGENDA_TIME_ZONE): string {
  const guess = Date.parse(`${date}T00:00:00Z`)
  const first = guess - zoneOffsetMs(guess, timeZone)
  return new Date(guess - zoneOffsetMs(first, timeZone)).toISOString()
}

export type PeriodError = 'ORDER' | 'TOO_LONG'

/** Bornes [début, fin[ d'une période de jours Dakar, bornes `from` et `to` incluses. */
export function periodBounds(from: string, to: string) {
  if (!isCalendarDate(from) || !isCalendarDate(to) || to < from) throw new RangeError('ORDER' satisfies PeriodError)
  if (daysBetween(from, to) > MAX_PERIOD_DAYS) throw new RangeError('TOO_LONG' satisfies PeriodError)
  return { start: zonedDayStart(from), end: zonedDayStart(addDays(to, 1)) }
}

export interface Slot { date_heure: string | Date; duree_minutes: number }

/** Deux séances se chevauchent si début_a < fin_b et début_b < fin_a (fin exclusive). */
export function overlaps(a: Slot, b: Slot): boolean {
  const startA = new Date(a.date_heure).getTime()
  const startB = new Date(b.date_heure).getTime()
  return startA < startB + b.duree_minutes * 60_000 && startB < startA + a.duree_minutes * 60_000
}

/** Identifiants de séances en conflit transmis par la base (DETAIL « conflits:id,id »). */
export function parseConflictIds(detail: unknown): string[] {
  if (typeof detail !== 'string') return []
  const match = /conflits:([0-9a-f,-]+)/i.exec(detail)
  if (!match) return []
  return match[1].split(',').filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

/** Accepte « AAAA-MM-JJTHH:mm » (heure de Dakar) ou un horodatage ISO complet ; retourne l'ISO UTC. */
export function parseSessionDateTime(value: string): string {
  const local = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,3})?)?$/.exec(value)
  if (local) {
    if (!isCalendarDate(local[1])) throw new Error('Date et heure invalides')
    const minutes = Number(local[2]) * 60 + Number(local[3])
    return new Date(Date.parse(zonedDayStart(local[1])) + minutes * 60_000 + Number(local[4] ?? 0) * 1000).toISOString()
  }
  const full = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)$/.exec(value)
  if (!full || !isCalendarDate(full[1])) throw new Error('Date et heure invalides')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw new Error('Date et heure invalides')
  return parsed.toISOString()
}
