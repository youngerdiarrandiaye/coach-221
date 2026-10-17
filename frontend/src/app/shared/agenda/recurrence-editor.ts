import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  EndMode, MAX_OCCURRENCES, PRESETS, Preset, RecurrenceGroup, UNITS, WEEK_DAYS, defaultDays, recurrenceSummary, usesDays,
} from './recurrence.model';

/** Éditeur de répétition : rythme (quotidien, hebdomadaire, toutes les 2 semaines, mensuel, personnalisé), jours, et fin. */
@Component({
  selector: 'app-recurrence-editor',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="ag-fieldset" [formGroup]="group()">
      <legend>Répétition</legend>

      <div class="filter-tabs" role="group" aria-label="Rythme de répétition">
        @for (p of presets; track p.key) {
          <button type="button" [attr.aria-pressed]="group().controls.preset.value === p.key" (click)="setPreset(p.key)">{{ p.label }}</button>
        }
      </div>

      @if (group().controls.preset.value === 'CUSTOM') {
        <div class="ag-row">
          <label class="ag-field"><span>Répéter tous les</span>
            <input type="number" min="1" max="12" inputmode="numeric" formControlName="intervalle" aria-label="Intervalle de répétition">
          </label>
          <label class="ag-field"><span>Unité</span>
            <select formControlName="unit" aria-label="Unité de l’intervalle">
              @for (u of units; track u.key) { <option [value]="u.key">{{ u.label }}</option> }
            </select>
          </label>
        </div>
      }

      @if (needsDays()) {
        <div class="ag-field">
          <span id="rec-days">Jours de la semaine</span>
          <div class="filter-tabs ag-days" role="group" aria-labelledby="rec-days">
            @for (d of weekDays; track d.value) {
              <button type="button" [attr.aria-pressed]="has(d.value)" (click)="toggleDay(d.value)">{{ d.label }}</button>
            }
          </div>
          @if (group().errors?.['jours']) { <small class="error" role="alert">{{ group().errors?.['jours'] }}</small> }
        </div>
      }

      <div class="ag-field">
        <span id="rec-end">Fin de la série</span>
        <div class="filter-tabs" role="group" aria-labelledby="rec-end">
          <button type="button" [attr.aria-pressed]="group().controls.endMode.value === 'COUNT'" (click)="setEnd('COUNT')">Après un nombre de séances</button>
          <button type="button" [attr.aria-pressed]="group().controls.endMode.value === 'DATE'" (click)="setEnd('DATE')">À une date</button>
        </div>
        @if (group().controls.endMode.value === 'COUNT') {
          <label class="ag-field"><span>Nombre de séances (1 à {{ max }})</span>
            <input type="number" min="1" [max]="max" inputmode="numeric" formControlName="nb_occurrences">
          </label>
        } @else {
          <label class="ag-field"><span>Dernier jour</span>
            <input type="date" formControlName="date_fin" [min]="startDay()">
          </label>
          @if (group().errors?.['date_fin']) { <small class="error" role="alert">{{ group().errors?.['date_fin'] }}</small> }
        }
      </div>

      <label class="ag-check">
        <input type="checkbox" formControlName="skip">
        <span>Ignorer les dates qui chevauchent une autre séance <small>Sinon, rien n’est créé en cas de chevauchement.</small></span>
      </label>

      <p class="auto-note"><i class="fa-solid fa-repeat" aria-hidden="true"></i> {{ summary() }}</p>
    </fieldset>
  `,
})
export class RecurrenceEditor {
  group = input.required<RecurrenceGroup>();
  /** Jour de la première séance (AAAA-MM-JJ) : base des jours par défaut et de la date de fin minimale. */
  startDay = input('');

  presets = PRESETS;
  units = UNITS;
  weekDays = WEEK_DAYS;
  max = MAX_OCCURRENCES;

  needsDays = () => usesDays(this.group().getRawValue());
  has = (day: number) => this.group().controls.jours.value.includes(day);
  summary = () => recurrenceSummary(this.group().getRawValue(), this.startDay());

  setPreset(preset: Preset) {
    const g = this.group();
    g.controls.preset.setValue(preset);
    if (usesDays(g.getRawValue()) && !g.controls.jours.value.length) g.controls.jours.setValue(defaultDays(this.startDay()));
    g.markAsDirty();
  }

  toggleDay(day: number) {
    const control = this.group().controls.jours;
    control.setValue(control.value.includes(day) ? control.value.filter(d => d !== day) : [...control.value, day]);
    this.group().markAsDirty();
  }

  setEnd(mode: EndMode) { this.group().controls.endMode.setValue(mode); this.group().markAsDirty(); }
}
