import { z } from 'zod'
import { AppError } from '@/exception/AppError'

export class HttpError extends AppError {
  constructor(status: number, code: string, message: string) { super(message, code, status) }
}

/** No CORS is enabled: a foreign site cannot send this non-simple header. */
export function validateMutation(request: Request, frontendOrigin = process.env.FRONTEND_ORIGIN): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  if (request.headers.get('x-coachsen-client') !== 'angular')
    throw new HttpError(403, 'CSRF_REJECTED', 'Requête non autorisée.')
  const origin = request.headers.get('origin')
  const expected = new URL(request.url).origin
  const host = request.headers.get('host')
  let sameHost = false
  try {
    if (origin) {
      const parsed = new URL(origin)
      if (parsed.origin !== origin) throw new Error('Invalid origin')
      sameHost = !!host && parsed.host === host && parsed.protocol === new URL(request.url).protocol
    }
  } catch { throw new HttpError(403, 'ORIGIN_REJECTED', 'Origine non autorisée.') }
  if (!origin || (origin !== expected && origin !== frontendOrigin && !sameHost))
    throw new HttpError(403, 'ORIGIN_REJECTED', 'Origine non autorisée.')
}

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Un corps JSON est requis.')
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > 64 * 1024)
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Requête trop volumineuse.')
  try { return JSON.parse(body) } catch { throw new HttpError(400, 'INVALID_JSON', 'JSON invalide.') }
}

export async function readMultipart(request: Request): Promise<FormData> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'multipart/form-data')
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Un formulaire multipart est requis.')
  try { return await request.formData() } catch {
    throw new HttpError(400, 'INVALID_FORM_DATA', 'Formulaire invalide.')
  }
}

export function success(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json({ data }, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
}

export function failure(error: unknown): Response {
  if (error instanceof z.ZodError)
    return Response.json({ error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? 'Données invalides.' } }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const known = error instanceof AppError
  const retryAfter = known && error.code === 'RATE_LIMITED' ? Number(error.extra?.retry_after) : NaN
  return Response.json({ error: {
    ...(known ? error.extra : undefined),
    code: known ? error.code ?? 'REQUEST_FAILED' : 'INTERNAL_ERROR',
    message: known ? error.message : 'Service indisponible. Veuillez réessayer.',
  } }, { status: known ? error.statusCode : 500, headers: { 'Cache-Control': 'no-store', ...(Number.isFinite(retryAfter) ? { 'Retry-After': String(retryAfter) } : {}) } })
}

export function found<T>(value: T | null): T {
  if (value === null) throw new HttpError(404, 'NOT_FOUND', 'Enregistrement introuvable.')
  return value
}

export const uuid = (value: unknown) => z.string().uuid('Identifiant invalide.').parse(value)
