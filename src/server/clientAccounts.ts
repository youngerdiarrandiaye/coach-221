import { createClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import { clientDao } from '@/dao/clientDao'
import { profileDao } from '@/dao/profileDao'
import { coachLabel } from '@/lib/coachName'
import { accessStatus, inviteClient, inviteMessage, revokeClient, type ClientAccountDeps, type InviteClient, type InviteResult } from '@/services/clientAccountService'
import { found, HttpError, success } from './http'

const methodError = () => { throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.') }

const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** Appels réels : rôle de service pour créer le compte et le lien, client public pour envoyer l'e-mail. */
export function realClientAccountDeps(): ClientAccountDeps {
  const admin = createAdminSupabaseClient()
  return {
    async findAccount(clientId) {
      const { data, error } = await admin.from('client_accounts').select('user_id, invited_at, last_invite_sent_at').eq('client_id', clientId).maybeSingle()
      if (error) throw new HttpError(500, 'DATABASE_ERROR', 'Service indisponible.')
      return data
    },
    async createUser(input) {
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email,
        email_confirm: true,
        // app_metadata : écrit par le serveur seulement. C'est lui qui fait de ce compte un compte client (et non un coach).
        app_metadata: { role: 'client', client_id: input.clientId, coach_id: input.coachId },
        user_metadata: { prenom: input.prenom, nom: input.nom, espace: 'client', coach: input.coachLabel },
      })
      if (error || !data.user) {
        const taken = error?.status === 422 || /already|registered|exists/i.test(error?.message ?? '') || (error as { code?: string } | null)?.code === 'email_exists'
        return { error: taken ? 'EMAIL_IN_USE' : 'FAILED' }
      }
      // Ceinture et bretelles : le déclencheur SQL retire déjà le profil de coach créé avant l'écriture du rôle ; ici, on vérifie.
      await admin.from('profiles').delete().eq('id', data.user.id)
      return { id: data.user.id }
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw new HttpError(502, 'ACCESS_REVOKE_FAILED', 'Impossible de retirer l’accès du client. Réessayez.')
    },
    async insertAccount({ userId, clientId, coachId }) {
      const { error } = await admin.from('client_accounts').insert({ user_id: userId, client_id: clientId, coach_id: coachId })
      if (error) throw new HttpError(500, 'DATABASE_ERROR', 'Service indisponible.')
    },
    async touchAccount(userId) {
      await admin.from('client_accounts').update({ last_invite_sent_at: new Date().toISOString() }).eq('user_id', userId)
    },
    async sendLink(email) {
      // Client sans session ni cookie : l'envoi ne touche pas à la session du coach connecté.
      const publicClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', { auth: { persistSession: false, autoRefreshToken: false } })
      // Au plus 8 s : un serveur d'e-mail lent ne doit pas bloquer l'enregistrement du client (le coach pourra relancer).
      const sent = publicClient.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/confirm?next=/update-password` })
      const { error } = await Promise.race([sent, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), 8000))])
      if (error) throw new Error('envoi impossible')
    },
    async lastSignIn(userId) {
      const { data } = await admin.auth.admin.getUserById(userId)
      return data?.user?.last_sign_in_at ?? null
    },
    now: () => Date.now(),
  }
}

async function labelOf(coachId: string) {
  const profile = await profileDao.findById(coachId)
  return profile ? coachLabel(profile.prenom, profile.nom) : 'Votre coach'
}

/** Invite (ou relance) le client ; ne lève jamais d'erreur pour une panne d'envoi : le coach voit l'état et peut relancer. */
export async function inviteForClient(coachId: string, client: InviteClient): Promise<InviteResult & { message: string | null }> {
  const result = await inviteClient(realClientAccountDeps(), coachId, await labelOf(coachId), client)
  return { ...result, message: inviteMessage(result, client.email?.trim().toLowerCase() ?? null) }
}

/** Retire l'accès d'un client. Lève une erreur si la suppression échoue : le coach ne doit pas croire l'accès coupé. */
export const revokeForClient = (clientId: string) => revokeClient(realClientAccountDeps(), clientId)

/** Identifiant du compte de connexion du client (avant un effacement qui supprimerait le lien), ou null. */
export async function accountUserId(clientId: string): Promise<string | null> {
  return (await realClientAccountDeps().findAccount(clientId))?.user_id ?? null
}

export async function deleteAuthUser(userId: string) { await realClientAccountDeps().deleteUser(userId) }

/** clients/:id/invite : GET état de l'accès, POST envoi ou relance du lien, DELETE retrait de l'accès. */
export async function handleInvite(request: Request, clientId: string, coachId: string): Promise<Response> {
  const client = found(await clientDao.findById(clientId, coachId))
  if (request.method === 'GET') return success(await accessStatus(realClientAccountDeps(), clientId))
  if (request.method === 'POST') return success(await inviteForClient(coachId, { id: client.id, prenom: client.prenom, nom: client.nom, email: client.email }))
  if (request.method === 'DELETE') return success({ revoked: await revokeForClient(clientId) })
  return methodError()
}
