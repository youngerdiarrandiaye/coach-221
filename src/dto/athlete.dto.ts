export interface CreateAthleteDto {
  nom: string
  prenom: string
  email?: string
  telephone?: string
  date_naissance?: string
  sport: string
  niveau: 'DEBUTANT' | 'INTERMEDIAIRE' | 'AVANCE' | 'ELITE'
}

export interface UpdateAthleteDto {
  nom?: string
  prenom?: string
  email?: string
  telephone?: string
  date_naissance?: string
  sport?: string
  niveau?: 'DEBUTANT' | 'INTERMEDIAIRE' | 'AVANCE' | 'ELITE'
  actif?: boolean
  avatar_url?: string
}

export interface AthleteResponseDto {
  id: string
  nom: string
  prenom: string
  nomComplet: string
  email: string | null
  telephone: string | null
  dateNaissance: string | null
  sport: string
  niveau: string
  avatarUrl: string | null
  actif: boolean
  createdAt: string
}

export interface AthleteListDto {
  athletes: AthleteResponseDto[]
  total: number
  page: number
  limit: number
}
