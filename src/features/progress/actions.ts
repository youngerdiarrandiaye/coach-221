'use server'

import { revalidatePath } from 'next/cache'
import { progressSchema, type ProgressFormData } from './schemas'
import { progressDao } from '@/dao/progressDao'
import { getServerUser } from '@/lib/session'
import { getErrorMessage } from '@/exception/AppError'

type ActionResult = { success?: boolean; error?: string }

export async function createProgressAction(clientId: string, data: ProgressFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = progressSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const poids = parseFloat(parsed.data.poids_kg)
  if (isNaN(poids) || poids <= 0 || poids > 500) return { error: 'Poids invalide' }

  const parseOpt = (v?: string) => (v && v.trim() !== '' ? parseFloat(v) : null)

  try {
    const entry = await progressDao.create(user.id, {
      client_id:   clientId,
      poids_kg:    poids,
      notes:       parsed.data.notes?.trim() || null,
      mesure_date: parsed.data.mesure_date,
      frequence_cardiaque_repos_bpm:  parseOpt(parsed.data.frequence_cardiaque_repos_bpm),
      frequence_cardiaque_effort_bpm: parseOpt(parsed.data.frequence_cardiaque_effort_bpm),
      tour_taille_cm: parseOpt(parsed.data.tour_taille_cm),
      hanches_cm:     parseOpt(parsed.data.hanches_cm),
      bras_cm:        parseOpt(parsed.data.bras_cm),
      cuisse_cm:      parseOpt(parsed.data.cuisse_cm),
      masse_grasse_pct: parseOpt(parsed.data.masse_grasse_pct),
    })
    if (!entry) return { error: 'Erreur lors de la création' }
    revalidatePath(`/progress/${clientId}`)
    revalidatePath('/progress')
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function deleteProgressAction(id: string, clientId: string): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }
  try {
    await progressDao.remove(id, user.id)
    revalidatePath(`/progress/${clientId}`)
    revalidatePath('/progress')
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}
