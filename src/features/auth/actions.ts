'use server'

import { redirect } from 'next/navigation'
import { authService } from '@/services/authService'
import { getErrorMessage } from '@/exception/AppError'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { loginSchema, registerSchema, resetSchema, updatePasswordSchema } from './schemas'
import type { LoginFormData, RegisterFormData, ResetFormData, UpdatePasswordFormData } from './schemas'

export type ActionResult = { error: string } | undefined

export async function loginAction(data: LoginFormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await authService.login(parsed.data.email, parsed.data.password)
  } catch (error) {
    return { error: getErrorMessage(error) }
  }

  redirect('/dashboard')
}

export async function registerAction(data: RegisterFormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  let hasSession = false
  try {
    const result = await authService.register(parsed.data.email, parsed.data.password, {
      nom: parsed.data.nom, prenom: parsed.data.prenom,
    })
    hasSession = Boolean(result.session)
  } catch (error) {
    return { error: getErrorMessage(error) }
  }

  if (hasSession) redirect('/dashboard')
  redirect(`/check-email?email=${encodeURIComponent(parsed.data.email)}`)
}

export async function resendConfirmationAction(data: { email: string }): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    await authService.resendConfirmation(parsed.data.email)
  } catch (error) {
    return { error: getErrorMessage(error) }
  }
  return undefined
}

export async function resetPasswordAction(data: ResetFormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await authService.sendResetEmail(parsed.data.email)
  } catch (error) {
    return { error: getErrorMessage(error) }
  }

  return undefined
}

export async function logoutAction(): Promise<void> {
  await authService.logout()
  redirect('/login')
}

export async function updatePasswordAction(data: UpdatePasswordFormData): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { error: 'Le lien a expiré. Demandez un nouveau lien de réinitialisation.' }
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) return { error: 'Impossible de modifier le mot de passe. Utilisez un mot de passe différent ou demandez un nouveau lien.' }
  } catch {
    return { error: 'Service indisponible. Veuillez réessayer.' }
  }
  return undefined
}
