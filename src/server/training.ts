import { z } from 'zod'
import { idempotencyStore } from '@/dao/idempotencyDao'
import { requireClient } from '@/dao/requireClient'
import { workoutDao } from '@/dao/workoutDao'
import { rumDao } from '@/dao/rumDao'
import { calendarDateSchema } from '@/lib/validation'
import { aggregateRecords, computeAnalytics, countRecordsInRange, dakarToday, detectNewRecords, periodRange, summarizeRum } from '@/lib/workoutMath'
import { exerciseSchema, periodSchema, rumSchema, workoutSchema } from '@/features/workouts/schemas'
import { HttpError, readJson, success, uuid } from './http'
import { requestHash, runIdempotent } from './idempotency'

const RUM_MAX_BYTES = 1024

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
const methodError = () => { throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.') }
const optionalUuid = (v: string | null) => v === null ? undefined : uuid(v)
const optionalDate = (v: string | null) => v === null ? undefined : calendarDateSchema.parse(v)

/** Carnet d'entraînement, records, analyses et RUM. Le coach vient toujours de la session. */
export async function handleTraining(request: Request, path: string[], coachId: string): Promise<Response> {
  const [resource, rawId] = path
  const method = request.method
  const params = new URL(request.url).searchParams

  if (resource === 'exercises') {
    if (method === 'GET') return success(await workoutDao.listExercises(coachId))
    if (method !== 'POST') return methodError()
    const d = exerciseSchema.parse(await readJson(request))
    return success(await workoutDao.createExercise(coachId, d), 201)
  }

  if (resource === 'workouts') {
    if (method === 'GET') {
      const clientId = optionalUuid(params.get('clientId'))
      if (clientId) await requireClient(clientId, coachId)
      return success(await workoutDao.listLogs(coachId, { clientId, from: optionalDate(params.get('from')), to: optionalDate(params.get('to')) }))
    }
    if (method === 'DELETE' && rawId) { await workoutDao.removeLog(uuid(rawId), coachId); return success({ success: true }) }
    if (method !== 'POST' || rawId) return methodError()
    const d = workoutSchema.parse(await readJson(request))
    const rawKey = request.headers.get('idempotency-key')
    if (rawKey !== null && !z.string().uuid().safeParse(rawKey.trim()).success) throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key invalide (UUID attendu).')
    const create = async () => {
      await requireClient(d.client_id, coachId)
      const exercise = d.exercice_id ? await workoutDao.requireExercise(d.exercice_id, coachId) : await workoutDao.findOrCreateExercise(coachId, d.exercice_nom!)
      // Records calculés AVANT insertion, contre l'historique du même client et exercice.
      const history = await workoutDao.listRawLogs(coachId, { clientId: d.client_id, exerciceId: exercise.id })
      const found = detectNewRecords(history, d.sets)
      const logs = await workoutDao.createLogs({ client_id: d.client_id, log_date: d.log_date, exercice_id: exercise.id, session_id: d.session_id ?? null, notes: d.notes, sets: d.sets })
      const newRecords = found.map(r => ({ exercice_id: exercise.id, exercice: exercise.nom, type: r.type, value: r.value, previous: r.previous, log_date: d.log_date }))
      return { logs, newRecords }
    }
    if (rawKey === null) return success(await create(), 201)
    // Même clé et même corps : réponse d'origine rejouée sans réinsertion ; corps différent : 422.
    const done = await runIdempotent(idempotencyStore(), { coachId, key: rawKey.trim().toLowerCase(), route: 'POST workouts', hash: requestHash(d) },
      async () => ({ status: 201, body: await create() }))
    return success(done.body, done.status, done.replayed ? { 'Idempotency-Replayed': 'true' } : {})
  }

  if (resource === 'records') {
    if (method !== 'GET') return methodError()
    const clientId = params.get('clientId')
    if (clientId === null) throw new HttpError(400, 'VALIDATION_ERROR', 'clientId est requis.')
    await requireClient(uuid(clientId), coachId)
    const records = aggregateRecords(await workoutDao.listRawLogs(coachId, { clientId }))
    const names = new Map((await workoutDao.listExercisesByIds(coachId, records.map(r => r.exercice_id))).map(e => [e.id, e]))
    return success(records.map(r => ({ exercice_id: r.exercice_id, exercice: names.get(r.exercice_id)?.nom ?? '', groupe_musculaire: names.get(r.exercice_id)?.groupe_musculaire ?? null, best_1rm: r.best_1rm, max_charge: r.max_charge, max_reps: r.max_reps, record_date: r.record_date })))
  }

  if (resource === 'analytics') {
    if (method !== 'GET') return methodError()
    const clientId = optionalUuid(params.get('clientId'))
    if (clientId) await requireClient(clientId, coachId)
    const period = periodSchema.parse(params.get('period') ?? 'month')
    const today = dakarToday()
    const range = periodRange(period, today)
    const [history, sessionDates, weights] = await Promise.all([
      workoutDao.listRawLogs(coachId, { clientId, to: range.to }),
      workoutDao.doneSessionDays(coachId, clientId, range.from, range.to),
      workoutDao.weights(coachId, clientId, range.from, range.to),
    ])
    return success(computeAnalytics({
      period, today, logs: history.filter(l => l.log_date >= range.prevFrom), sessionDates, weights,
      records: countRecordsInRange(history, range.from, range.to),
    }))
  }

  if (resource === 'rum') {
    if (method === 'GET' && rawId === 'summary') return success(summarizeRum(await rumDao.recent(coachId, 30)))
    if (method !== 'POST' || rawId) return methodError()
    const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (type !== 'application/json' && type !== 'text/plain') throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Un corps JSON est requis.')
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength >= RUM_MAX_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Requête trop volumineuse.')
    let body: unknown
    try { body = JSON.parse(text) } catch { throw new HttpError(400, 'INVALID_JSON', 'JSON invalide.') }
    const parsed = rumSchema.safeParse(body)
    // Événement invalide : ignoré silencieusement, la télémétrie ne doit jamais gêner l'utilisateur.
    if (parsed.success) { try { await rumDao.create(coachId, parsed.data) } catch { /* ignoré */ } }
    return noContent()
  }

  throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
}
