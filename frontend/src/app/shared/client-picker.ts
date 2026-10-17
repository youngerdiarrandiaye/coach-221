import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FrequentClients } from '../core/frequent-clients';

export interface PickerClient { id: string; prenom?: unknown; nom?: unknown }
export interface Picked { id: string; typed: boolean }

const fullName = (c: PickerClient) => [c.prenom, c.nom].filter(Boolean).join(' ');

/**
 * Choix d'un client : les clients fréquents en pastilles d'abord, puis « Chercher par nom » pour tous les autres.
 * Si la liste des fréquents est indisponible, on revient à l'ancien comportement (pastilles pour 8 clients ou moins, recherche sinon).
 */
@Component({
  selector: 'app-client-picker',
  standalone: true,
  template: `
    @for (g of groups(); track g.label) {
      @if (g.label) { <p class="picker-label" [id]="inputId() + '-' + $index">{{ g.label }}</p> }
      <div class="filter-tabs client-chips" role="group" [attr.aria-label]="g.label ? null : 'Choisir un client'" [attr.aria-labelledby]="g.label ? inputId() + '-' + $index : null">
        @for (c of g.items; track c.id) {
          <button type="button" [attr.aria-pressed]="selected() === c.id" (click)="choose(c)">{{ name(c) }}</button>
        }
      </div>
    }
    <input [id]="inputId()" type="text" [attr.list]="inputId() + '-list'" autocomplete="off" placeholder="Chercher par nom" aria-label="Client, chercher par nom"
           [attr.data-autofocus]="autofocus() ? '' : null" [value]="text()" [attr.aria-invalid]="invalid()" [attr.aria-describedby]="describedBy()"
           (input)="type($any($event.target).value)" (blur)="blurred.emit()">
    <datalist [id]="inputId() + '-list'">@for (c of clients(); track c.id) { <option [value]="name(c)"></option> }</datalist>
  `,
})
export class ClientPicker {
  private frequentApi = inject(FrequentClients);

  clients = input.required<PickerClient[]>();
  /** Identifiant du client choisi par le formulaire parent. */
  selected = input('');
  inputId = input('client-search');
  autofocus = input(false);
  invalid = input<string | boolean | null>(null);
  describedBy = input<string | null>(null);
  picked = output<Picked>();
  blurred = output<void>();

  name = fullName;
  text = signal('');
  /** `null` : route des fréquents indisponible ou vide, repli sur la liste complète. */
  private frequent = signal<{ id: string }[] | null>(null);

  groups = computed(() => {
    const all = this.clients();
    if (all.length < 2) return [];
    const byId = new Map(all.map(c => [c.id, c] as const));
    const hot = (this.frequent() ?? []).map(f => byId.get(f.id)).filter((c): c is PickerClient => !!c);
    if (!hot.length) return all.length <= 8 ? [{ label: '', items: all }] : [];
    const groups = [{ label: 'Fréquents', items: hot }];
    const rest = all.filter(c => !hot.includes(c));
    if (all.length <= 8 && rest.length) groups.push({ label: 'Autres clients', items: rest });
    return groups;
  });

  constructor() {
    void this.frequentApi.load().then(list => this.frequent.set(list && list.length ? list : null));
    effect(() => {
      const id = this.selected();
      const client = this.clients().find(c => c.id === id);
      if (client) untracked(() => this.text.set(fullName(client)));
    });
  }

  choose(c: PickerClient) {
    this.text.set(fullName(c));
    this.picked.emit({ id: c.id, typed: false });
  }

  type(value: string) {
    this.text.set(value);
    const found = this.clients().find(c => fullName(c).toLowerCase() === value.trim().toLowerCase());
    this.picked.emit({ id: found?.id ?? '', typed: true });
  }
}
