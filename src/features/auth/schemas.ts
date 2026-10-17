import { z } from 'zod'

export const loginSchema = z.object({
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export const registerSchema = z.object({
  nom:      z.string().min(2, 'Nom requis (min. 2 caractères)'),
  prenom:   z.string().min(2, 'Prénom requis (min. 2 caractères)'),
  email:    z.string().email('Email invalide'),
  password: z.string().min(6, 'Mot de passe trop court (min. 6 caractères)'),
  confirm:  z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm'],
})

export const resetSchema = z.object({
  email: z.string().email('Email invalide'),
})

export type LoginFormData    = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type ResetFormData    = z.infer<typeof resetSchema>

export const updatePasswordSchema = z.object({
  password: z.string().min(8, 'Utilisez au moins 8 caractères').max(128, 'Maximum 128 caractères'),
  confirm: z.string(),
}).refine(data => data.password === data.confirm, {
  message: 'Les mots de passe ne correspondent pas', path: ['confirm'],
})

export type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>
