import { z } from 'zod'
import { calendarDateSchema } from '@/lib/validation'

const text = (min: number, max: number) => z.string().trim().min(min, 'Texte trop court').max(max, 'Texte trop long')

export const exerciseSchema = z.object({
  nom: text(2, 80),
  groupe_musculaire: z.string().trim().max(40, 'Groupe musculaire trop long').optional().nullable()
    .transform(v => v || null),
})

const two = (n: number) => Math.round(n * 100) / 100
const one = (n: number) => Math.round(n * 10) / 10

export const workoutSetSchema = z.object({
  reps: z.number('Répétitions invalides').int('Répétitions invalides').min(1, 'Répétitions : 1 à 100').max(100, 'Répétitions : 1 à 100'),
  charge_kg: z.number('Charge invalide').min(0, 'Charge : 0 à 1000 kg').max(1000, 'Charge : 0 à 1000 kg').transform(two),
  rpe: z.number('RPE invalide').min(1, 'RPE : 1 à 10').max(10, 'RPE : 1 à 10').transform(one).optional().nullable(),
})

export const workoutSchema = z.object({
  client_id: z.string().uuid('Client invalide'),
  log_date: calendarDateSchema,
  exercice_id: z.string().uuid('Exercice invalide').optional(),
  exercice_nom: text(2, 80).optional(),
  session_id: z.string().uuid('Séance invalide').optional().nullable(),
  notes: z.string().trim().max(500, 'Notes trop longues (500 caractères)').optional().nullable().transform(v => v || null),
  sets: z.array(workoutSetSchema).min(1, 'Au moins une série').max(20, '20 séries maximum'),
}).refine(d => !!d.exercice_id !== !!d.exercice_nom, { message: 'Indiquez exercice_id ou exercice_nom', path: ['exercice_id'] })

export const periodSchema = z.enum(['week', 'month', 'year'], 'Période invalide (week, month, year)')

// Valeurs RUM : un champ hors bornes est ignoré (null) plutôt que de rejeter l'événement.
const lenient = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().catch(null).transform(v => v ?? null)
export const rumSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/i),
  task: lenient(z.string().trim().min(1).max(60)),
  path: lenient(z.string().trim().min(1).max(120)),
  clicks: lenient(z.number().transform(Math.round).pipe(z.number().int().min(0).max(50))),
  duration_ms: lenient(z.number().transform(Math.round).pipe(z.number().int().min(0).max(600000))),
  value: lenient(z.number().min(-1e9).max(1e9)),
})
export type RumInput = z.infer<typeof rumSchema>
