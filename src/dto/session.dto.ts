export interface CreateSessionDto {
  client_id: string
  titre: string
  description?: string
  date_heure: string
  duree_minutes: number
  notes?: string
}

export interface UpdateSessionDto {
  titre?: string
  description?: string
  date_heure?: string
  duree_minutes?: number
  statut?: 'PLANIFIEE' | 'EFFECTUEE' | 'ANNULEE'
  notes?: string
}

export interface SessionResponseDto {
  id: string
  titre: string
  description: string | null
  dateHeure: string
  dureeMinutes: number
  statut: 'PLANIFIEE' | 'EFFECTUEE' | 'ANNULEE'
  statutLabel: string
  notes: string | null
  clientId: string
  clientNomComplet: string
  clientAvatarUrl: string | null
  createdAt: string
}
