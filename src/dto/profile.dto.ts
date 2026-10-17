export interface UpdateProfileDto {
  nom?: string
  prenom?: string
  telephone?: string
  specialite?: string
  zone?: string
  description?: string
  avatar_url?: string
}

export interface ProfileResponseDto {
  id: string
  email: string
  nomComplet: string
  nom: string
  prenom: string
  telephone: string | null
  specialite: string | null
  zone: string | null
  description: string | null
  avatarUrl: string | null
  createdAt: string
}
