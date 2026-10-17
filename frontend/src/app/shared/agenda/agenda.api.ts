import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { Api, describeError } from '../../core/api';
import { AgendaSession, ClientOption, Conflict, Scope, SessionStatus } from './agenda.model';

export interface SessionQuery { from?: string; to?: string; clientId?: string; statut?: string }

/** Données envoyées pour créer ou modifier une séance. */
export interface SessionBody {
  client_id?: string;
  titre: string;
  description?: string;
  notes?: string;
  date_heure: string;
  duree_minutes: number;
}

export interface RecurrenceBody {
  client_id: string;
  titre: string;
  description?: string;
  duree_minutes: number;
  heure: string;
  frequence: 'QUOTIDIENNE' | 'HEBDOMADAIRE' | 'MENSUELLE';
  intervalle: number;
  jours?: number[];
  date_debut: string;
  date_fin?: string;
  nb_occurrences?: number;
  on_conflict: 'REJECT' | 'SKIP';
}

export interface Failure {
  /** Code du contrat d'API (SESSION_CONFLICT, STALE_VERSION, VALIDATION_ERROR...) ou chaîne vide. */
  code: string;
  /** Message en français : celui du serveur s'il existe, sinon un message générique. */
  message: string;
  conflicts: Conflict[];
}

/** Lit une erreur HTTP selon le format `{ error: { code, message, ...champs } }` du contrat. */
export function failureOf(error: unknown): Failure {
  const info = describeError(error);
  const body = error instanceof HttpErrorResponse ? error.error?.error : undefined;
  const conflicts = Array.isArray(body?.conflicts) ? (body.conflicts as Conflict[]) : [];
  const code = typeof body?.code === 'string' ? body.code : '';
  // Historique protégé : le message du serveur suffit, inutile de suggérer d'actualiser.
  const message = code === 'SESSION_LOCKED' && typeof body?.message === 'string' ? body.message : `${info.message} ${info.hint}`.trim();
  return { code, message, conflicts };
}

/** Accès réseau de l'agenda : lecture par période (annulable) et écritures selon docs/AGENDA_CONTRACT.md. */
@Injectable({ providedIn: 'root' })
export class AgendaApi {
  private http = inject(HttpClient);
  private api = inject(Api);

  /** Flux annulable : se désabonner interrompt la requête en cours. */
  sessions$(query: SessionQuery): Observable<AgendaSession[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) if (value) params = params.set(key, value);
    return this.http.get<{ data: AgendaSession[] }>('/api/v1/sessions', { params }).pipe(map(r => r.data));
  }

  clients() { return this.api.get<ClientOption[]>('clients'); }
  session(id: string) { return this.api.get<AgendaSession>('sessions/' + id); }
  history() { return this.api.get<AgendaSession[]>('sessions'); }

  /** Avertit pendant la saisie. Si le serveur ne propose pas encore la vérification, la saisie reste possible sans alerte. */
  conflicts$(body: { date_heure: string; duree_minutes: number; exclude_id?: string }): Observable<Conflict[]> {
    return this.http.post<{ data?: { conflicts?: Conflict[] } }>('/api/v1/sessions/conflicts', { ...body, duree_minutes: String(body.duree_minutes) }, { headers: { 'X-CoachSen-Client': 'angular' } }).pipe(
      map(r => r.data?.conflicts ?? []),
      catchError(() => of([] as Conflict[])),
    );
  }

  create(body: SessionBody) { return this.api.write<AgendaSession>('POST', 'sessions', this.wire(body)); }
  update(id: string, body: Partial<SessionBody> & { expected_updated_at?: string; scope: Scope }) { return this.api.write<unknown>('PATCH', 'sessions/' + id, this.wire(body)); }
  setStatus(id: string, statut: SessionStatus, scope: Scope = 'ONE') { return this.api.write<unknown>('PATCH', `sessions/${id}/status`, { statut, scope }); }
  remove(id: string, scope: Scope = 'ONE') { return this.api.write<unknown>('DELETE', `sessions/${id}?scope=${scope}`); }
  createRecurrence(body: RecurrenceBody) {
    return this.api.write<{ id?: string; created?: number; skipped?: { date: string; reason: string }[] }>('POST', 'recurrences', { ...body, duree_minutes: String(body.duree_minutes) });
  }

  /** Le serveur actuel valide la durée comme une chaîne de chiffres ; on envoie donc le même format que les formulaires existants. */
  private wire<T extends { duree_minutes?: number }>(body: T) { return body.duree_minutes === undefined ? body : { ...body, duree_minutes: String(body.duree_minutes) }; }
}
