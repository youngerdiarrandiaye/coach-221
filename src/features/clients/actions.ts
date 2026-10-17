'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { clientSchema, type ClientFormData } from './schemas'
import { clientDao } from '@/dao/clientDao'
import { getServerUser } from '@/lib/session'
import { getErrorMessage } from '@/exception/AppError'

type ActionResult = { success?: boolean; error?: string; id?: string }

function toNum(v?: string): number | null {
  if (!v || v.trim() === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
function toStr(v?: string): string | null {
  return v && v.trim() !== '' ? v.trim() : null
}

export async function createClientAction(data: ClientFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = clientSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const client = await clientDao.create(user.id, {
      nom:              parsed.data.nom,
      prenom:           parsed.data.prenom,
      telephone:        parsed.data.telephone,
      email:            toStr(parsed.data.email),
      date_naissance:   toStr(parsed.data.date_naissance),
      sexe:             parsed.data.sexe             ?? null,
      taille_cm:        toNum(parsed.data.taille_cm),
      poids_initial_kg: toNum(parsed.data.poids_initial_kg),
      objectif:         parsed.data.objectif         ?? null,
      avatar_url:       null,
      actif:            true,
    })
    if (!client) return { error: 'Erreur lors de la création' }
    revalidatePath('/clients')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`clients-${user.id}`)
    return { success: true, id: client.id }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function updateClientAction(id: string, data: ClientFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = clientSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    const client = await clientDao.update(id, user.id, {
      nom:              parsed.data.nom,
      prenom:           parsed.data.prenom,
      telephone:        parsed.data.telephone,
      email:            toStr(parsed.data.email),
      date_naissance:   toStr(parsed.data.date_naissance),
      sexe:             parsed.data.sexe             ?? null,
      taille_cm:        toNum(parsed.data.taille_cm),
      poids_initial_kg: toNum(parsed.data.poids_initial_kg),
      objectif:         parsed.data.objectif         ?? null,
    })
    if (!client) return { error: 'Client introuvable' }
    revalidatePath(`/clients/${id}`)
    revalidatePath('/clients')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`clients-${user.id}`)
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function deleteClientAction(id: string): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }
  try {
    await clientDao.softDelete(id, user.id)
    revalidatePath('/clients')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`clients-${user.id}`)
  } catch (error) { return { error: getErrorMessage(error) } }
  redirect('/clients')
}
