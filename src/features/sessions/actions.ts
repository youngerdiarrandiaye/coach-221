'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { sessionSchema, type SessionFormData } from './schemas'
import { sessionDao } from '@/dao/sessionDao'
import { getServerUser } from '@/lib/session'
import { getErrorMessage } from '@/exception/AppError'
import type { SessionStatus } from '@/entities'
import { dakarDateTime } from '@/lib/validation'

type ActionResult = { success?: boolean; error?: string; id?: string }

export async function createSessionAction(data: SessionFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = sessionSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const duree = parseInt(parsed.data.duree_minutes, 10)
  if (isNaN(duree) || duree < 5 || duree > 480) return { error: 'Durée invalide (5–480 min)' }

  try {
    const session = await sessionDao.create(user.id, {
      client_id:     parsed.data.client_id,
      titre:         parsed.data.titre,
      description:   parsed.data.description || null,
      date_heure:    dakarDateTime(parsed.data.date_heure),
      duree_minutes: duree,
      statut:        'PLANIFIEE',
      notes:         parsed.data.notes || null,
      recurrence_id: null,
    })
    if (!session) return { error: 'Erreur lors de la création' }
    revalidatePath('/sessions')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`sessions-${user.id}`)
    return { success: true, id: session.id }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function updateSessionAction(id: string, data: SessionFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = sessionSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const duree = parseInt(parsed.data.duree_minutes, 10)
  if (isNaN(duree) || duree < 5 || duree > 480) return { error: 'Durée invalide (5–480 min)' }

  try {
    const session = await sessionDao.update(id, user.id, {
      titre:         parsed.data.titre,
      description:   parsed.data.description || null,
      date_heure:    dakarDateTime(parsed.data.date_heure),
      duree_minutes: duree,
      notes:         parsed.data.notes || null,
    })
    if (!session) return { error: 'Séance introuvable' }
    revalidatePath(`/sessions/${id}`)
    revalidatePath('/sessions')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`sessions-${user.id}`)
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function updateSessionStatusAction(id: string, statut: SessionStatus): Promise<ActionResult> {
  if (!['PLANIFIEE', 'EFFECTUEE', 'ANNULEE'].includes(statut)) return { error: 'Statut invalide' }
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }
  try {
    await sessionDao.updateStatus(id, user.id, statut)
    revalidatePath(`/sessions/${id}`)
    revalidatePath('/sessions')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`sessions-${user.id}`)
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function deleteSessionAction(id: string): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }
  try {
    await sessionDao.remove(id, user.id)
    revalidatePath('/sessions')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`sessions-${user.id}`)
  } catch (error) { return { error: getErrorMessage(error) } }
  redirect('/sessions')
}

export async function deleteSessionFromListAction(id: string): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }
  try {
    await sessionDao.remove(id, user.id)
    revalidatePath('/sessions')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`sessions-${user.id}`)
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}
