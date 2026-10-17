import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, switchMap, tap } from 'rxjs';
import { errorText } from '../../core/api';
import { AgendaApi } from './agenda.api';
import { AgendaSession, AgendaView, ClientOption, dayOf, groupByDay, isDay, periodOf, periodTitle, shiftAnchor, todayDay } from './agenda.model';

const VIEW_KEY = 'coachsen.agenda.view';
const VIEWS: AgendaView[] = ['day', 'week', 'month', 'list'];

function savedView(): AgendaView {
  try {
    const value = localStorage.getItem(VIEW_KEY) as AgendaView | null;
    if (value && VIEWS.includes(value)) return value;
  } catch { /* stockage indisponible : on garde la vue par défaut */ }
  return 'week';
}

/**
 * État de la page Séances : vue, période, filtres et séances chargées.
 * Chaque changement de période ou de filtre annule la requête précédente (switchMap) :
 * une réponse tardive ne remplace jamais les données de la période affichée.
 */
@Injectable()
export class AgendaStore {
  private api = inject(AgendaApi);

  readonly view = signal<AgendaView>(savedView());
  readonly anchor = signal(todayDay());
  readonly clientId = signal('');
  readonly statut = signal('');

  readonly rows = signal<AgendaSession[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly clients = signal<ClientOption[]>([]);
  readonly clientsReady = signal(false);

  readonly period = computed(() => periodOf(this.view(), this.anchor()));
  readonly title = computed(() => periodTitle(this.view(), this.anchor()));
  readonly isToday = computed(() => { const p = this.period(); const t = todayDay(); return p ? t >= p.from && t <= p.to : false; });
  readonly filtered = computed(() => {
    const p = this.period(), client = this.clientId(), status = this.statut();
    // Le filtrage est refait ici pour que l'affichage reste exact même si une réponse contient des séances hors période.
    return this.rows().filter(row => {
      const day = dayOf(row.date_heure);
      return (!p || (day >= p.from && day <= p.to)) && (!client || row.client_id === client) && (!status || row.statut === status);
    });
  });
  readonly byDay = computed(() => groupByDay(this.filtered()));
  readonly hasFilters = computed(() => !!this.clientId() || !!this.statut());

  private requests = new Subject<boolean>();

  constructor() {
    this.requests.pipe(
      tap(silent => { if (!silent) { this.loading.set(true); this.error.set(''); } }),
      switchMap(() => {
        const p = this.period();
        return this.api.sessions$({ from: p?.from, to: p?.to, clientId: this.clientId(), statut: this.statut() }).pipe(
          catchError(e => { this.error.set(errorText(e)); this.loading.set(false); return EMPTY; }),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(rows => { this.rows.set(rows); this.error.set(''); this.loading.set(false); });

    effect(() => {
      this.period(); this.clientId(); this.statut();
      untracked(() => this.requests.next(false));
    });

    void this.api.clients().then(list => this.clients.set(list)).catch(() => undefined).finally(() => this.clientsReady.set(true));
  }

  /** Recharge la période affichée. `silent` garde les données visibles pendant l'actualisation. */
  reload(silent = false) {
    this.requests.next(silent);
  }

  setView(view: AgendaView) {
    this.view.set(view);
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* sans stockage, la vue n'est simplement pas mémorisée */ }
  }

  go(direction: 1 | -1) { this.anchor.set(shiftAnchor(this.view(), this.anchor(), direction)); }
  today() { this.anchor.set(todayDay()); }
  goTo(day: string) { if (isDay(day)) this.anchor.set(day); }

}
