/**
 * Cookies de session : illisibles par JavaScript (httpOnly) pour qu'une faille XSS ne puisse pas voler la session.
 * L'application Angular n'utilise jamais supabase-js dans le navigateur : seul le serveur lit ces cookies.
 * « Secure » n'est exigé qu'en production sur HTTPS, pour que le développement local en HTTP continue de fonctionner.
 */
export interface CookieOptions {
  path?: string
  domain?: string
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: boolean | 'lax' | 'strict' | 'none'
}

export const secureCookies = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === 'production' && (env.FRONTEND_ORIGIN ?? env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://')

export function hardenSessionCookie(options: CookieOptions | undefined, env: NodeJS.ProcessEnv = process.env): CookieOptions {
  return { ...options, httpOnly: true, sameSite: 'lax', secure: secureCookies(env) }
}
