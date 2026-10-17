// Logique serveur de l'agenda : appelée par le routeur ; le coachId vient toujours de la session.
import { agendaDao, type SessionPatch } from '@/dao/agendaDao'
import { sessionDao } from '@/dao/sessionDao'
import { SessionConflictError } from '@/exception/SessionConflictError'
import { periodQuerySchema, type SessionPatchData } from '@/features/sessions/agendaSchemas'
import { HttpError, found } from './http'
import type { SessionStatus } from '@/entities'

/** Complète une erreur de conflit avec les séances en cause (séances du coach connecté uniquement). */
export async function withConflicts<T>(run: () => Promise<T>): Promise<T> {
  try { return await run() } catch (error) {
    if (error instanceof SessionConflictError && !error.conflicts)
      throw new SessionConflictError(error.conflictIds, await agendaDao.conflictSummaries(error.conflictIds))
    throw error
  }
}

const emptyToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null)

/** Seuls les champs présents dans le corps sont modifiés ; null/chaîne vide efface description et notes. */
export function sessionPatch(data: SessionPatchData): SessionPatch {
  const patch: SessionPatch = {}
  if (data.titre !== undefined) patch.titre = data.titre
  if ('description' in data) patch.description = emptyToNull(data.description)
  if ('notes' in data) patch.notes = emptyToNull(data.notes)
  if (data.date_heure !== undefined) patch.date_heure = data.date_heure
  if (data.duree_minutes !== undefined) patch.duree_minutes = data.duree_minutes
  return patch
}

export function periodFromUrl(url: URL) {
  const raw = (name: string) => url.searchParams.get(name) ?? undefined
  const parsed = periodQuerySchema.parse({ from: raw('from'), to: raw('to'), statut: raw('statut') })
  return parsed
}

export async function patchSession(id: string, coachId: string, data: SessionPatchData) {
  const current = found(await sessionDao.findById(id, coachId))
  if (data.client_id && data.client_id !== current.client_id)
    throw new HttpError(400, 'CLIENT_IMMUTABLE', 'Le client de cette séance ne peut pas être modifié.')
  const { updated } = await withConflicts(() => agendaDao.update(id, data.expected_updated_at, data.scope, sessionPatch(data)))
  return { updated, session: found(await sessionDao.findById(id, coachId)) }
}

export async function changeStatus(id: string, coachId: string, statut: SessionStatus, scope: 'ONE' | 'FOLLOWING' | 'ALL') {
  const { updated } = await withConflicts(() => agendaDao.setStatus(id, statut, scope))
  return { ...found(await sessionDao.findById(id, coachId)), updated }
}

export const scopeFromUrl = (url: URL) => {
  const value = url.searchParams.get('scope') ?? 'ONE'
  if (!['ONE', 'FOLLOWING', 'ALL'].includes(value)) throw new HttpError(400, 'VALIDATION_ERROR', 'Portée invalide (ONE, FOLLOWING ou ALL).')
  return value as 'ONE' | 'FOLLOWING' | 'ALL'
}

