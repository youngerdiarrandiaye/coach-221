// Branchement réel de la saisie vocale : lecture des clients et exercices du coach, client Anthropic (clé serveur seulement).
import { clientDao } from '@/dao/clientDao'
import { workoutDao } from '@/dao/workoutDao'
import { AI_TIMEOUT_MS, DEFAULT_VOICE_MODEL, type AiClient, type AiConfig } from '@/lib/voiceAi'
import type { VoiceDeps } from './voice'

let cachedClient: { key: string; client: AiClient } | null = null
/** Clé lue côté serveur seulement ; sans clé, aucun client : l'analyseur à règles répond. */
async function realAi(): Promise<AiConfig> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  const model = process.env.VOICE_MODEL?.trim() || DEFAULT_VOICE_MODEL
  if (!key) return { client: null, model }
  if (!cachedClient || cachedClient.key !== key) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    cachedClient = { key, client: new Anthropic({ apiKey: key, maxRetries: 0, timeout: AI_TIMEOUT_MS }) as unknown as AiClient }
  }
  return { client: cachedClient.client, model, timeoutMs: AI_TIMEOUT_MS }
}

export const voiceDeps: VoiceDeps = {
  async clients(coachId) { return (await clientDao.findAll(coachId)).map(c => ({ id: c.id, prenom: c.prenom, nom: c.nom })) },
  async exercises(coachId) { return (await workoutDao.listExercises(coachId)).map(e => e.nom) },
  ai: realAi,
  now: () => new Date(),
}

