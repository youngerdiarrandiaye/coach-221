import { z } from 'zod'
import { calendarDateSchema } from '@/lib/validation'

const optNum = (min: number, max: number, integer = false) =>
  z.string().optional().refine(
    v => !v?.trim() || (/^\d+(\.\d+)?$/.test(v) && Number(v) >= min && Number(v) <= max && (!integer || Number.isInteger(Number(v)))),
    { message: `Valeur hors plage (${min}–${max})` },
  )

export const progressSchema = z.object({
  poids_kg:    z.string().regex(/^\d+(\.\d+)?$/, 'Poids invalide').refine(v => Number(v) >= 20 && Number(v) <= 500, 'Poids invalide (20–500 kg)'),
  notes:       z.string().optional(),
  mesure_date: calendarDateSchema,

  frequence_cardiaque_repos_bpm:  optNum(20, 220, true),
  frequence_cardiaque_effort_bpm: optNum(40, 300, true),

  tour_taille_cm: optNum(30, 250),
  hanches_cm:     optNum(30, 250),
  bras_cm:        optNum(5, 100),
  cuisse_cm:      optNum(15, 150),

  masse_grasse_pct: optNum(1, 70),
})

export type ProgressFormData = z.infer<typeof progressSchema>
