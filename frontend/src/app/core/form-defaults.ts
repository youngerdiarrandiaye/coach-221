import { Injectable, inject } from '@angular/core';
import { Api } from './api';

export interface ClientDefaults {
  last_payment: { montant: number | string; methode: string; statut?: string; date_paiement: string } | null;
  last_session: { titre: string; duree_minutes: number | string; date_heure: string } | null;
  last_progress: Record<string, unknown> & { mesure_date: string } | null;
}

/** Valeurs proposées aux formulaires : une seule petite requête, jamais tout l'historique du coach. */
@Injectable({ providedIn: 'root' })
export class FormDefaults {
  private api = inject(Api);
  /** Titres de séance les plus fréquents (20 au plus). */
  titles(): Promise<string[]> { return this.api.get<string[]>('sessions/titles?limit=20'); }
  /** Dernier paiement, dernière séance et dernière mesure d'un client. */
  forClient(clientId: string): Promise<ClientDefaults> { return this.api.get<ClientDefaults>('clients/' + encodeURIComponent(clientId) + '/defaults'); }
}
