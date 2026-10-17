import webpush from 'web-push'
import type { PushSender } from '@/lib/pushReminders'

export const vapidConfig = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:contact@example.com'
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null
}

/** Envoi réel via web-push. Les clés privées ne quittent jamais ce module. */
export const sendWebPush: PushSender = async (sub, payload, options) => {
  const vapid = vapidConfig()
  if (!vapid) throw new Error('VAPID non configuré')
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: options.ttl, urgency: options.urgency, timeout: 10_000, vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey } },
  )
}
