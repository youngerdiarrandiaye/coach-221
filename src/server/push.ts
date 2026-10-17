import { pushDao } from '@/dao/pushDao'
import { deliver, testPayload } from '@/lib/pushReminders'
import { reminderSettingsSchema, subscribeSchema, unsubscribeSchema } from '@/features/push/schemas'
import { HttpError, readJson, success } from './http'
import { sendWebPush, vapidConfig } from './pushSender'

const methodError = () => { throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.') }
const notConfigured = () => new HttpError(503, 'PUSH_NOT_CONFIGURED', 'Les notifications push ne sont pas configurées sur le serveur.')

/** Abonnements Web Push et réglages de rappels. Le coach vient toujours de la session. */
export async function handlePush(request: Request, path: string[], coachId: string): Promise<Response> {
  const [resource, operation] = path
  const method = request.method

  if (resource === 'reminders') {
    if (operation !== 'settings') throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
    if (method === 'GET') return success(await pushDao.getSettings(coachId))
    if (method !== 'PUT') return methodError()
    return success(await pushDao.saveSettings(coachId, reminderSettingsSchema.parse(await readJson(request))))
  }

  if (operation === 'key') {
    if (method !== 'GET') return methodError()
    const vapid = vapidConfig()
    if (!vapid) throw notConfigured()
    return success({ publicKey: vapid.publicKey })
  }
  if (method !== 'POST') return methodError()

  if (operation === 'subscribe') {
    const d = subscribeSchema.parse(await readJson(request))
    const userAgent = request.headers.get('user-agent')?.slice(0, 300) || null
    const id = await pushDao.upsertSubscription({ endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, user_agent: userAgent })
    return success({ id }, 201)
  }
  if (operation === 'unsubscribe') {
    const d = unsubscribeSchema.parse(await readJson(request))
    return success({ removed: await pushDao.removeByEndpoint(coachId, d.endpoint) })
  }
  if (operation === 'test') {
    if (!vapidConfig()) throw notConfigured()
    const subscriptions = await pushDao.listSubscriptions(coachId)
    if (!subscriptions.length) throw new HttpError(404, 'NO_SUBSCRIPTION', 'Aucun appareil n’est abonné aux notifications.')
    const { sent, failed } = await deliver(pushDao.deliveryStore(), sendWebPush, subscriptions, testPayload(), 300)
    return success({ sent, failed })
  }
  throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
}
