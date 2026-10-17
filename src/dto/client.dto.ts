export interface CreateClientDto {
  nom: string
  prenom: string
  telephone: string
  email?: string
  date_naissance?: string
  sexe?: 'HOMME' | 'FEMME'
  taille_cm?: number
  poids_initial_kg?: number
  objectif?: 'PERTE_DE_POIDS' | 'PRISE_DE_MASSE' | 'CARDIO' | 'TONIFICATION' | 'REMISE_EN_FORME' | 'REEDUCATION' | 'AUTRE'
}

export interface UpdateClientDto {
  nom?: string
  prenom?: string
  telephone?: string
  email?: string
  date_naissance?: string
  sexe?: 'HOMME' | 'FEMME'
  taille_cm?: number
  poids_initial_kg?: number
  objectif?: 'PERTE_DE_POIDS' | 'PRISE_DE_MASSE' | 'CARDIO' | 'TONIFICATION' | 'REMISE_EN_FORME' | 'REEDUCATION' | 'AUTRE'
  actif?: boolean
  avatar_url?: string
}

export interface ClientResponseDto {
  id: string
  nomComplet: string
  nom: string
  prenom: string
  telephone: string
  email: string | null
  dateNaissance: string | null
  age: number | null
  sexe: string | null
  tailleCm: number | null
  poidsInitialKg: number | null
  poidsActuelKg: number | null
  imc: number | null
  objectif: string | null
  objectifLabel: string | null
  avatarUrl: string | null
  actif: boolean
  nbSeances: number
  createdAt: string
}

export interface ClientListDto {
  clients: ClientResponseDto[]
  total: number
  page: number
  limit: number
}
