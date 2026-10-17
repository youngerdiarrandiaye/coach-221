'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { profileSchema, type ProfileFormData } from './schemas'
import { profileDao } from '@/dao/profileDao'
import { getServerUser } from '@/lib/session'
import { getErrorMessage } from '@/exception/AppError'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { createAdminSupabaseClient } from '@/config/supabase.admin'

type ActionResult = { success?: boolean; error?: string }

export async function updateProfileAction(data: ProfileFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = profileSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const profile = await profileDao.update(user.id, {
      nom:         parsed.data.nom,
      prenom:      parsed.data.prenom,
      telephone:   parsed.data.telephone?.trim()   || undefined,
      specialite:  parsed.data.specialite?.trim()  || undefined,
      zone:        parsed.data.zone?.trim()         || undefined,
      description: parsed.data.description?.trim() || undefined,
    })
    if (!profile) return { error: 'Profil introuvable' }
    revalidatePath('/profile')
    revalidatePath('/dashboard')
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function uploadAvatarAction(
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const file = formData.get('avatar') as File | null
  if (!file || file.size === 0) return { error: 'Aucun fichier sélectionné' }
  if (file.size > 5 * 1024 * 1024) return { error: 'Image trop lourde (max 5 Mo)' }
  if (!file.type.startsWith('image/')) return { error: 'Format invalide (JPEG, PNG, WebP)' }

  try {
    const supabase = createAdminSupabaseClient()
    const ext  = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${user.id}/avatar.${ext}`

    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: file.type, upsert: true })

    if (uploadError) return { error: uploadError.message }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = `${publicUrl}?v=${Date.now()}`

    await profileDao.update(user.id, { avatar_url: url })
    revalidatePath('/profile')
    revalidatePath('/dashboard')
    revalidatePath('/', 'layout')

    return { url }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function signOutAction(): Promise<void> {
  const supabase = createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/login')
}
