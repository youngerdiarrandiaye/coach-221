import { z } from 'zod'

export const clientSchema = z.object({
  nom:              z.string().min(2, 'Nom requis (2 car. min)').max(50),
  prenom:           z.string().min(2, 'Prénom requis (2 car. min)').max(50),
  telephone:        z.string().min(8, 'Numéro invalide').max(20),
  email:            z.string().trim().email('Adresse e-mail invalide').max(254).or(z.literal('')).optional(),
  date_naissance:   z.string().optional(),
  sexe:             z.enum(['HOMME', 'FEMME']).optional(),
  taille_cm:        z.string().optional(),
  poids_initial_kg: z.string().optional(),
  objectif:         z
    .enum(['PERTE_DE_POIDS', 'PRISE_DE_MASSE', 'CARDIO', 'TONIFICATION', 'REMISE_EN_FORME', 'REEDUCATION', 'AUTRE'])
    .optional(),
})

export type ClientFormData = z.infer<typeof clientSchema>
