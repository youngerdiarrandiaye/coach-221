import { z } from 'zod'

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const calendarDateSchema = z.string().refine(isCalendarDate, 'Date invalide')
export const durationSchema = z.string().regex(/^\d+$/, 'Durée invalide').refine(
  value => Number(value) >= 5 && Number(value) <= 480, 'Durée invalide (5–480 min)',
)
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide')

// Les montants FCFA sont des entiers ; PostgreSQL utilise NUMERIC(10,0).
export const cfaAmountSchema = z.string().trim().regex(/^\d+$/, 'Saisissez un montant entier en FCFA').refine(
  value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 9_999_999_999,
  'Le montant doit être compris entre 1 et 9 999 999 999 FCFA',
)

export function dakarDateTime(value: string): string {
  const [date, time] = value.split('T')
  if (!isCalendarDate(date) || !timeSchema.safeParse(time).success) throw new Error('Date et heure invalides')
  // Dakar utilise UTC toute l’année ; aucune dépendance au fuseau du serveur.
  return `${date}T${time}:00.000Z`
}
