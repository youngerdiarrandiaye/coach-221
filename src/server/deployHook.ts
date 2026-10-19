import { isCronAuthorized } from '@/lib/cronAuth'
import { deliver, updatePayload, validVersion, type DeliveryStore, type PushSender, type PushSubscriptionRecord } from '@/lib/pushReminders'

const PAGE = 500
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export interface DeployHookDeps {
  secret: string | undefined
  configured: boolean
  send: PushSender
  store: () => DeliveryStore
  /** Abonnements dont l'identifiant suit `after`, dans l'ordre, au plus `limit`. */
  page: (after: string, limit: number) => Promise<PushSubscriptionRecord[]>
}

/**
 * Webhook de déploiement : appelé par le pipeline une fois la nouvelle version en ligne. Il prévient les appareils
 * où CoachSen est installé (notification push) pour qu'ils chargent la nouvelle version. Protégé par un jeton dédié :
 * sans DEPLOY_WEBHOOK_SECRET, le webhook est désactivé.
 */
export async function handleDeployHook(request: Request, deps: DeployHookDeps): Promise<Response> {
  if (!isCronAuthorized(request.headers.get('authorization'), deps.secret)) return json({ error: 'Unauthorized' }, 401)
  if (!deps.configured) return json({ error: { code: 'PUSH_NOT_CONFIGURED', message: 'Configuration des notifications push incomplète' } }, 503)
  let version: unknown
  try { version = ((await request.json()) as { version?: unknown }).version } catch { version = undefined }
  if (!validVersion(version)) return json({ error: { code: 'INVALID_VERSION', message: 'Version invalide.' } }, 400)

  const store = deps.store()
  const payload = updatePayload(version)
  const total = { sent: 0, failed: 0, removed: 0 }
  try {
    // Pagination par clé : les abonnements périmés supprimés en cours de route ne décalent pas la suite.
    let after = '00000000-0000-0000-0000-000000000000'
    for (;;) {
      const page = await deps.page(after, PAGE)
      if (page.length) after = page[page.length - 1].id
      const result = await deliver(store, deps.send, page, payload, 86_400)
      total.sent += result.sent; total.failed += result.failed; total.removed += result.removed
      if (page.length < PAGE) break
    }
    return json({ data: total })
  } catch {
    // Ne jamais journaliser les abonnements ni les clés.
    console.error('[deploy-hook] échec de l’annonce de mise à jour')
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Annonce indisponible' } }, 500)
  }
}
