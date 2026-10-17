import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hueOf } from '../../core/api';
import { AgendaSession, DAY_SHORT, STATUS_LABEL, dayLong, describeSession, sessionClient, timeOf, todayDay } from './agenda.model';

const MAX_CHIPS = 3;
const HEADERS = [...DAY_SHORT.slice(1), DAY_SHORT[0]];

/**
 * Vue Mois. Large : une case par jour, un clic sur la case propose de planifier, un clic sur une séance l'ouvre.
 * Compacte (mobile) : une case par jour avec le nombre de séances ; toucher un jour le sélectionne.
 */
@Component({
  selector: 'app-month-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ag-month" role="grid" [attr.aria-label]="label()" [class.is-compact]="compact()">
      <div class="ag-month-row ag-month-dows" role="row">
        @for (h of headers; track h) { <span role="columnheader">{{ h }}</span> }
      </div>
      @for (week of weeks(); track week[0].day) {
        <div class="ag-month-row" role="row">
          @for (c of week; track c.day) {
            @if (compact()) {
              <div role="gridcell" class="ag-mcell" [class.is-out]="!c.inMonth" [class.is-today]="c.isToday">
                <button type="button" class="ag-mcell-pick" [attr.aria-pressed]="c.day === selectedDay()" [attr.aria-label]="c.long + ', ' + count(c.sessions.length)" (click)="select.emit(c.day)">
                  <span class="ag-mnum">{{ c.num }}</span>
                  <span class="ag-mdots" aria-hidden="true">@for (s of c.sessions.slice(0, 3); track s.id) { <i [attr.data-status]="s.statut"></i> }</span>
                </button>
              </div>
            } @else {
              <div role="gridcell" class="ag-mcell" [class.is-out]="!c.inMonth" [class.is-today]="c.isToday">
                <button type="button" class="ag-mcell-hit" tabindex="-1" [attr.aria-label]="'Planifier une séance le ' + c.long" (click)="pick.emit(c.day)"></button>
                <span class="ag-mnum">{{ c.num }}</span>
                <ul class="ag-mlist">
                  @for (s of c.sessions.slice(0, maxChips); track s.id) {
                    <li>
                      <button type="button" class="ag-mchip" [attr.data-status]="s.statut" [style.--hue]="hue(s)" [attr.aria-label]="describe(s)" [attr.title]="describe(s)" (click)="open.emit(s)">
                        <span class="ag-chip-time">{{ time(s) }}</span> {{ s.titre }}<span class="ag-sr"> ({{ statusLabel[s.statut] }})</span>
                      </button>
                    </li>
                  }
                </ul>
                @if (c.sessions.length > maxChips) {
                  <button type="button" class="ag-mmore" (click)="openDay.emit(c.day)">+ {{ c.sessions.length - maxChips }} autre(s)</button>
                }
              </div>
            }
          }
        </div>
      }
    </div>
  `,
})
export class MonthView {
  /** Jours de la grille, du lundi de la première semaine au dimanche de la dernière. */
  days = input.required<string[]>();
  /** Mois affiché (n'importe quel jour du mois). */
  month = input.required<string>();
  byDay = input.required<Map<string, AgendaSession[]>>();
  compact = input(false);
  selectedDay = input('');
  label = input('Calendrier du mois');
  pick = output<string>();
  open = output<AgendaSession>();
  openDay = output<string>();
  select = output<string>();

  headers = HEADERS;
  maxChips = MAX_CHIPS;
  statusLabel = STATUS_LABEL;
  describe = describeSession;
  hue = (s: AgendaSession) => hueOf(sessionClient(s));

  weeks = computed(() => {
    const today = todayDay(), month = this.month().slice(0, 7);
    const cells = this.days().map(day => ({
      day, num: Number(day.slice(8)), long: dayLong(day), isToday: day === today, inMonth: day.startsWith(month), sessions: this.byDay().get(day) ?? [],
    }));
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  });

  time = (s: AgendaSession) => timeOf(s.date_heure);
  count = (n: number) => (n === 0 ? 'aucune séance' : n === 1 ? '1 séance' : `${n} séances`);
}
