import { Injectable, inject } from '@angular/core';
import { Api, Row } from './api';

/** Clients les plus actifs sur 90 jours (séances, paiements, saisies). `null` si la route échoue : les sélecteurs reviennent alors à la liste complète. */
@Injectable({ providedIn: 'root' })
export class FrequentClients {
  private api = inject(Api);

  async load(limit = 6): Promise<Row[] | null> {
    try {
      const rows = await this.api.get<Row[]>('clients/frequent?limit=' + limit);
      return Array.isArray(rows) ? rows : null;
    } catch {
      return null;
    }
  }
}
