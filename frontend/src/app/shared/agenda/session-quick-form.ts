import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, merge, startWith, switchMap, of } from 'rxjs';
import { Toast } from '../../core/toast';
import { FormDefaults } from '../../core/form-defaults';
import { describeError } from '../../core/api';
import { AgendaApi, failureOf } from './agenda.api';
import { AgendaStore } from './agenda.store';
import {
  AgendaSession, ClientOption, Conflict, STATUS_LABEL, Scope, clientName, dayLong, dayMonth, dayOf, endTimeOf, sessionClient, timeOf, toApiDateTime,
} from './agenda.model';
import { ConflictAlert } from './conflict-alert';
import { ClientPicker, Picked } from '../client-picker';
import { RecurrenceEditor } from './recurrence-editor';
import { recurrenceFields, recurrenceGroup, recurrenceValidator, defaultDays } from './recurrence.model';

export interface Saved { title: string; detail: string }

const DURATIONS = [30, 45, 60, 90];
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'ONE', label: 'Cette séance' },
  { key: 'FOLLOWING', label: 'Celle-ci et les suivantes' },
  { key: 'ALL', label: 'Toute la série' },
];

/** Formulaire de création rapide et de modification. Il n'annonce un succès qu'après la réponse du serveur. */
@Component({
  selector: 'app-session-form',
  standalone: true,
  imports: [ReactiveFormsModule, ConflictAlert, RecurrenceEditor, ClientPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="ag-panel-title" id="ag-form-title">{{ editing() ? 'Modifier la séance' : 'Planifier une séance' }}</h2>
    <form class="ag-form" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="ag-form-title">

      @if (editing()) {
        <p class="ag-readonly"><span>Client</span><strong>{{ clientLabel() }}</strong></p>
      } @else {
        <div class="ag-field">
          <label for="qf-client">Client <span aria-label="obligatoire">*</span></label>
          <app-client-picker [clients]="clients()" [selected]="form.controls.client_id.value" inputId="qf-client" [autofocus]="true"
                           [invalid]="invalid('client_id')" [describedBy]="invalid('client_id') ? 'qf-client-error' : null"
                           (picked)="pickClient($event)" (blurred)="form.controls.client_id.markAsTouched()" />
          @if (!clients().length) { <small class="field-help">Aucun client pour le moment : ajoutez d’abord un client.</small> }
          @if (invalid('client_id')) { <small class="error" id="qf-client-error">Choisissez un client dans la liste.</small> }
        </div>
      }

      @if (hint()) { <p class="auto-note"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> {{ hint() }}</p> }

      <div class="ag-field">
        <label for="qf-titre">Titre de la séance <span aria-label="obligatoire">*</span></label>
        <input id="qf-titre" type="text" formControlName="titre" list="qf-titles" autocomplete="off" maxlength="100" [attr.data-autofocus]="editing() ? '' : null"
               [attr.aria-invalid]="invalid('titre')" [attr.aria-describedby]="invalid('titre') ? 'qf-titre-error' : null">
        <datalist id="qf-titles">@for (t of titles(); track t) { <option [value]="t"></option> }</datalist>
        @if (invalid('titre')) { <small class="error" id="qf-titre-error">Saisissez un titre d’au moins 2 caractères.</small> }
      </div>

      @if (locked()) { <p class="auto-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> Séance effectuée : l’horaire et la durée sont protégés. Le titre, la description et les notes restent modifiables.</p> }
      <div class="ag-row">
        <div class="ag-field">
          <label for="qf-date">Jour <span aria-label="obligatoire">*</span></label>
          <input id="qf-date" type="date" formControlName="date" [attr.aria-invalid]="invalid('date')">
        </div>
        <div class="ag-field">
          <label for="qf-heure">Heure (Dakar) <span aria-label="obligatoire">*</span></label>
          <input id="qf-heure" type="time" formControlName="heure" #timeInput [attr.aria-invalid]="invalid('heure')">
        </div>
      </div>

      <div class="ag-field">
        <label for="qf-duree">Durée (minutes) <span aria-label="obligatoire">*</span></label>
        <div class="filter-tabs" role="group" aria-label="Durées usuelles">
          @for (d of durations; track d) {
            <button type="button" [attr.aria-pressed]="form.controls.duree_minutes.value === d" (click)="setDuration(d)">{{ d }} min</button>
          }
        </div>
        <input id="qf-duree" type="number" formControlName="duree_minutes" min="5" max="480" inputmode="numeric" [attr.aria-invalid]="invalid('duree_minutes')"
               [attr.aria-describedby]="invalid('duree_minutes') ? 'qf-duree-error' : null">
        @if (invalid('duree_minutes')) { <small class="error" id="qf-duree-error">La durée doit être comprise entre 5 et 480 minutes.</small> }
      </div>

      <app-conflict-alert [conflicts]="shownConflicts()" [refused]="refused().length > 0" (pickOther)="focusTime()" />

      @if (editing() && isSeries()) {
        <fieldset class="ag-fieldset">
          <legend>Appliquer la modification à</legend>
          <div class="filter-tabs" role="radiogroup" aria-label="Portée de la modification">
            @for (s of scopes; track s.key) {
              <button type="button" role="radio" [attr.aria-checked]="scope() === s.key" (click)="scope.set(s.key)">{{ s.label }}</button>
            }
          </div>
          @if (scope() !== 'ONE') { <small class="field-help">Les séances effectuées ou annulées ne sont pas modifiées.</small> }
        </fieldset>
      }

      <details class="field-more ag-extra" [open]="!!form.controls.description.value || !!form.controls.notes.value">
        <summary>Description et notes</summary>
        <div class="ag-field"><label for="qf-desc">Description</label><textarea id="qf-desc" rows="2" formControlName="description"></textarea></div>
        @if (editing()) { <div class="ag-field"><label for="qf-notes">Notes</label><textarea id="qf-notes" rows="2" formControlName="notes"></textarea></div> }
      </details>

      @if (!editing()) {
        <label class="ag-check">
          <input type="checkbox" formControlName="repeat">
          <span>Répéter cette séance <small>Quotidienne, hebdomadaire, mensuelle ou personnalisée.</small></span>
        </label>
        @if (form.controls.repeat.value) { <app-recurrence-editor [group]="form.controls.recurrence" [startDay]="form.controls.date.value" /> }
      }

      @if (stale()) {
        <div class="ag-alert" role="alert">
          <p class="ag-alert-title"><i class="fa-solid fa-rotate" aria-hidden="true"></i> La séance a été modifiée ailleurs.</p>
          @if (reloaded()) {
            <p>Version actuelle : {{ reloaded() }}. Vos modifications sont conservées : relisez-les puis enregistrez.</p>
          } @else {
            <p>Rechargez la séance pour enregistrer vos changements sur sa dernière version. Votre saisie est conservée.</p>
            <button type="button" class="secondary" [disabled]="busy()" (click)="reload()"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Recharger la séance</button>
          }
        </div>
      }

      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

      <div class="ag-actions">
        <button type="submit" class="primary" [disabled]="busy() || (stale() && !reloaded())">{{ busy() ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button type="button" class="secondary" [disabled]="busy()" (click)="back.emit()">{{ editing() ? 'Retour' : 'Fermer' }}</button>
      </div>
    </form>
  `,
})
export class SessionQuickForm implements OnInit {
  private api = inject(AgendaApi);
  private store = inject(AgendaStore);
  private defaults = inject(FormDefaults);
  private toast = inject(Toast);

  /** Séance à modifier ; absente pour une création. */
  session = input<AgendaSession | null>(null);
  /** Jour et heure proposés à la création (créneau cliqué, case du mois ou prochain créneau). */
  day = input('');
  time = input('09:00');
  presetClientId = input('');
  saved = output<Saved>();
  back = output<void>();
  /** Vrai dès que le coach a modifié un champ : le panneau n'est alors plus fermé par un simple clic à côté. */
  dirtyChange = output<boolean>();
  busyChange = output<boolean>();

  clients = this.store.clients;
  editing = computed(() => !!this.session());
  /** Une séance effectuée fait partie de l'historique : son horaire et sa durée ne se modifient plus. */
  locked = computed(() => this.session()?.statut === 'EFFECTUEE');
  isSeries = computed(() => !!this.session()?.recurrence_id);
  clientLabel = computed(() => (this.session() ? sessionClient(this.session()!) : ''));
  durations = DURATIONS;
  scopes = SCOPES;
  name = clientName;

  form = new FormGroup({
    client_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    titre: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)] }),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    heure: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    duree_minutes: new FormControl<number | null>(60, { validators: [Validators.required, Validators.min(5), Validators.max(480)] }),
    description: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    repeat: new FormControl(false, { nonNullable: true }),
    recurrence: recurrenceGroup(),
  });

  clientText = signal('');
  hint = signal('');
  titles = signal<string[]>([]);
  busy = signal(false);
  error = signal('');
  scope = signal<Scope>('ONE');
  liveConflicts = signal<Conflict[]>([]);
  refused = signal<Conflict[]>([]);
  stale = signal(false);
  reloaded = signal('');
  private baseVersion = '';
  private timeInput = viewChild<ElementRef<HTMLInputElement>>('timeInput');

  shownConflicts = computed(() => (this.refused().length ? this.refused() : this.liveConflicts()));

  constructor() {
    this.form.controls.recurrence.disable();
    this.form.controls.recurrence.addValidators(recurrenceValidator(() => this.form.controls.date.value));
    this.form.controls.date.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.form.controls.recurrence.updateValueAndValidity());

    const c = this.form.controls;
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.dirtyChange.emit(this.form.dirty));
    effect(() => this.busyChange.emit(this.busy()));
    c.repeat.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.toggleRepeat());
    merge(c.date.valueChanges, c.heure.valueChanges, c.duree_minutes.valueChanges).pipe(
      startWith(null), debounceTime(350),
      switchMap(() => {
        const { date, heure, duree_minutes } = c;
        if (!date.value || !heure.value || date.invalid || heure.invalid || duree_minutes.invalid || duree_minutes.value === null) return of([] as Conflict[]);
        return this.api.conflicts$({ date_heure: toApiDateTime(date.value, heure.value), duree_minutes: Number(duree_minutes.value), exclude_id: this.session()?.id });
      }),
      takeUntilDestroyed(),
    ).subscribe(list => { this.liveConflicts.set(list); this.refused.set([]); });
  }

  ngOnInit() {
    const s = this.session();
    const c = this.form.controls;
    if (s) {
      c.client_id.setValue(s.client_id);
      c.titre.setValue(s.titre);
      c.date.setValue(dayOf(s.date_heure));
      c.heure.setValue(timeOf(s.date_heure));
      c.duree_minutes.setValue(s.duree_minutes);
      c.description.setValue(s.description ?? '');
      c.notes.setValue(s.notes ?? '');
      this.baseVersion = s.updated_at ?? '';
      if (s.statut === 'EFFECTUEE') { c.date.disable(); c.heure.disable(); c.duree_minutes.disable(); }
      this.form.markAsPristine();
    } else {
      c.date.setValue(this.day());
      c.heure.setValue(this.time());
      void this.prepareHistory();
      const preset = this.presetClientId() || (this.clients().length === 1 ? this.clients()[0].id : '');
      if (preset) this.chooseClient(preset);
    }
  }

  invalid(key: 'client_id' | 'titre' | 'date' | 'heure' | 'duree_minutes') {
    const control = this.form.controls[key];
    return control.invalid && (control.touched || control.dirty) ? 'true' : null;
  }

  setDuration(minutes: number) { this.form.controls.duree_minutes.setValue(minutes); this.form.controls.duree_minutes.markAsDirty(); }

  pickClient(p: Picked) {
    if (p.typed) this.form.controls.client_id.markAsDirty();
    if (p.id) this.chooseClient(p.id);
    else this.form.controls.client_id.setValue('');
  }

  chooseClient(id: string) {
    const client: ClientOption | undefined = this.clients().find(c => c.id === id);
    if (!client) return;
    this.clientText.set(clientName(client));
    this.form.controls.client_id.setValue(id);
    this.suggest(id);
  }

  toggleRepeat() {
    const rec = this.form.controls.recurrence;
    if (this.form.controls.repeat.value) {
      rec.enable();
      if (!rec.controls.jours.value.length) rec.controls.jours.setValue(defaultDays(this.form.controls.date.value));
    } else rec.disable();
  }

  focusTime() { this.timeInput()?.nativeElement.focus(); }

  /** Titres fréquents pour la saisie assistée. */
  private async prepareHistory() {
    try { this.titles.set((await this.defaults.titles()).filter(t => typeof t === 'string' && t.trim())); } catch { /* la saisie assistée est un confort : le formulaire reste utilisable sans */ }
  }

  /** Propose titre et durée de la dernière séance du client ; ne remplace jamais ce que le coach a déjà saisi. */
  /** Suggestion en cours : l'enregistrement l'attend (4 s au plus) pour ne pas valider un formulaire qu'elle va remplir. */
  private suggesting: Promise<void> | null = null;
  private suggest(clientId: string) {
    const run = this.suggestFor(clientId).finally(() => { if (this.suggesting === run) this.suggesting = null; });
    this.suggesting = run;
  }

  private async suggestFor(clientId: string) {
    if (this.editing()) return;
    let last: { titre: string; duree_minutes: number | string } | null = null;
    try { last = (await this.defaults.forClient(clientId)).last_session; } catch { /* suggestion facultative */ }
    if (this.form.controls.client_id.value !== clientId) return;
    if (!last) { this.hint.set(''); return; }
    const { titre, duree_minutes } = this.form.controls;
    if (titre.pristine) titre.setValue(last.titre);
    if (duree_minutes.pristine) duree_minutes.setValue(Number(last.duree_minutes));
    this.hint.set('Titre et durée repris de la dernière séance de ce client. Modifiez si besoin.');
  }

  async save() {
    if (this.busy()) return;
    if (this.suggesting) { this.busy.set(true); await Promise.race([this.suggesting, new Promise(r => setTimeout(r, 4000))]); this.busy.set(false); }
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Corrigez les champs signalés avant d’enregistrer.'); return; }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.refused.set([]);
    try {
      const date_heure = toApiDateTime(v.date, v.heure);
      const duree_minutes = Number(v.duree_minutes);
      const summary = [v.titre, clientName(this.clients().find(c => c.id === v.client_id)) || this.clientLabel(), `${dayMonth(v.date)} à ${v.heure}`].filter(Boolean).join(', ');
      if (this.editing()) {
        const res = await this.api.update(this.session()!.id, {
          titre: v.titre.trim(), description: v.description.trim(), notes: v.notes.trim(), ...(this.locked() ? {} : { date_heure, duree_minutes }),
          expected_updated_at: this.baseVersion || undefined, scope: this.isSeries() ? this.scope() : 'ONE',
        }) as { updated?: number } | null;
        const n = typeof res?.updated === 'number' ? res.updated : 1;
        this.saved.emit({ title: 'Séance modifiée', detail: n > 1 ? `${n} séances mises à jour` : summary });
      } else if (v.repeat) {
        const res = await this.api.createRecurrence({
          client_id: v.client_id, titre: v.titre.trim(), description: v.description.trim() || undefined, duree_minutes, heure: v.heure, date_debut: v.date, ...recurrenceFields(v.recurrence),
        });
        const created = res?.created, skipped = res?.skipped?.length ?? 0;
        const detail = created === undefined ? summary : `${created} séance(s) créée(s)` + (skipped ? `, ${skipped} date(s) ignorée(s) pour chevauchement` : '');
        this.saved.emit({ title: 'Récurrence ajoutée', detail });
      } else {
        await this.api.create({ client_id: v.client_id, titre: v.titre.trim(), description: v.description.trim() || undefined, date_heure, duree_minutes });
        this.saved.emit({ title: 'Séance planifiée', detail: summary });
      }
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    const f = failureOf(e);
    if (f.code === 'SESSION_CONFLICT') {
      this.refused.set(f.conflicts);
      if (!f.conflicts.length) this.error.set(f.message);
    } else if (f.code === 'STALE_VERSION') {
      this.stale.set(true);
      this.reloaded.set('');
    } else {
      this.error.set(f.message);
      if (describeError(e).retryable) this.toast.fail(this.editing() ? 'Séance non modifiée' : 'Séance non planifiée', e, () => void this.save());
    }
  }

  /** Récupère la dernière version sans toucher à la saisie : seul le contrôle de version est mis à jour. */
  async reload() {
    const s = this.session();
    if (!s || this.busy()) return;
    this.busy.set(true);
    try {
      const latest = await this.api.session(s.id);
      this.baseVersion = latest.updated_at ?? '';
      this.reloaded.set(`${latest.titre}, ${dayLong(dayOf(latest.date_heure)).toLowerCase()} de ${timeOf(latest.date_heure)} à ${endTimeOf(latest)}, ${STATUS_LABEL[latest.statut].toLowerCase()}`);
    } catch (e) {
      this.stale.set(false);
      this.error.set(failureOf(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
