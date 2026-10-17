import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { display } from '../../core/api';
import { Conflict, dayLong, dayOf, timeOf } from './agenda.model';

/** Alerte de chevauchement : liste lisible des séances en conflit et un bouton pour choisir un autre horaire. */
@Component({
  selector: 'app-conflict-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <div class="ag-alert" [attr.role]="refused() ? 'alert' : 'status'" aria-live="polite">
        <p class="ag-alert-title">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          {{ refused() ? 'Enregistrement impossible : cet horaire chevauche' : 'Cet horaire chevauche' }}
          {{ items().length === 1 ? 'une autre séance.' : items().length + ' autres séances.' }}
        </p>
        <ul class="ag-alert-list">
          @for (c of items(); track c.id) {
            <li><strong>{{ c.titre }}</strong>@if (c.who) { · {{ c.who }}}<span>{{ c.day }}, {{ c.start }} – {{ c.end }}</span></li>
          }
        </ul>
        <button type="button" class="secondary" (click)="pickOther.emit()"><i class="fa-solid fa-clock" aria-hidden="true"></i> Choisir un autre horaire</button>
      </div>
    }
  `,
})
export class ConflictAlert {
  conflicts = input.required<Conflict[]>();
  /** Vrai quand le serveur vient de refuser l'enregistrement (409). */
  refused = input(false);
  pickOther = output<void>();

  items = computed(() => this.conflicts().map(c => {
    const end = new Date(new Date(c.date_heure).getTime() + c.duree_minutes * 60000);
    const who = typeof c.client === 'string' ? c.client : display(c.client);
    return { id: c.id, titre: c.titre, who: who === '—' ? '' : who, day: dayLong(dayOf(c.date_heure)), start: timeOf(c.date_heure), end: timeOf(end) };
  }));
}
