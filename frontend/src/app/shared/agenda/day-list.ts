import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AgendaSession, dayLong, dayLongYear, todayDay } from './agenda.model';
import { SessionCard } from './session-card';

/** Séances regroupées par jour, en une colonne : semaine sur mobile, jour sélectionné du mois et mode liste. */
@Component({
  selector: 'app-day-list',
  standalone: true,
  imports: [SessionCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (day of days(); track day) {
      <section class="ag-day-group" [attr.aria-label]="label(day)">
        <header class="ag-day-head" [class.is-today]="day === today">
          <h3>{{ label(day) }}@if (day === today) { <span class="ag-today-tag">Aujourd’hui</span> }</h3>
          @if (canAdd()) {
            <button type="button" class="quiet ag-add-day" [attr.aria-label]="'Ajouter une séance le ' + label(day)" (click)="add.emit(day)"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
          }
        </header>
        <div class="ag-day-items">
          @for (s of byDay().get(day) ?? []; track s.id) {
            <app-session-card [session]="s" [selected]="s.id === selectedId()" (open)="open.emit($event)" />
          } @empty {
            <p class="ag-day-empty">Aucune séance.</p>
          }
        </div>
      </section>
    }
  `,
})
export class DayList {
  days = input.required<string[]>();
  byDay = input.required<Map<string, AgendaSession[]>>();
  selectedId = input('');
  canAdd = input(true);
  open = output<AgendaSession>();
  add = output<string>();

  today = todayDay();
  label = (day: string) => (day.slice(0, 4) === this.today.slice(0, 4) ? dayLong(day) : dayLongYear(day));
}
