import { AppError } from '@/exception/AppError'
import { SessionConflictError } from '@/exception/SessionConflictError'
import { parseConflictIds } from '@/lib/agenda'

type DatabaseError = { code?: string; message: string; details?: string | null; detail?: string | null }

// Messages français écrits par nos fonctions SQL (22023) : les seuls textes de la base exposés au navigateur.
const SAFE_VALIDATION = /^(Paramètres|Confirmation|Aucune séance|Le nombre d’occurrences|La portée|Portée|Horaire ou durée)/

export function assertDatabaseSuccess(error: DatabaseError | null): void {
  if (!error) return
  if (error.code === '23P01') throw new SessionConflictError(parseConflictIds(error.details ?? error.detail))
  if (error.code === 'CS404') throw new AppError('Enregistrement introuvable ou accès refusé.', 'NOT_FOUND', 404)
  if (error.code === 'CS409') throw new AppError('Cette séance a été modifiée entre-temps. Rechargez-la avant de l’enregistrer.', 'STALE_VERSION', 409)
  if (error.code === 'CS410') throw new AppError(SAFE_VALIDATION.test(error.message) || /^Une séance effectuée/.test(error.message) ? error.message : 'Cette séance fait partie de l’historique.', 'SESSION_LOCKED', 409)
  if (error.code === '22023' && SAFE_VALIDATION.test(error.message)) throw new AppError(error.message, 'VALIDATION_ERROR', 400)
  const message = error.code === '23503' || error.code === '42501'
    ? 'Opération refusée. Vérifiez le client sélectionné et vos droits d’accès.'
    : error.code === '23505'
      ? 'Cet enregistrement existe déjà.'
      : 'Impossible d’enregistrer ou de charger les données. Veuillez réessayer.'
  throw new AppError(message, error.code)
}

export function requireAffectedRow<T>(data: T | null): T {
  if (!data) throw new AppError('Enregistrement introuvable ou accès refusé.', 'NOT_FOUND', 404)
  return data
}

export function assertResults<T extends readonly { error: DatabaseError | null }[]>(results: T): T {
  results.forEach(result => assertDatabaseSuccess(result.error))
  return results
}
