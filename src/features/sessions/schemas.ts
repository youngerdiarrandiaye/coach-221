import { z } from 'zod'
import { calendarDateSchema, durationSchema, timeSchema, dakarDateTime } from '@/lib/validation'

export const sessionSchema = z.object({
  client_id:      z.string().uuid('Client requis'),
  titre:          z.string().min(2, 'Titre requis (2 car. min)').max(100),
  description:    z.string().optional(),
  date_heure:     z.string().refine(value => {
    try { dakarDateTime(value); return true } catch { return false }
  }, 'Date et heure invalides'),
  duree_minutes:  durationSchema,
  notes:          z.string().optional(),
})

export type SessionFormData = z.infer<typeof sessionSchema>

export const recurrenceSchema = z.object({
  client_id:     z.string().uuid('Client requis'),
  titre:         z.string().min(2, 'Titre requis (2 car. min)').max(100),
  description:   z.string().optional(),
  duree_minutes: durationSchema,
  heure:         timeSchema,
  jours:         z.array(z.number().int().min(0).max(6)).min(1, 'Choisissez au moins un jour').max(7),
  date_debut:    calendarDateSchema,
  date_fin:      z.union([calendarDateSchema, z.literal('')]).optional(),
}).refine(data => !data.date_fin || (data.date_fin >= data.date_debut &&
  new Date(data.date_fin).getTime() - new Date(data.date_debut).getTime() <= 366 * 86_400_000), {
  message: 'Choisissez une fin après le début, dans une période maximale de 366 jours.', path: ['date_fin'],
})

export type RecurrenceFormData = z.infer<typeof recurrenceSchema>
