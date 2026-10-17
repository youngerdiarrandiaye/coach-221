import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hueOf } from '../../core/api';
import { AgendaSession, STATUS_LABEL, STATUS_TONE, describeSession, endTimeOf, sessionClient, timeOf } from './agenda.model';

/** Carte d'une séance dans les listes (liste, semaine mobile, jour du mois). Un seul bouton : ouvrir le détail. */
@Component({
  selector: 'app-session-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="ag-card" [attr.data-status]="session().statut" [class.is-selected]="selected()" [style.--hue]="hue()"
            [attr.aria-label]="label()" (click)="open.emit(session())">
      <span class="ag-card-time" aria-hidden="true"><strong>{{ start() }}</strong><small>{{ end() }}</small></span>
      <span class="ag-card-body" aria-hidden="true">
        <strong>{{ session().titre }}</strong>
        <span>{{ client() }}@if (session().recurrence_id) { · <i class="fa-solid fa-repeat" title="Séance récurrente"></i> }</span>
      </span>
      <span class="pill" aria-hidden="true" [attr.data-tone]="tone()">{{ status() }}</span>
    </button>
  `,
})
export class SessionCard {
  session = input.required<AgendaSession>();
  selected = input(false);
  open = output<AgendaSession>();

  start = computed(() => timeOf(this.session().date_heure));
  end = computed(() => endTimeOf(this.session()));
  client = computed(() => sessionClient(this.session()));
  hue = computed(() => hueOf(this.client()));
  tone = computed(() => STATUS_TONE[this.session().statut]);
  status = computed(() => STATUS_LABEL[this.session().statut]);
  label = computed(() => describeSession(this.session()));
}
