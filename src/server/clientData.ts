import { z } from 'zod'
import { clientDao } from '@/dao/clientDao'
import { clientDataDao } from '@/dao/clientDataDao'
import { exportFileName } from '@/lib/clientExport'
import { activityLimit, frequentLimit } from '@/lib/limits'
import { found, HttpError, readJson, success } from './http'

const eraseSchema = z.object({ confirmation: z.string('Confirmation requise.').trim().min(1, 'Confirmation requise.').max(200, 'Confirmation trop longue.') })
const limitSchema = z.coerce.number('Limite invalide (1 à 50).').int('Limite invalide (1 à 50).').min(1, 'Limite invalide (1 à 50).').max(50, 'Limite invalide (1 à 50).')
const methodError = () => { throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.') }

/** GET sessions/titles?limit=20 : titres les plus fréquents du coach. */
export async function handleSessionTitles(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodError()
  const raw = new URL(request.url).searchParams.get('limit')
  return success(await clientDataDao.sessionTitles(raw === null ? 20 : limitSchema.parse(raw)))
}

/** GET clients/frequent?limit=6 : clients les plus fréquents (1 à 12). */
export async function handleFrequentClients(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodError()
  return success(await clientDataDao.frequent(frequentLimit(request)))
}

/** GET activity?limit=15 : fil d'activité récent (1 à 50). */
export async function handleActivity(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodError()
  return success(await clientDataDao.activity(activityLimit(request)))
}

/** clients/:id/export | defaults | erase. Le coach vient toujours de la session ; un client étranger donne 404. */
export async function handleClientData(request: Request, id: string, operation: string, coachId: string): Promise<Response> {
  const method = request.method
  if (operation === 'defaults') {
    if (method !== 'GET') return methodError()
    return success(await clientDataDao.defaults(id))
  }
  if (operation === 'export') {
    if (method !== 'GET') return methodError()
    const client = found(await clientDao.findById(id, coachId))
    const data = await clientDataDao.exportAll(id, coachId, client)
    return new Response(JSON.stringify(data, null, 2), { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(client)}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  }
  if (operation === 'erase') {
    if (method !== 'POST') return methodError()
    const { confirmation } = eraseSchema.parse(await readJson(request))
    // La fonction SQL vérifie le coach propriétaire (404) puis la confirmation (400) et efface en une transaction.
    return success({ erased: await clientDataDao.erase(id, confirmation) })
  }
  throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
}
