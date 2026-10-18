import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { authService } from '@/services/authService'
import { clientDao } from '@/dao/clientDao'
import { sessionDao } from '@/dao/sessionDao'
import { paymentDao } from '@/dao/paymentDao'
import { profileDao } from '@/dao/profileDao'
import { progressDao } from '@/dao/progressDao'
import { sessionRecurrenceDao } from '@/dao/sessionRecurrenceDao'
import { agendaDao } from '@/dao/agendaDao'
import { clientSchema } from '@/features/clients/schemas'
import { agendaRecurrenceSchema, conflictCheckSchema, sessionCreateSchema, sessionPatchSchema, statusPatchSchema } from '@/features/sessions/agendaSchemas'
import { paymentSchema } from '@/features/payments/schemas'
import { progressSchema } from '@/features/progress/schemas'
import { profileSchema } from '@/features/profile/schemas'
import { loginSchema, registerSchema, resetSchema, updatePasswordSchema } from '@/features/auth/schemas'
import { getStatsData } from '@/features/stats/statsService'
import { failure, found, HttpError, readJson, success, uuid, validateMutation } from './http'
import { handleExport, uploadAvatar } from './exports'
import { handleTraining } from './training'
import { handleVoice } from './voice'
import { voiceDeps } from './voiceDeps'
import { handlePush } from './push'
import { rateLimitStore } from '@/dao/rateLimitDao'
import { clientIp, enforceRateLimits, RATE_RULES, type RateCheck } from '@/lib/rateLimit'
import { handleActivity, handleClientData, handleFrequentClients, handleSessionTitles } from './clientData'
import { changeStatus, patchSession, periodFromUrl, scopeFromUrl, withConflicts } from './agenda'

const num = (v?: string) => v?.trim() ? Number(v) : null
const str = (v?: string) => v?.trim() || null
const limit = (...checks: RateCheck[]) => enforceRateLimits(rateLimitStore(), checks)
const methodError = () => { throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.') }

export async function handleApiRequest(request: Request, context: { params: { path: string[] } }): Promise<Response> {
  try {
    validateMutation(request)
    const path = context.params.path
    const [resource, rawId, operation] = path
    const method = request.method
    const url = new URL(request.url)
    const known = ['auth', 'clients', 'sessions', 'payments', 'progress', 'recurrences', 'profile', 'stats', 'notifications', 'dashboard', 'search', 'exports', 'exercises', 'workouts', 'records', 'analytics', 'rum', 'push', 'reminders', 'activity', 'voice']
    const validShape = resource === 'exports' ? path.length <= 4
      : resource === 'auth' ? path.length === 2
      : resource === 'sessions' && rawId === 'titles' ? path.length === 2 && method === 'GET'
      : resource === 'voice' ? path.length === 2 && rawId === 'parse'
      : resource === 'activity' ? path.length === 1 && method === 'GET'
      : resource === 'clients' && rawId === 'frequent' ? path.length === 2 && method === 'GET'
      : resource === 'clients' && path.length === 3 ? (operation === 'export' || operation === 'defaults' ? method === 'GET' : operation === 'erase' && method === 'POST')
      : resource === 'sessions' && operation === 'status' ? path.length === 3 && method === 'PATCH'
      : ['clients', 'sessions', 'payments', 'recurrences'].includes(resource) ? path.length <= 2
      : resource === 'progress' ? path.length === 1 || (path.length === 2 && method === 'DELETE')
      : resource === 'exercises' || resource === 'records' || resource === 'analytics' ? path.length === 1
      : resource === 'workouts' ? path.length === 1 || (path.length === 2 && method === 'DELETE')
      : resource === 'rum' ? path.length === 1 || (path.length === 2 && rawId === 'summary' && method === 'GET')
      : resource === 'push' ? path.length === 2 && (rawId === 'key' ? method === 'GET' : ['subscribe', 'unsubscribe', 'test'].includes(rawId) && method === 'POST')
      : resource === 'reminders' ? path.length === 2 && rawId === 'settings' && (method === 'GET' || method === 'PUT')
      : resource === 'profile' ? path.length === 1 || (path.length === 2 && rawId === 'avatar' && method === 'POST')
      : path.length === 1
    if (!known.includes(resource) || !validShape) throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
    const supabase = createServerSupabaseClient()
    if (resource === 'auth') {
      if (rawId === 'session' && method === 'GET') {
        const { data: { user } } = await supabase.auth.getUser()
        return success({ user: user ? { id: user.id, email: user.email } : null, profile: user ? await profileDao.findById(user.id) : null })
      }
      if (method !== 'POST') return methodError()
      const body = await readJson(request)
      const ip = clientIp(request.headers)
      if (rawId === 'login') {
        const data = loginSchema.parse(body)
        await limit({ rule: RATE_RULES.login, scope: 'ip', identity: ip }, { rule: RATE_RULES.login, scope: 'email', identity: data.email }, { rule: RATE_RULES.loginDay, scope: 'email', identity: data.email })
        const { user } = await authService.login(data.email, data.password)
        return success({ user: { id: user.id, email: user.email } })
      }
      if (rawId === 'register') {
        const data = registerSchema.parse(body)
        await limit({ rule: RATE_RULES.register, scope: 'ip', identity: ip })
        const result = await authService.register(data.email, data.password, data)
        return success({ needsConfirmation: !result.session, user: result.user ? { id: result.user.id, email: result.user.email } : null }, 201)
      }
      if (rawId === 'reset-password' || rawId === 'resend-confirmation') {
        const data = resetSchema.parse(body)
        const scope = rawId === 'reset-password' ? '' : 'resend-'
        await limit({ rule: RATE_RULES.reset, scope: scope + 'email', identity: data.email }, { rule: RATE_RULES.reset, scope: scope + 'ip', identity: ip })
        if (rawId === 'reset-password') await authService.sendResetEmail(data.email)
        else await authService.resendConfirmation(data.email)
        return success({ success: true })
      }
      if (rawId === 'logout') { await authService.logout(); return success({ success: true }) }
      if (rawId === 'update-password') {
        const data = updatePasswordSchema.parse(body)
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) throw new HttpError(401, 'UNAUTHENTICATED', 'Votre session a expiré.')
        const updated = await supabase.auth.updateUser({ password: data.password })
        if (updated.error) throw new HttpError(400, 'PASSWORD_REJECTED', 'Impossible de modifier le mot de passe.')
        return success({ success: true })
      }
      throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
    }
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new HttpError(401, 'UNAUTHENTICATED', 'Connectez-vous pour continuer.')
    const coachId = user.id
    // Limitation de débit par coach (B1) ; ouverte par défaut si la base est indisponible.
    const checks: RateCheck[] = []
    if (resource === 'rum' && method === 'POST') checks.push({ rule: RATE_RULES.rum, scope: 'coach', identity: coachId })
    else if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) checks.push({ rule: RATE_RULES.mutations, scope: 'coach', identity: coachId })
    if (resource === 'voice' && method === 'POST') checks.push({ rule: RATE_RULES.voiceMinute, scope: 'coach', identity: coachId }, { rule: RATE_RULES.voiceDay, scope: 'coach', identity: coachId })
    if (resource === 'push' && rawId === 'test') checks.push({ rule: RATE_RULES.pushTest, scope: 'coach', identity: coachId })
    if (resource === 'exports' || (resource === 'clients' && operation === 'export')) checks.push({ rule: RATE_RULES.exports, scope: 'coach', identity: coachId })
    await limit(...checks)
    if (resource === 'exports') return await handleExport(request, path.slice(1), coachId)
    if (resource === 'voice') return await handleVoice(request, coachId, voiceDeps)
    if (['exercises', 'workouts', 'records', 'analytics', 'rum'].includes(resource)) return await handleTraining(request, path, coachId)
    if (resource === 'push' || resource === 'reminders') return await handlePush(request, path, coachId)
    if (resource === 'profile' && rawId === 'avatar' && method === 'POST') return success(await uploadAvatar(request, coachId))
    if (resource === 'sessions' && rawId === 'conflicts') {
      if (method !== 'POST') return methodError()
      const d = conflictCheckSchema.parse(await readJson(request))
      return success({ conflicts: await agendaDao.findConflicts(d.date_heure, d.duree_minutes, d.exclude_id) })
    }
    if (resource === 'sessions' && rawId === 'titles') return await handleSessionTitles(request)
    if (resource === 'activity') return await handleActivity(request)
    if (resource === 'clients' && rawId === 'frequent') return await handleFrequentClients(request)
    const id = rawId ? uuid(rawId) : undefined
    if (resource === 'clients' && id && operation) return await handleClientData(request, id, operation, coachId)
    const search = z.string().max(100).parse(url.searchParams.get('search') ?? '').replace(/[,().%_]/g, ' ').trim()
    const clientId = url.searchParams.has('clientId') ? uuid(url.searchParams.get('clientId')) : undefined
    if (method === 'GET') {
      switch (resource) {
        case 'clients': return success(id ? found(await clientDao.findById(id, coachId)) : await clientDao.findAll(coachId, search))
        case 'sessions': {
          if (id) return success(found(await sessionDao.findById(id, coachId)))
          const period = periodFromUrl(url)
          if (period.from && period.to) return success(await agendaDao.findByPeriod(coachId, { from: period.from, to: period.to, clientId, statut: period.statut, search }))
          return success(await sessionDao.findAll(coachId, { search, clientId, statut: period.statut }))
        }
        case 'payments': return success(id ? found(await paymentDao.findById(id, coachId)) : clientId ? await paymentDao.findByClient(clientId, coachId) : await paymentDao.findAll(coachId, { search }))
        case 'progress': return success(clientId ? await progressDao.findByClient(clientId, coachId) : await progressDao.findAll(coachId))
        case 'recurrences': return success(id ? found(await sessionRecurrenceDao.findById(id, coachId)) : await sessionRecurrenceDao.findAll(coachId))
        case 'profile': return success(found(await profileDao.findById(coachId)))
        case 'stats': return success(await getStatsData(coachId))
        case 'notifications': return success(await sessionDao.findInNextMinutes(coachId, 120))
        case 'dashboard': {
          const [stats, upcomingSessions, todaySessions, recentPayments, weeklySessions, pendingPayments] = await Promise.all([getStatsData(coachId), sessionDao.findUpcoming(coachId), sessionDao.findToday(coachId), paymentDao.findRecent(coachId), sessionDao.findThisWeek(coachId), paymentDao.findPending(coachId)])
          return success({ stats, upcomingSessions, todaySessions, recentPayments, weeklySessions, pendingPayments })
        }
        case 'search': {
          const q = (url.searchParams.get('q') ?? search).replace(/[,().%_]/g, ' ').trim().slice(0, 100)
          if (q.length < 2) return success({ clients: [], sessions: [], payments: [], total: 0 })
          const [clients, sessions, payments] = await Promise.all([clientDao.findAll(coachId, q), sessionDao.findAll(coachId, { search: q }), paymentDao.findAll(coachId, { search: q })])
          return success({ clients: clients.slice(0, 4), sessions: sessions.slice(0, 4), payments: payments.slice(0, 4), total: clients.length + sessions.length + payments.length })
        }
      }
    }
    let result: unknown
    if (method === 'DELETE' && id) {
      switch (resource) {
        case 'clients': await clientDao.softDelete(id, coachId); break
        case 'sessions': result = { success: true, ...await agendaDao.remove(id, scopeFromUrl(url)) }; break
        case 'payments': await paymentDao.remove(id, coachId); break
        case 'progress': await progressDao.remove(id, coachId); break
        case 'recurrences': found(await sessionRecurrenceDao.findById(id, coachId)); await sessionRecurrenceDao.removeWithFutureSessions(id); break
        default: return methodError()
      }
      result ??= { success: true }
    } else if (method === 'POST' || method === 'PATCH') {
      const body = await readJson(request)
      if (resource === 'sessions' && id && operation === 'status' && method === 'PATCH') {
        const { statut, scope } = statusPatchSchema.parse(body)
        result = await changeStatus(id, coachId, statut, scope)
      } else {
        if (operation || (method === 'POST' && id) || (method === 'PATCH' && !id && resource !== 'profile')) return methodError()
        switch (resource) {
          case 'clients': {
            const d = clientSchema.parse(body)
            const payload = { nom: d.nom, prenom: d.prenom, telephone: d.telephone, email: str(d.email), date_naissance: str(d.date_naissance), sexe: d.sexe ?? null, taille_cm: num(d.taille_cm), poids_initial_kg: num(d.poids_initial_kg), objectif: d.objectif ?? null }
            result = id ? await clientDao.update(id, coachId, payload) : await clientDao.create(coachId, { ...payload, avatar_url: null, actif: true })
            break
          }
          case 'sessions': {
            if (id) { result = await patchSession(id, coachId, sessionPatchSchema.parse(body)); break }
            const d = sessionCreateSchema.parse(body)
            const created = await withConflicts(() => sessionDao.create(coachId, {
              client_id: d.client_id, titre: d.titre, description: d.description, notes: d.notes,
              date_heure: d.date_heure, duree_minutes: d.duree_minutes, statut: 'PLANIFIEE', recurrence_id: null, occurrence_date: null,
            }))
            result = found(await sessionDao.findById(found(created).id, coachId))
            break
          }
          case 'payments': {
            const d = paymentSchema.parse(body)
            if (id && found(await paymentDao.findById(id, coachId)).client_id !== d.client_id) throw new HttpError(400, 'CLIENT_IMMUTABLE', 'Le client de ce paiement ne peut pas être modifié.')
            const payload = { montant: Number(d.montant), methode: d.methode, statut: d.statut, description: str(d.description), date_paiement: d.date_paiement }
            result = id ? await paymentDao.update(id, coachId, payload) : await paymentDao.create(coachId, { ...payload, client_id: d.client_id })
            break
          }
          case 'progress': {
            if (id || method !== 'POST') return methodError()
            const d = progressSchema.extend({ client_id: z.string().uuid() }).parse(body)
            result = await progressDao.create(coachId, { client_id: d.client_id, poids_kg: Number(d.poids_kg), mesure_date: d.mesure_date, notes: str(d.notes), frequence_cardiaque_repos_bpm: num(d.frequence_cardiaque_repos_bpm), frequence_cardiaque_effort_bpm: num(d.frequence_cardiaque_effort_bpm), tour_taille_cm: num(d.tour_taille_cm), hanches_cm: num(d.hanches_cm), bras_cm: num(d.bras_cm), cuisse_cm: num(d.cuisse_cm), masse_grasse_pct: num(d.masse_grasse_pct) })
            break
          }
          case 'recurrences': {
            if (id || method !== 'POST') return methodError()
            result = await withConflicts(() => agendaDao.createRecurrence(coachId, agendaRecurrenceSchema.parse(body))); break
          }
          case 'profile': {
            if (id || method !== 'PATCH') return methodError()
            const d = profileSchema.parse(body)
            result = await profileDao.update(coachId, d); break
          }
          default: return methodError()
        }
      }
    } else return methodError()
    for (const tag of ['dashboard', 'stats', 'clients', 'sessions', 'payments']) revalidateTag(`${tag}-${coachId}`)
    return success(found(result), method === 'POST' ? 201 : 200)
  } catch (error) { return failure(error) }
}
