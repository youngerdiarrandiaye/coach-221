// Schémas stricts de l'agenda (contrat docs/AGENDA_CONTRACT.md). Messages en français ; aucun coachId accepté.
import { z } from 'zod'
import { calendarDateSchema, timeSchema } from '@/lib/validation'
import { daysBetween, parseSessionDateTime } from '@/lib/agenda'

const strict = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape, {
  error: issue => issue.code === 'unrecognized_keys' ? `Champ non autorisé : ${issue.keys.join(', ')}.` : 'Corps de requête invalide.',
})

export const scopeSchema = z.enum(['ONE', 'FOLLOWING', 'ALL'], { error: 'Portée invalide (ONE, FOLLOWING ou ALL).' })
export const statutSchema = z.enum(['PLANIFIEE', 'EFFECTUEE', 'ANNULEE'], { error: 'Statut invalide (PLANIFIEE, EFFECTUEE ou ANNULEE).' })
export const uuidField = (label: string) => z.string({ error: `${label} requis.` }).uuid(`${label} invalide.`)

const dateHeure = z.string({ error: 'Date et heure requises.' })
  .refine(value => { try { parseSessionDateTime(value); return true } catch { return false } }, 'Date et heure invalides.')
  .transform(parseSessionDateTime)

const integerField = (message: string, min: number, max: number) => z.union([z.number(), z.string().regex(/^\d+$/, message)], { error: message })
  .transform(Number).pipe(z.number({ error: message }).int(message).min(min, message).max(max, message))

const duree = integerField('Durée invalide (5 à 480 minutes).', 5, 480)
const titre = z.string({ error: 'Titre requis (2 caractères minimum).' }).trim().min(2, 'Titre requis (2 caractères minimum).').max(100, 'Titre trop long (100 caractères maximum).')
const longText = z.string({ error: 'Texte invalide.' }).max(2000, 'Texte trop long (2000 caractères maximum).').nullish()
const optionalText = (value?: string | null) => value?.trim() ? value.trim() : null

export const sessionCreateSchema = strict({
  client_id: uuidField('Client'), titre, description: longText, notes: longText,
  date_heure: dateHeure, duree_minutes: duree,
}).transform(d => ({ ...d, description: optionalText(d.description), notes: optionalText(d.notes) }))

export const isoVersion = z.string({ error: 'La version de la séance (expected_updated_at) est requise.' })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/, 'Version de la séance invalide (expected_updated_at).')

export const sessionPatchSchema = strict({
  client_id: uuidField('Client').optional(),
  titre: titre.optional(), description: longText, notes: longText,
  date_heure: dateHeure.optional(), duree_minutes: duree.optional(),
  expected_updated_at: isoVersion, scope: scopeSchema.default('ONE'),
})

export const statusPatchSchema = strict({ statut: statutSchema, scope: scopeSchema.default('ONE') })

export const conflictCheckSchema = strict({ date_heure: dateHeure, duree_minutes: duree, exclude_id: uuidField('Séance exclue').optional() })

export const periodQuerySchema = z.object({
  from: calendarDateSchema.optional(), to: calendarDateSchema.optional(),
  statut: statutSchema.optional(),
}).refine(d => (d.from === undefined) === (d.to === undefined), { message: 'Indiquez les dates « from » et « to » ensemble.' })
  .refine(d => !d.from || !d.to || d.to >= d.from, { message: 'La date de fin doit suivre la date de début.' })
  .refine(d => !d.from || !d.to || daysBetween(d.from, d.to) <= 100, { message: 'La période ne peut pas dépasser 100 jours.' })

export const agendaRecurrenceSchema = strict({
  client_id: uuidField('Client'), titre, description: longText,
  duree_minutes: duree, heure: timeSchema,
  frequence: z.enum(['QUOTIDIENNE', 'HEBDOMADAIRE', 'MENSUELLE'], { error: 'Fréquence invalide (QUOTIDIENNE, HEBDOMADAIRE ou MENSUELLE).' }).default('HEBDOMADAIRE'),
  intervalle: integerField('Intervalle invalide (1 à 12).', 1, 12).default(1),
  jours: z.array(z.number({ error: 'Jour invalide (0 à 6).' }).int('Jour invalide (0 à 6).').min(0, 'Jour invalide (0 à 6).').max(6, 'Jour invalide (0 à 6).'), { error: 'Jours invalides.' }).max(7).optional(),
  date_debut: calendarDateSchema,
  date_fin: z.union([calendarDateSchema, z.literal('')]).nullish(),
  nb_occurrences: z.union([integerField('Nombre d’occurrences invalide (1 à 200).', 1, 200), z.literal('')]).nullish(),
  on_conflict: z.enum(['REJECT', 'SKIP'], { error: 'Gestion des conflits invalide (REJECT ou SKIP).' }).default('REJECT'),
}).transform(d => ({
  ...d, description: optionalText(d.description), date_fin: d.date_fin || null,
  nb_occurrences: d.nb_occurrences === '' || d.nb_occurrences == null ? null : d.nb_occurrences,
  jours: Array.from(new Set(d.jours ?? [])),
})).superRefine((d, ctx) => {
  const issue = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] })
  if (d.frequence === 'HEBDOMADAIRE' && d.jours.length === 0) issue('Choisissez au moins un jour pour une série hebdomadaire.', 'jours')
  if (!d.date_fin && d.nb_occurrences == null) issue('Indiquez une date de fin ou un nombre d’occurrences.', 'date_fin')
  if (d.date_fin && d.date_fin < d.date_debut) issue('La date de fin doit suivre la date de début.', 'date_fin')
  if (d.date_fin && d.date_fin >= d.date_debut && daysBetween(d.date_debut, d.date_fin) > 366) issue('La série ne peut pas dépasser 366 jours.', 'date_fin')
})

export type AgendaRecurrenceData = z.output<typeof agendaRecurrenceSchema>
export type SessionPatchData = z.output<typeof sessionPatchSchema>
