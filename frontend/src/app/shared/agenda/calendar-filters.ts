import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ClientOption, STATUS_LABEL, SessionStatus, clientName } from './agenda.model';

/** Filtres de l'agenda : un client (liste) et un statut (pastilles). Sur mobile, ils se replient derrière un bouton. */
@Component({
  selector: 'app-calendar-filters',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="secondary ag-filters-toggle" [attr.aria-expanded]="open()" aria-controls="ag-filters-body" (click)="open.set(!open())">
      <i class="fa-solid fa-sliders" aria-hidden="true"></i> Filtres
      @if (active()) { <span class="ag-dot" aria-label="actifs"></span> }
    </button>
    <div id="ag-filters-body" class="ag-filters" [class.is-open]="open()" role="group" aria-label="Filtrer les séances">
      <label class="ag-field">
        <span class="ag-sr">Client</span>
        <select [value]="clientId()" (change)="clientChange.emit($any($event.target).value)">
          <option value="">Tous les clients</option>
          @for (c of clients(); track c.id) { <option [value]="c.id" [selected]="c.id === clientId()">{{ name(c) }}</option> }
        </select>
      </label>
      <div class="filter-tabs" role="group" aria-label="Filtrer par statut">
        <button type="button" [attr.aria-pressed]="!statut()" (click)="statutChange.emit('')">Tous</button>
        @for (s of statuses; track s) {
          <button type="button" [attr.aria-pressed]="statut() === s" (click)="statutChange.emit(s)">{{ labels[s] }}</button>
        }
      </div>
      @if (active()) {
        <button type="button" class="quiet ag-reset-filters" (click)="reset.emit()"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Effacer les filtres</button>
      }
    </div>
  `,
})
export class CalendarFilters {
  clients = input.required<ClientOption[]>();
  clientId = input('');
  statut = input('');
  active = input(false);
  clientChange = output<string>();
  statutChange = output<string>();
  reset = output<void>();

  open = signal(false);
  statuses: SessionStatus[] = ['PLANIFIEE', 'EFFECTUEE', 'ANNULEE'];
  labels = STATUS_LABEL;
  name = clientName;
}
