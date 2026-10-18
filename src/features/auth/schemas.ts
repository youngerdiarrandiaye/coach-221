import { z } from 'zod'
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from './passwordPolicy'

export const loginSchema = z.object({
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export const registerSchema = z.object({
  nom:      z.string().min(2, 'Nom requis (min. 2 caractères)'),
  prenom:   z.string().min(2, 'Prénom requis (min. 2 caractères)'),
  email:    z.string().email('Email invalide'),
  password: z.string().min(PASSWORD_MIN, `Mot de passe trop court (min. ${PASSWORD_MIN} caractères)`).max(PASSWORD_MAX, `Maximum ${PASSWORD_MAX} caractères`),
  confirm:  z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm'],
}).superRefine((d, ctx) => {
  const problem = passwordProblem(d.password, { email: d.email, nom: d.nom, prenom: d.prenom })
  if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['password'] })
})

export const resetSchema = z.object({
  email: z.string().email('Email invalide'),
})

export type LoginFormData    = z.infer<typeof loginSchema>
export type RegisterFormData = z.infer<typeof registerSchema>
export type ResetFormData    = z.infer<typeof resetSchema>

export const updatePasswordSchema = z.object({
  password: z.string().min(PASSWORD_MIN, `Utilisez au moins ${PASSWORD_MIN} caractères`).max(PASSWORD_MAX, `Maximum ${PASSWORD_MAX} caractères`),
  confirm: z.string(),
}).refine(data => data.password === data.confirm, {
  message: 'Les mots de passe ne correspondent pas', path: ['confirm'],
}).superRefine((data, ctx) => {
  const problem = passwordProblem(data.password)
  if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['password'] })
})

export type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>
