import { z } from 'zod'
import { calendarDateSchema, cfaAmountSchema } from '@/lib/validation'

export const paymentSchema = z.object({
  client_id:     z.string().uuid('Client requis'),
  montant:       cfaAmountSchema,
  methode:       z.enum(['ESPECES', 'WAVE', 'ORANGE_MONEY'], { message: 'Méthode requise' }),
  statut:        z.enum(['PAYE', 'EN_ATTENTE', 'ANNULE']).default('PAYE'),
  description:   z.string().optional(),
  date_paiement: calendarDateSchema,
})

export type PaymentFormData = z.infer<typeof paymentSchema>
