import { Injectable, signal } from '@angular/core';

export type VoiceIntent = 'client' | 'payment' | 'workout' | 'measure' | 'session';

/** Réponse de `POST voice/parse` (rien n'est enregistré par la route). */
export interface VoiceParse {
  intent: string;
  confidence: number;
  source: 'ai' | 'rules';
  degraded: boolean;
  fields: Record<string, unknown>;
  missing: string[];
  client: { id: string; name: string } | null;
  candidates: { id: string; name: string }[];
  warnings: string[];
}

/** Formulaire ouvert pour chaque intention reconnue : la voix ne fait que préremplir, le coach enregistre. */
export const VOICE_TARGETS: Record<VoiceIntent, { route: string; phrase: string }> = {
  client: { route: '/clients/new', phrase: 'un nouveau client' },
  payment: { route: '/payments/new', phrase: 'un paiement' },
  workout: { route: '/workouts/new', phrase: 'une saisie d’entraînement' },
  measure: { route: '/progress/new', phrase: 'une mesure' },
  session: { route: '/sessions/new', phrase: 'une séance' },
};

export const isVoiceIntent = (value: unknown): value is VoiceIntent => typeof value === 'string' && value in VOICE_TARGETS;

export interface VoicePrefillValue { intent: VoiceIntent; fields: Record<string, unknown>; clientId: string }

const LIFETIME_MS = 5 * 60 * 1000;

/**
 * Préremplissage issu de la dictée : gardé en mémoire seulement (jamais persisté), consommé une seule fois
 * à l'ouverture du formulaire concerné, et périmé au bout de quelques minutes.
 */
@Injectable({ providedIn: 'root' })
export class VoicePrefill {
  /** Incrémenté à chaque nouvelle dictée : un formulaire déjà ouvert peut alors l'appliquer sans se recharger. */
  readonly arrived = signal(0);
  private slot: { value: VoicePrefillValue; at: number } | null = null;

  set(value: VoicePrefillValue) { this.slot = { value, at: Date.now() }; this.arrived.update(n => n + 1); }

  /** Rend la valeur si elle concerne cette intention et n'est pas périmée, puis l'efface. */
  take(intent: VoiceIntent): VoicePrefillValue | null {
    const slot = this.slot;
    if (!slot || slot.value.intent !== intent) return null;
    this.slot = null;
    return Date.now() - slot.at <= LIFETIME_MS ? slot.value : null;
  }
}
