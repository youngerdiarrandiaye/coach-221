import { z } from 'zod'

export const profileSchema = z.object({
  nom:        z.string().min(2, 'Nom requis (2 car. min)').max(50),
  prenom:     z.string().min(2, 'Prénom requis (2 car. min)').max(50),
  telephone:  z.string().optional(),
  specialite: z.string().optional(),
  zone:       z.string().optional(),
  description:z.string().optional(),
})

export type ProfileFormData = z.infer<typeof profileSchema>
