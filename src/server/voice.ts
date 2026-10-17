// POST voice/parse : comprend une phrase dictée. Ne crée et ne modifie rien ; le coach vient de la session.
import { z } from 'zod'
import { parseVoice, type AiConfig } from '@/lib/voiceAi'
import type { VoiceClientRef } from '@/lib/voiceRules'
import { HttpError, readJson, success } from './http'

export const voiceBodySchema = z.strictObject({
  transcript: z.string('Le texte est requis.').trim().min(1, 'Le texte est requis (1 à 1000 caractères).').max(1000, 'Le texte est trop long (1000 caractères au plus).'),
  intent: z.enum(['auto', 'client', 'payment', 'workout', 'measure', 'session'], { error: 'Intention invalide.' }).optional(),
}, { error: issue => issue.code === 'unrecognized_keys' ? `Champ non autorisé : ${issue.keys.join(', ')}.` : 'Corps de requête invalide.' })

export interface VoiceDeps {
  clients(coachId: string): Promise<VoiceClientRef[]>
  exercises(coachId: string): Promise<string[]>
  ai(): Promise<AiConfig>
  now(): Date
}

export async function handleVoice(request: Request, coachId: string, deps: VoiceDeps): Promise<Response> {
  if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.')
  const body = voiceBodySchema.parse(await readJson(request))
  const [clients, exercises, ai] = await Promise.all([deps.clients(coachId), deps.exercises(coachId).catch(() => []), deps.ai()])
  return success(await parseVoice(body.transcript, body.intent, { now: deps.now(), clients, exercises }, ai))
}
