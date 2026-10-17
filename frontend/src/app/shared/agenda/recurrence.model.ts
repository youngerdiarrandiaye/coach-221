import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { DAY_SHORT, daysBetween, isDay, weekday } from './agenda.model';
import { RecurrenceBody } from './agenda.api';

export type Preset = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';
export type Unit = 'QUOTIDIENNE' | 'HEBDOMADAIRE' | 'MENSUELLE';
export type EndMode = 'COUNT' | 'DATE';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'DAILY', label: 'Tous les jours' },
  { key: 'WEEKLY', label: 'Chaque semaine' },
  { key: 'BIWEEKLY', label: 'Toutes les 2 semaines' },
  { key: 'MONTHLY', label: 'Chaque mois' },
  { key: 'CUSTOM', label: 'Personnalisée' },
];
export const UNITS: { key: Unit; label: string }[] = [
  { key: 'QUOTIDIENNE', label: 'jour(s)' },
  { key: 'HEBDOMADAIRE', label: 'semaine(s)' },
  { key: 'MENSUELLE', label: 'mois' },
];
/** Lundi en premier ; la valeur est l'indice du contrat (0 = dimanche). */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0].map(value => ({ value, label: DAY_SHORT[value] }));

export const MAX_DAYS = 366;
export const MAX_OCCURRENCES = 200;

export function recurrenceGroup() {
  return new FormGroup({
    preset: new FormControl<Preset>('WEEKLY', { nonNullable: true }),
    unit: new FormControl<Unit>('HEBDOMADAIRE', { nonNullable: true }),
    intervalle: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(12)] }),
    jours: new FormControl<number[]>([], { nonNullable: true }),
    endMode: new FormControl<EndMode>('COUNT', { nonNullable: true }),
    nb_occurrences: new FormControl(8, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(MAX_OCCURRENCES)] }),
    date_fin: new FormControl('', { nonNullable: true }),
    skip: new FormControl(false, { nonNullable: true }),
  });
}
export type RecurrenceGroup = ReturnType<typeof recurrenceGroup>;
type RecurrenceValue = ReturnType<RecurrenceGroup['getRawValue']>;

export const frequencyOf = (v: RecurrenceValue): Unit => (v.preset === 'DAILY' ? 'QUOTIDIENNE' : v.preset === 'MONTHLY' ? 'MENSUELLE' : v.preset === 'CUSTOM' ? v.unit : 'HEBDOMADAIRE');
export const intervalOf = (v: RecurrenceValue) => (v.preset === 'BIWEEKLY' ? 2 : v.preset === 'CUSTOM' ? Number(v.intervalle) : 1);
export const usesDays = (v: RecurrenceValue) => frequencyOf(v) === 'HEBDOMADAIRE';

/** Règles propres à la récurrence : jours choisis, fin cohérente avec le début et limites du contrat. */
export function recurrenceValidator(startDay: () => string) {
  return (control: AbstractControl): ValidationErrors | null => {
    const v = (control as RecurrenceGroup).getRawValue();
    const errors: ValidationErrors = {};
    if (usesDays(v) && !v.jours.length) errors['jours'] = 'Choisissez au moins un jour.';
    if (v.endMode === 'DATE') {
      const start = startDay();
      if (!isDay(v.date_fin)) errors['date_fin'] = 'Choisissez la date de fin.';
      else if (isDay(start) && v.date_fin < start) errors['date_fin'] = 'La fin doit être après la première séance.';
      else if (isDay(start) && daysBetween(start, v.date_fin) > MAX_DAYS) errors['date_fin'] = `La série ne peut pas dépasser ${MAX_DAYS} jours.`;
    }
    return Object.keys(errors).length ? errors : null;
  };
}

/** Champs de récurrence du contrat (POST recurrences). */
export function recurrenceFields(v: RecurrenceValue): Pick<RecurrenceBody, 'frequence' | 'intervalle' | 'jours' | 'date_fin' | 'nb_occurrences' | 'on_conflict'> {
  return {
    frequence: frequencyOf(v),
    intervalle: intervalOf(v),
    ...(usesDays(v) ? { jours: [...v.jours].sort((a, b) => a - b) } : {}),
    ...(v.endMode === 'DATE' ? { date_fin: v.date_fin } : { nb_occurrences: Number(v.nb_occurrences) }),
    on_conflict: v.skip ? 'SKIP' : 'REJECT',
  };
}

/** Phrase de contrôle affichée sous l'éditeur, pour que le coach relise ce qu'il va créer. */
export function recurrenceSummary(v: RecurrenceValue, startDay: string): string {
  const every = (n: number, one: string, many: string) => (n === 1 ? one : `tous les ${n} ${many}`);
  const names = [...v.jours].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_SHORT[d].toLowerCase());
  const days = names.length ? ' (' + names.join(', ') + ')' : '';
  const n = intervalOf(v);
  let rhythm: string;
  switch (frequencyOf(v)) {
    case 'QUOTIDIENNE': rhythm = every(n, 'chaque jour', 'jours'); break;
    case 'MENSUELLE': rhythm = (n === 1 ? 'chaque mois' : `tous les ${n} mois`) + (isDay(startDay) ? ` le ${Number(startDay.slice(8))}` : ''); break;
    default: rhythm = (n === 1 ? 'chaque semaine' : n === 2 ? 'toutes les 2 semaines' : `toutes les ${n} semaines`) + days;
  }
  const end = v.endMode === 'DATE' ? (isDay(v.date_fin) ? `, jusqu’au ${v.date_fin.split('-').reverse().join('/')}` : '') : `, ${Number(v.nb_occurrences) || 0} séance(s) au total`;
  return `Une séance ${rhythm}${end}.`;
}

/** Jour de départ par défaut des séries hebdomadaires : le jour de la première séance. */
export const defaultDays = (startDay: string): number[] => (isDay(startDay) ? [weekday(startDay)] : []);
