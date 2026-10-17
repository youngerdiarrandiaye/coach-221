import { z } from 'zod'

/** Paramètre `limit` d'une URL : entier strict de 1 à `max` (sinon erreur de validation en français, donc 400). */
export function limitParser(max: number, fallback: number) {
  const message = `Limite invalide (1 à ${max}).`
  const schema = z.string(message).regex(/^\d{1,3}$/, message).transform(Number).pipe(z.number().int(message).min(1, message).max(max, message))
  return (request: Request): number => {
    const raw = new URL(request.url).searchParams.get('limit')
    return raw === null ? fallback : schema.parse(raw)
  }
}

export const frequentLimit = limitParser(12, 6)
export const activityLimit = limitParser(50, 15)
