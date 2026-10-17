import { AppError } from './AppError'

export interface ConflictSummary {
  id: string
  titre: string
  client_id: string
  client: string
  date_heure: string
  duree_minutes: number
}

/** Chevauchement horaire détecté par la base (code 23P01). La liste ne contient que des séances du coach. */
export class SessionConflictError extends AppError {
  constructor(public readonly conflictIds: string[], public readonly conflicts?: ConflictSummary[]) {
    super('Cette séance chevauche une autre séance de votre agenda.', 'SESSION_CONFLICT', 409,
      conflicts ? { conflicts } : undefined)
    this.name = 'SessionConflictError'
  }
}
