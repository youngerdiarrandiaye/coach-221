import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Toast } from '../../core/toast';
import { Confirm } from '../../core/confirm';
import { describeError } from '../../core/api';
import { AgendaApi, failureOf } from './agenda.api';
import {
  AgendaSession, Conflict, STATUS_ICON, STATUS_LABEL, STATUS_TONE, Scope, dayLongYear, dayOf, endTimeOf, sessionClient, timeOf,
} from './agenda.model';
import { ConflictAlert } from './conflict-alert';

type Step = 'info' | 'cancel' | 'delete';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'ONE', label: 'Cette séance' },
  { key: 'FOLLOWING', label: 'Celle-ci et les suivantes' },
  { key: 'ALL', label: 'Toute la série' },
];

/**
 * Détail d'une séance et actions du coach. « Effectuée » est une action explicite en un clic ;
 * l'annulation et la suppression demandent une confirmation (avec la portée pour une séance de série).
 */
@Component({
  selector: 'app-session-details',
  standalone: true,
  imports: [RouterLink, ConflictAlert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (step()) {
      @case ('info') {
        <header class="ag-details-head">
          <h2 class="ag-panel-title" id="ag-details-title" tabindex="-1">{{ session().titre }}</h2>
          <span class="pill" [attr.data-tone]="tone()"><i class="fa-solid" [class]="icon()" aria-hidden="true"></i> {{ status() }}</span>
        </header>

        <dl class="ag-facts">
          <div><dt>Client</dt><dd>{{ client() }}</dd></div>
          <div><dt>Jour</dt><dd>{{ day() }}</dd></div>
          <div><dt>Horaire</dt><dd>{{ start() }} – {{ end() }} ({{ session().duree_minutes }} min)</dd></div>
          @if (session().recurrence_id) { <div><dt>Répétition</dt><dd><i class="fa-solid fa-repeat" aria-hidden="true"></i> Séance d’une série</dd></div> }
          @if (session().description) { <div><dt>Description</dt><dd>{{ session().description }}</dd></div> }
          @if (session().notes) { <div><dt>Notes</dt><dd>{{ session().notes }}</dd></div> }
        </dl>

        <app-conflict-alert [conflicts]="conflicts()" [refused]="true" (pickOther)="edit.emit()" />
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

        <div class="ag-actions ag-actions-stack">
          @if (session().statut === 'PLANIFIEE') {
            <button type="button" class="primary" [disabled]="busy()" (click)="markDone()"><i class="fa-solid fa-check" aria-hidden="true"></i> {{ busy() ? 'Enregistrement…' : 'Effectuée' }}</button>
          } @else {
            <button type="button" class="primary" [disabled]="busy()" (click)="reopen()"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> {{ busy() ? 'Enregistrement…' : 'Remettre au planning' }}</button>
          }
          <button type="button" class="secondary" [disabled]="busy()" (click)="edit.emit()"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button>
          @if (session().statut === 'PLANIFIEE') {
            <button type="button" class="secondary" [disabled]="busy()" (click)="ask('cancel')"><i class="fa-solid fa-ban" aria-hidden="true"></i> Annuler</button>
          }
          @if (!(session().statut === 'EFFECTUEE' && session().recurrence_id)) {
          <button type="button" class="quiet danger" [disabled]="busy()" (click)="ask('delete')"><i class="fa-solid fa-trash" aria-hidden="true"></i> Supprimer</button>
          } @else {
            <p class="field-help"><i class="fa-solid fa-lock" aria-hidden="true"></i> Séance effectuée d’une série : elle reste dans l’historique.</p>
          }
        </div>
        <a class="ag-full-link" [routerLink]="'/sessions/' + session().id">Ouvrir la fiche complète <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
      }

      @default {
        <h2 class="ag-panel-title" id="ag-confirm-title" tabindex="-1">{{ step() === 'cancel' ? 'Annuler cette séance ?' : 'Supprimer cette séance ?' }}</h2>
        <p class="ag-confirm-text">
          <strong>{{ session().titre }}</strong>, {{ client() }}, {{ day().toLowerCase() }} à {{ start() }}.
          {{ step() === 'cancel' ? 'Elle restera visible dans l’historique, marquée comme annulée.' : 'Cette suppression est définitive.' }}
        </p>
        @if (session().recurrence_id) {
          <fieldset class="ag-fieldset">
            <legend>{{ step() === 'cancel' ? 'Annuler' : 'Supprimer' }}</legend>
            <div class="filter-tabs" role="radiogroup" aria-label="Portée">
              @for (s of scopes; track s.key) {
                <button type="button" role="radio" [attr.aria-checked]="scope() === s.key" (click)="scope.set(s.key)">{{ s.label }}</button>
              }
            </div>
            @if (scope() !== 'ONE') { <small class="field-help">Seules les séances à venir encore planifiées sont concernées ; l’historique est conservé.</small> }
          </fieldset>
        }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <div class="ag-actions">
          <button type="button" class="danger-button" [disabled]="busy()" (click)="confirm()">
            {{ busy() ? 'En cours…' : step() === 'cancel' ? 'Confirmer l’annulation' : 'Confirmer la suppression' }}
          </button>
          <button type="button" class="secondary" [disabled]="busy()" (click)="ask('info')">Retour</button>
        </div>
      }
    }
  `,
})
export class SessionDetails {
  private api = inject(AgendaApi);
  private toast = inject(Toast);
  private asker = inject(Confirm);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  session = input.required<AgendaSession>();
  edit = output<void>();
  /** Le serveur a confirmé une modification : la page recharge la période, ferme le panneau et affiche le toast. */
  changed = output<{ title: string; detail: string }>();
  busyChange = output<boolean>();

  step = signal<Step>('info');
  scope = signal<Scope>('ONE');
  busy = signal(false);
  error = signal('');
  conflicts = signal<Conflict[]>([]);
  scopes = SCOPES;

  client = computed(() => sessionClient(this.session()));
  day = computed(() => dayLongYear(dayOf(this.session().date_heure)));
  start = computed(() => timeOf(this.session().date_heure));
  end = computed(() => endTimeOf(this.session()));
  status = computed(() => STATUS_LABEL[this.session().statut]);
  tone = computed(() => STATUS_TONE[this.session().statut]);
  icon = computed(() => STATUS_ICON[this.session().statut]);
  private reportBusy = effect(() => this.busyChange.emit(this.busy()));
  private summary = computed(() => `${this.session().titre}, ${this.client()}, ${this.start()}`);

  ask(step: Step) {
    this.step.set(step);
    this.scope.set('ONE');
    this.error.set('');
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('h2[tabindex]')?.focus());
  }

  async markDone() {
    if (this.busy() || !(await this.asker.ask({ title: 'Marquer cette séance effectuée ?', detail: `${this.summary()}. Elle sera comptée dans l’historique du client.`, confirmLabel: 'Marquer effectuée' }))) return;
    return this.run('Séance effectuée', () => this.api.setStatus(this.session().id, 'EFFECTUEE'), 'Séance non enregistrée comme effectuée');
  }
  async reopen() {
    if (this.busy() || !(await this.asker.ask({ title: 'Remettre cette séance au planning ?', detail: `${this.summary()}. Elle repasse au statut Planifiée.`, confirmLabel: 'Remettre au planning' }))) return;
    return this.run('Séance remise au planning', () => this.api.setStatus(this.session().id, 'PLANIFIEE'), 'Séance non remise au planning');
  }
  confirm() {
    const id = this.session().id, scope = this.scope();
    return this.step() === 'cancel'
      ? this.run('Séance annulée', () => this.api.setStatus(id, 'ANNULEE', scope), 'Séance non annulée')
      : this.run('Séance supprimée', () => this.api.remove(id, scope), 'Séance non supprimée');
  }

  /** Aucun succès n'est annoncé avant la réponse du serveur ; en cas d'échec la séance reste telle quelle. */
  private async run(title: string, action: () => Promise<unknown>, failTitle: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.conflicts.set([]);
    try {
      await action();
      this.changed.emit({ title, detail: this.summary() });
    } catch (e) {
      const f = failureOf(e);
      if (f.code === 'SESSION_CONFLICT' && f.conflicts.length) { this.step.set('info'); this.conflicts.set(f.conflicts); }
      else {
        this.error.set(f.message);
        if (describeError(e).retryable) this.toast.fail(failTitle, e, () => void this.run(title, action, failTitle));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
