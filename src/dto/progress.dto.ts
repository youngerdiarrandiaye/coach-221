export interface CreateProgressEntryDto {
  client_id: string
  poids_kg?: number
  notes?: string
  mesure_date: string
}

export interface ProgressEntryResponseDto {
  id: string
  clientId: string
  poidsKg: number | null
  imc: number | null
  imcLabel: string | null
  notes: string | null
  mesureDate: string
  createdAt: string
}

export interface ProgressStatsDto {
  poidsInitial: number | null
  poidsActuel: number | null
  variation: number | null
  variationPct: number | null
  imcActuel: number | null
  imcLabel: string | null
  historique: ProgressEntryResponseDto[]
}
