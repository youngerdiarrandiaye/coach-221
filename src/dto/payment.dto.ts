export interface CreatePaymentDto {
  client_id: string
  montant: number
  methode: 'ESPECES' | 'WAVE' | 'ORANGE_MONEY'
  description?: string
  date_paiement: string
  statut?: 'PAYE' | 'EN_ATTENTE'
}

export interface UpdatePaymentDto {
  montant?: number
  methode?: 'ESPECES' | 'WAVE' | 'ORANGE_MONEY'
  statut?: 'PAYE' | 'EN_ATTENTE' | 'ANNULE'
  description?: string
  date_paiement?: string
}

export interface PaymentResponseDto {
  id: string
  montant: number
  montantFormate: string
  methode: 'ESPECES' | 'WAVE' | 'ORANGE_MONEY'
  methodeLabel: string
  statut: 'PAYE' | 'EN_ATTENTE' | 'ANNULE'
  statutLabel: string
  description: string | null
  datePaiement: string
  clientId: string
  clientNomComplet: string
  createdAt: string
}

export interface PaymentStatsDto {
  totalMois: number
  totalMoisFormate: string
  totalAnnee: number
  nombrePaiementsMois: number
  parMethode: { methode: string; total: number }[]
}
