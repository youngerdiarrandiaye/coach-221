import { z } from 'zod'

const base64url = (label: string, max: number) =>
  z.string(`${label} requis`).trim().min(1, `${label} requis`).max(max, `${label} trop long`)
    .regex(/^[A-Za-z0-9_-]+$/, `${label} invalide`)

export const subscribeSchema = z.object({
  endpoint: z.string('Adresse d’abonnement requise').trim().max(1000, 'Adresse d’abonnement trop longue')
    .refine(v => { try { return new URL(v).protocol === 'https:' } catch { return false } }, 'Adresse d’abonnement invalide (https requis)'),
  keys: z.object({
    p256dh: base64url('Clé p256dh', 200),
    auth: base64url('Clé auth', 100),
  }, 'Clés d’abonnement requises'),
})

export const unsubscribeSchema = z.object({
  endpoint: z.string('Adresse d’abonnement requise').trim().min(1, 'Adresse d’abonnement requise').max(1000, 'Adresse d’abonnement trop longue'),
})

export const reminderSettingsSchema = z.object({
  enabled: z.boolean('Le champ « enabled » doit être vrai ou faux'),
  offsets: z.array(
    z.number('Chaque délai doit être un nombre').int('Chaque délai doit être un nombre entier de minutes')
      .min(1, 'Chaque délai doit être compris entre 1 et 1440 minutes').max(1440, 'Chaque délai doit être compris entre 1 et 1440 minutes'),
    'Les délais doivent être une liste',
  ).max(10, '10 délais au maximum'),
  system: z.boolean('Le champ « system » doit être vrai ou faux'),
}).transform(d => ({ ...d, offsets: Array.from(new Set(d.offsets)).sort((a, b) => a - b) }))

export type ReminderSettings = { enabled: boolean; offsets: number[]; system: boolean; updated_at: string | null }
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, offsets: [30], system: true, updated_at: null }
