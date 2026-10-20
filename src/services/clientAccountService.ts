// Accès à l'espace client : invitation par e-mail, relance, retrait. Sans accès direct à Supabase : tout passe par `deps`
// (src/server/clientAccounts.ts branche les vrais appels ; les tests, des faux).
import { z } from 'zod'

export interface AccountRecord { user_id: string; invited_at: string; last_invite_sent_at: string }

export interface ClientAccountDeps {
  findAccount(clientId: string): Promise<AccountRecord | null>
  /** Crée le compte de connexion du client (jamais un coach) ; EMAIL_IN_USE si l'adresse a déjà un compte. */
  createUser(input: { email: string; prenom: string; nom: string; coachLabel: string; clientId: string; coachId: string }): Promise<{ id: string } | { error: 'EMAIL_IN_USE' | 'FAILED' }>
  deleteUser(userId: string): Promise<void>
  insertAccount(input: { userId: string; clientId: string; coachId: string }): Promise<void>
  touchAccount(userId: string): Promise<void>
  /** Envoie le lien « choisissez votre mot de passe » (même modèle que la réinitialisation). */
  sendLink(email: string): Promise<void>
  lastSignIn(userId: string): Promise<string | null>
  now(): number
}

export interface InviteClient { id: string; prenom: string; nom: string; email: string | null }

export type InviteState = 'INVITED' | 'RESENT' | 'NO_EMAIL' | 'INVALID_EMAIL' | 'EMAIL_IN_USE' | 'TOO_SOON' | 'FAILED'
export interface InviteResult { state: InviteState; mailSent: boolean; retryAfter?: number }

/** Délai minimal entre deux envois pour un même client (le Supabase en impose un aussi, par adresse). */
export const RESEND_DELAY_SECONDS = 60

const emailSchema = z.string().trim().toLowerCase().email().max(254)

export async function inviteClient(deps: ClientAccountDeps, coachId: string, coachLabel: string, client: InviteClient): Promise<InviteResult> {
  const raw = client.email?.trim()
  if (!raw) return { state: 'NO_EMAIL', mailSent: false }
  const parsed = emailSchema.safeParse(raw)
  if (!parsed.success) return { state: 'INVALID_EMAIL', mailSent: false }
  const email = parsed.data

  const existing = await deps.findAccount(client.id)
  if (existing) {
    const wait = RESEND_DELAY_SECONDS - Math.floor((deps.now() - Date.parse(existing.last_invite_sent_at)) / 1000)
    if (wait > 0) return { state: 'TOO_SOON', mailSent: false, retryAfter: wait }
    try { await deps.sendLink(email) } catch { return { state: 'FAILED', mailSent: false } }
    await deps.touchAccount(existing.user_id)
    return { state: 'RESENT', mailSent: true }
  }

  const created = await deps.createUser({ email, prenom: client.prenom, nom: client.nom, coachLabel, clientId: client.id, coachId })
  if ('error' in created) return { state: created.error === 'EMAIL_IN_USE' ? 'EMAIL_IN_USE' : 'FAILED', mailSent: false }
  try { await deps.insertAccount({ userId: created.id, clientId: client.id, coachId }) } catch (error) {
    // Pas de compte orphelin : sans lien vers la fiche, le compte créé ne servirait à rien.
    await deps.deleteUser(created.id).catch(() => undefined)
    throw error
  }
  // Le compte existe : si l'envoi échoue, le coach peut relancer (l'état reste « invité »).
  try { await deps.sendLink(email) } catch { return { state: 'INVITED', mailSent: false } }
  return { state: 'INVITED', mailSent: true }
}

/** Retire l'accès : le compte de connexion est supprimé (le client ne peut plus se connecter). Sans compte : sans effet. */
export async function revokeClient(deps: ClientAccountDeps, clientId: string): Promise<boolean> {
  const account = await deps.findAccount(clientId)
  if (!account) return false
  await deps.deleteUser(account.user_id)
  return true
}

export type AccessState = 'NONE' | 'INVITED' | 'ACTIVE'
export interface AccessStatus { state: AccessState; invited_at: string | null; last_invite_sent_at: string | null; last_sign_in_at: string | null }

export async function accessStatus(deps: ClientAccountDeps, clientId: string): Promise<AccessStatus> {
  const account = await deps.findAccount(clientId)
  if (!account) return { state: 'NONE', invited_at: null, last_invite_sent_at: null, last_sign_in_at: null }
  const lastSignIn = await deps.lastSignIn(account.user_id)
  return { state: lastSignIn ? 'ACTIVE' : 'INVITED', invited_at: account.invited_at, last_invite_sent_at: account.last_invite_sent_at, last_sign_in_at: lastSignIn }
}

/** Phrase à montrer au coach après une tentative d'invitation (jamais le détail technique). */
export function inviteMessage(result: InviteResult, email: string | null): string | null {
  switch (result.state) {
    case 'INVITED': return result.mailSent ? `Lien d’accès envoyé à ${email}.` : 'Accès créé, mais l’e-mail n’a pas pu partir : relancez l’envoi depuis la fiche du client.'
    case 'RESENT': return `Lien d’accès renvoyé à ${email}.`
    case 'INVALID_EMAIL': return 'Adresse e-mail invalide : aucun lien n’a été envoyé.'
    case 'EMAIL_IN_USE': return 'Cette adresse e-mail a déjà un compte CoachSen : aucun lien n’a été envoyé.'
    case 'TOO_SOON': return `Un lien vient d’être envoyé. Réessayez dans ${result.retryAfter} secondes.`
    case 'FAILED': return 'Le lien d’accès n’a pas pu être envoyé. Réessayez dans un instant.'
    case 'NO_EMAIL': return null
  }
}
