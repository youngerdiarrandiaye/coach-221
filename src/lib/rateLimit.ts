import { createHash } from 'node:crypto'
import { AppError } from '@/exception/AppError'

export type RateRule = { name: string; windowSeconds: number; max: number }
export type RateHit = { allowed: boolean; retry_after: number }
export type RateStore = { hit(key: string, windowSeconds: number, max: number): Promise<RateHit> }
export type RateCheck = { rule: RateRule; scope: string; identity: string }

const rule = (name: string, windowSeconds: number, max: number): RateRule => ({ name, windowSeconds, max })

/** Règles du contrat de fiabilisation (B1). */
export const RATE_RULES = {
  login: rule('login', 600, 10),
  loginDay: rule('login-day', 86400, 40),   // par compte : freine une attaque répartie sur de nombreuses IP
  register: rule('register', 3600, 5),
  reset: rule('reset', 3600, 5),
  rum: rule('rum', 60, 120),
  pushTest: rule('push-test', 3600, 5),
  exports: rule('exports', 600, 30),
  mutations: rule('mutations', 60, 300),
  voiceMinute: rule('voice-minute', 60, 30),
  voiceDay: rule('voice-day', 86400, 300),
} as const

const RATE_TIMEOUT_MS = 1500

export class RateLimitError extends AppError {
  constructor(public readonly retryAfter: number) {
    super(`Trop de tentatives. Réessayez dans ${retryAfter} seconde${retryAfter > 1 ? 's' : ''}.`, 'RATE_LIMITED', 429, { retry_after: retryAfter })
  }
}

/** Premier élément de x-forwarded-for, sinon « inconnue ». */
export function clientIp(headers: Headers): string {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first ? first.slice(0, 64) : 'inconnue'
}

/** Clé de compteur : l'identité (IP, e-mail) est hachée pour ne jamais être stockée en clair. */
export function rateKey(check: RateCheck): string {
  const id = createHash('sha256').update(check.identity.trim().toLowerCase()).digest('hex').slice(0, 32)
  return `${check.rule.name}:${check.scope}:${id}`
}

export const rateLimitDisabled = () => process.env.RATE_LIMIT_DISABLED === '1'

/**
 * Applique toutes les règles (chacune incrémente son compteur). Lève RateLimitError si l'une est dépassée,
 * avec le plus long délai. Ouverte par défaut : toute panne du magasin laisse passer, sans journaliser de détail.
 */
export async function enforceRateLimits(store: RateStore | null, checks: RateCheck[]): Promise<void> {
  if (!store || !checks.length || rateLimitDisabled()) return
  let retryAfter = 0
  for (const check of checks) {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('delai')), RATE_TIMEOUT_MS) })
      try {
        const hit = await Promise.race([store.hit(rateKey(check), check.rule.windowSeconds, check.rule.max), timeout])
        if (!hit.allowed) retryAfter = Math.max(retryAfter, Math.max(1, Math.ceil(hit.retry_after)))
      } finally { clearTimeout(timer) }
    } catch {
      console.error('[limitation] base indisponible : requête acceptée sans limite')
      break
    }
  }
  if (retryAfter > 0) throw new RateLimitError(retryAfter)
}
