import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Toast } from '../core/toast';
import { AgendaPanel } from '../shared/agenda/agenda-panel';
import {
  AgendaSession, VIEWS, daysBetween, daysFrom, isDay, monthStart, timeOf, todayDay,
} from '../shared/agenda/agenda.model';
import { AgendaStore } from '../shared/agenda/agenda.store';
import { CalendarFilters } from '../shared/agenda/calendar-filters';
import { DayList } from '../shared/agenda/day-list';
import { MonthView } from '../shared/agenda/month-view';
import { Saved, SessionQuickForm } from '../shared/agenda/session-quick-form';
import { SessionDetails } from '../shared/agenda/session-details';
import { SlotPick, TimeGrid } from '../shared/agenda/time-grid';

interface PanelState { kind: 'create' | 'detail' | 'edit'; session?: AgendaSession; day?: string; time?: string }

const PAGE_SIZE = 30;

/** Page Séances : agenda Jour / Semaine / Mois / Liste avec création rapide, détail et filtres. */
@Component({
  selector: 'app-agenda-page',
  standalone: true,
  imports: [RouterLink, CalendarFilters, TimeGrid, MonthView, DayList, AgendaPanel, SessionQuickForm, SessionDetails],
  providers: [AgendaStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-heading">
      <div><h1>Séances</h1><p>Un planning clair pour des journées bien organisées.</p></div>
      <div class="actions">
        <a class="button secondary" routerLink="/sessions/recurrences"><i class="fa-solid fa-repeat" aria-hidden="true"></i> Récurrences</a>
        <button type="button" class="primary ag-add" aria-label="Ajouter une séance" (click)="openCreate()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter</button>
      </div>
    </div>

    <section class="panel ag" aria-label="Agenda des séances">
      <div class="ag-toolbar">
        <div class="filter-tabs ag-views" role="group" aria-label="Affichage">
          @for (v of views; track v.key) {
            <button type="button" [attr.aria-pressed]="store.view() === v.key" (click)="store.setView(v.key)">
              <i class="fa-solid" [class]="v.icon" aria-hidden="true"></i> <span>{{ v.label }}</span>
            </button>
          }
        </div>
        @if (store.view() !== 'list') {
          <div class="ag-nav" role="group" aria-label="Navigation dans le temps">
            <button type="button" class="secondary" [attr.aria-label]="prevLabel()" aria-keyshortcuts="ArrowLeft" (click)="store.go(-1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
            <button type="button" class="secondary" (click)="store.today()">Aujourd’hui</button>
            <button type="button" class="secondary" [attr.aria-label]="nextLabel()" aria-keyshortcuts="ArrowRight" (click)="store.go(1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
          </div>
          <h2 class="ag-title" aria-live="polite">{{ store.title() }}</h2>
        }
      </div>

      <app-calendar-filters [clients]="store.clients()" [clientId]="store.clientId()" [statut]="store.statut()" [active]="store.hasFilters()"
                            (clientChange)="store.clientId.set($event)" (statutChange)="store.statut.set($event)" (reset)="clearFilters()" />

      <div class="ag-stage" [attr.aria-busy]="store.loading()">
        @if (store.loading()) {
          <p class="ag-state" role="status"><i class="fa-solid fa-spinner fa-spin-pulse" aria-hidden="true"></i> Chargement des séances…</p>
        } @else if (store.error()) {
          <div class="ag-state">
            <p class="error" role="alert">{{ store.error() }}</p>
            <button type="button" class="secondary" (click)="store.reload()">Réessayer</button>
          </div>
        } @else {
          @if (!store.filtered().length) {
            <div class="ag-state ag-state-empty" role="status">
              <div class="empty-icon"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i></div>
              @if (store.hasFilters()) {
                <h3>Aucune séance ne correspond à ces filtres</h3>
                <button type="button" class="secondary" (click)="clearFilters()">Effacer les filtres</button>
              } @else {
                <h3>{{ emptyTitle() }}</h3>
                <p>{{ store.view() === 'list' ? 'Planifiez votre première séance pour commencer.' : 'Touchez un créneau ou le bouton Ajouter pour planifier une séance.' }}</p>
                @if (store.view() === 'list') { <button type="button" class="primary" (click)="openCreate()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter une séance</button> }
              }
            </div>
          }

          @switch (store.view()) {
            @case ('day') {
              <app-time-grid [days]="days()" [byDay]="store.byDay()" [selectedId]="selectedId()" label="Grille horaire du jour"
                             (pick)="onSlot($event)" (open)="openDetail($event)" />
            }
            @case ('week') {
              @if (compact()) {
                <app-day-list [days]="days()" [byDay]="store.byDay()" [selectedId]="selectedId()" (open)="openDetail($event)" (add)="openCreate($event)" />
              } @else {
                <app-time-grid [days]="days()" [byDay]="store.byDay()" [selectedId]="selectedId()" [headsOpenDay]="true" label="Grille horaire de la semaine"
                               (pick)="onSlot($event)" (open)="openDetail($event)" (openDay)="showDay($event)" />
              }
            }
            @case ('month') {
              <app-month-view [days]="days()" [month]="store.anchor()" [byDay]="store.byDay()" [compact]="compact()" [selectedDay]="monthDay()"
                              [label]="'Calendrier de ' + store.title()" (pick)="openCreate($event)" (open)="openDetail($event)"
                              (openDay)="showDay($event)" (select)="monthDay.set($event)" />
              @if (compact()) {
                <app-day-list [days]="[monthDay()]" [byDay]="store.byDay()" [selectedId]="selectedId()" (open)="openDetail($event)" (add)="openCreate($event)" />
              }
            }
            @case ('list') {
              @if (store.filtered().length) {
                <app-day-list [days]="listDays()" [byDay]="store.byDay()" [selectedId]="selectedId()" [canAdd]="false" (open)="openDetail($event)" />
                @if (hiddenCount() > 0) {
                  <div class="ag-more"><button type="button" class="secondary" (click)="limit.set(limit() + pageSize)">Afficher plus ({{ hiddenCount() }} jour(s) restant(s))</button></div>
                }
              }
            }
          }
        }
      </div>
    </section>

    <button type="button" class="primary ag-fab" aria-label="Ajouter une séance" (click)="openCreate()"><i class="fa-solid fa-calendar-plus" aria-hidden="true"></i><span>Séance</span></button>

    @if (panel(); as p) {
      <app-agenda-panel [label]="panelLabel()" [locked]="busy()" [dirty]="formDirty()" (closed)="closePanel()">
        @if (p.kind === 'detail' && p.session) {
          <app-session-details [session]="p.session" (edit)="panel.set({ kind: 'edit', session: p.session })" (changed)="onSaved($event)" (busyChange)="busy.set($event)" />
        } @else if (p.kind === 'edit' && p.session) {
          <app-session-form [session]="p.session" (saved)="onSaved($event)" (back)="panel.set({ kind: 'detail', session: p.session })" (dirtyChange)="formDirty.set($event)" (busyChange)="busy.set($event)" />
        } @else if (p.kind === 'create') {
          <app-session-form [day]="p.day ?? ''" [time]="p.time ?? '09:00'" [presetClientId]="store.clientId()" (saved)="onSaved($event)" (back)="closePanel()" (dirtyChange)="formDirty.set($event)" (busyChange)="busy.set($event)" />
        }
      </app-agenda-panel>
    }
  `,
})
export class AgendaPage {
  protected store = inject(AgendaStore);
  private toast = inject(Toast);

  views = VIEWS;
  pageSize = PAGE_SIZE;
  panel = signal<PanelState | null>(null);
  formDirty = signal(false);
  busy = signal(false);
  compact = signal(false);
  monthDay = signal(todayDay());
  limit = signal(PAGE_SIZE);

  selectedId = computed(() => (this.panel()?.kind === 'create' ? '' : this.panel()?.session?.id ?? ''));
  prevLabel = computed(() => ({ day: 'Jour précédent', week: 'Semaine précédente', month: 'Mois précédent', list: '' })[this.store.view()]);
  nextLabel = computed(() => ({ day: 'Jour suivant', week: 'Semaine suivante', month: 'Mois suivant', list: '' })[this.store.view()]);
  panelLabel = computed(() => ({ create: 'Planifier une séance', edit: 'Modifier la séance', detail: 'Détail de la séance' })[this.panel()?.kind ?? 'detail']);
  emptyTitle = computed(() => ({ day: 'Aucune séance ce jour', week: 'Aucune séance cette semaine', month: 'Aucune séance ce mois-ci', list: 'Aucune séance pour le moment' })[this.store.view()]);

  /** Jours affichés par la vue courante. */
  days = computed(() => {
    const view = this.store.view(), p = this.store.period();
    return view === 'day' ? [this.store.anchor()] : p ? daysFrom(p.from, daysBetween(p.from, p.to) + 1) : [];
  });

  /** Mode liste : jours à venir (du plus proche au plus lointain), puis jours passés (du plus récent au plus ancien). */
  private orderedDays = computed(() => {
    const today = todayDay();
    const all = [...this.store.byDay().keys()].sort();
    return [...all.filter(d => d >= today), ...all.filter(d => d < today).reverse()];
  });
  listDays = computed(() => {
    let shown = 0;
    const out: string[] = [];
    for (const day of this.orderedDays()) {
      if (shown >= this.limit()) break;
      out.push(day);
      shown += this.store.byDay().get(day)?.length ?? 0;
    }
    return out;
  });
  hiddenCount = computed(() => this.orderedDays().length - this.listDays().length);

  constructor() {
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    const date = query.get('date');
    if (isDay(date)) this.store.goTo(date);
    const view = query.get('view');
    if (view && VIEWS.some(v => v.key === view)) this.store.setView(view as 'day' | 'week' | 'month' | 'list');

    try {
      const media = window.matchMedia('(max-width: 800px)');
      this.compact.set(media.matches);
      const listener = (e: MediaQueryListEvent) => this.compact.set(e.matches);
      media.addEventListener('change', listener);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', listener));
    } catch { /* sans matchMedia, la mise en page large reste utilisée */ }

    // Les filtres ou la vue changent le contenu : on repart d'une liste courte et le jour du mois suit la période.
    effect(() => {
      this.store.view(); this.store.clientId(); this.store.statut();
      untracked(() => this.limit.set(PAGE_SIZE));
    });
    effect(() => {
      const anchor = this.store.anchor();
      untracked(() => { const today = todayDay(); this.monthDay.set(monthStart(today) === monthStart(anchor) ? today : monthStart(anchor)); });
    });
  }

  /** Jour et heure proposés par défaut : aujourd'hui à la prochaine heure pleine, sinon 9 h. */
  private defaultDay() {
    const today = todayDay(), p = this.store.period(), view = this.store.view();
    if (view === 'day') return this.store.anchor();
    if (view === 'month' && this.compact()) return this.monthDay();
    return p && today >= p.from && today <= p.to ? today : (p?.from ?? today);
  }

  private defaultTime(day: string) {
    if (day !== todayDay()) return '09:00';
    const hour = Number(timeOf(new Date()).slice(0, 2)) + 1;
    return hour >= 6 && hour < 21 ? String(hour).padStart(2, '0') + ':00' : '09:00';
  }

  openCreate(day?: string, time?: string) {
    const d = day ?? this.defaultDay();
    this.formDirty.set(false);
    this.panel.set({ kind: 'create', day: d, time: time ?? this.defaultTime(d) });
  }

  onSlot(slot: SlotPick) { this.openCreate(slot.day, slot.time); }
  openDetail(session: AgendaSession) { this.formDirty.set(false); this.panel.set({ kind: 'detail', session }); }
  closePanel() { this.panel.set(null); this.formDirty.set(false); this.busy.set(false); }

  /** Ouvre la vue Jour sur ce jour (en-tête de la semaine, « + autres » du mois). */
  showDay(day: string) { this.store.goTo(day); this.store.setView('day'); }

  clearFilters() { this.store.clientId.set(''); this.store.statut.set(''); }

  /** Le serveur a confirmé : on ferme le panneau, on actualise la période puis on l'annonce. */
  onSaved(result: Saved) {
    this.closePanel();
    this.store.reload(true);
    this.toast.success(result.title, result.detail);
  }

  /** Flèches gauche et droite : période précédente ou suivante, tant que le coach n'est pas en train de saisir. */
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (this.panel() || this.store.view() === 'list' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input,select,textarea,[contenteditable],[role=radio]')) return;
    this.store.go(event.key === 'ArrowLeft' ? -1 : 1);
  }
}
