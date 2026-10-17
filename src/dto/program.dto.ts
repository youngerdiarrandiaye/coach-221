export interface CreateProgramDto {
  nom: string
  description?: string
  objectif?: string
  duree_semaines?: number
}

export interface UpdateProgramDto {
  nom?: string
  description?: string
  objectif?: string
  duree_semaines?: number
  statut?: 'ACTIF' | 'ARCHIVE' | 'BROUILLON'
}

export interface ProgramResponseDto {
  id: string
  nom: string
  description: string | null
  objectif: string | null
  dureeSemaines: number | null
  statut: string
  createdAt: string
}
