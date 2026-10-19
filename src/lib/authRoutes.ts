const PUBLIC_ROUTES = new Set(['/', '/login', '/register', '/reset-password', '/check-email'])
const GUEST_ROUTES = new Set(['/login', '/register', '/check-email'])

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname)
}

export function hasOwnAuthentication(pathname: string): boolean {
  return pathname === '/auth/callback' || pathname === '/auth/confirm' || pathname === '/api/cron/session-reminders' || pathname === '/api/cron/push-reminders' || pathname === '/api/cron/maintenance' || pathname === '/api/cron/health' || pathname === '/api/deploy-hook' || pathname === '/api/v1' || pathname.startsWith('/api/v1/')
}

export function authRedirect(pathname: string, authenticated: boolean): string | null {
  if (hasOwnAuthentication(pathname)) return null
  if (!authenticated && !isPublicRoute(pathname)) return '/login'
  if (authenticated && GUEST_ROUTES.has(pathname)) return '/dashboard'
  return null
}

export function callbackDestination(next: string | null): string {
  return next === '/update-password' || next === '/reset-password' ? '/update-password' : '/dashboard'
}
