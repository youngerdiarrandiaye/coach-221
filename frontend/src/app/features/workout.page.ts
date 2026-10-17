import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, Row, dateLabel, display, errorText } from '../core/api';
import { Rum } from '../core/rum';
import { trainingGlossary } from '../shared/help';
import { Toast } from '../core/toast';
import { ClientPicker } from '../shared/client-picker';
import { OfflineQueue, isNetworkError, newUuid } from '../core/offline-queue';
import { VoicePrefill } from '../core/voice-prefill';

interface SetRow { reps: string; charge: string; rpe: string }
interface NewRecord { exercice: string; type: '1RM' | 'CHARGE' | 'REPS'; value: number; previous: number | null }

const todayInDakar = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dakar' }).format(new Date());
const recordLabel: Record<string, string> = { '1RM': '1RM estimé', CHARGE: 'Charge max', REPS: 'Répétitions max' };
const recordUnit: Record<string, string> = { '1RM': 'kg', CHARGE: 'kg', REPS: 'reps' };

/** Saisie rapide d'un entraînement : client, exercice, séries — enregistré en un seul envoi. */
@Component({
  standalone: true,
  imports: [RouterLink, ClientPicker],
  template: `
    <a class="back" routerLink="/dashboard"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Accueil</a>
    <div class="page-heading">
      <div>
        <p class="eyebrow">CARNET D’ENTRAÎNEMENT</p>
        <h1>Saisie rapide</h1>
        <p>Client, exercice, séries : trois étapes, un seul clic pour enregistrer.</p>
      </div>
    </div>

    @if (loadError()) {
      <div class="empty"><p class="error" role="alert">{{ loadError() }}</p><button class="secondary" type="button" (click)="load()">Réessayer</button></div>
    }
    @if (loading()) { <p role="status">Chargement…</p> }
    @else if (queued(); as waiting) {
      <section class="panel done-panel queued-panel" role="status" data-testid="queued-panel">
        <span class="done-icon queued-icon"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i></span>
        <h2>Enregistré sur cet appareil, en attente de synchronisation</h2>
        <p class="muted">{{ waiting.exercise }}, {{ waiting.sets }} {{ waiting.sets > 1 ? 'séries' : 'série' }}. Pas encore confirmé par le serveur : l’envoi se fera dès le retour du réseau, sans doublon.</p>
        <div class="actions">
          <button class="primary" (click)="again()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Un autre exercice</button>
        </div>
      </section>
    } @else if (done(); as result) {
      <section class="panel done-panel">
        <span class="done-icon"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span>
        <h2>{{ result.count }} série(s) enregistrée(s)</h2>
        @if (result.linked) { <p class="muted">La séance du jour est marquée effectuée.</p> }
        @if (result.records.length) {
          <div class="record-grid">
            @for (r of result.records; track r.exercice + r.type) {
              <div class="record-card">
                <span class="record-icon"><i class="fa-solid fa-trophy" aria-hidden="true"></i></span>
                <div>
                  <strong>Nouveau record : {{ r.exercice }}</strong>
                  <span>{{ label(r.type) }} · {{ r.value }} {{ unit(r.type) }}@if (r.previous !== null) { <small> (avant : {{ r.previous }})</small> }</span>
                </div>
              </div>
            }
          </div>
        }
        <div class="actions">
          <button class="primary" (click)="again()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Un autre exercice</button>
          <a class="button secondary" [routerLink]="'/clients/' + clientId() + '/performance'">Voir la performance</a>
        </div>
      </section>
    } @else {
      @if (voiceNote()) { <p class="auto-note voice-note" data-testid="voice-note"><i class="fa-solid fa-microphone" aria-hidden="true"></i> Rempli par la voix. Vérifiez avant d’enregistrer.</p> }
      <section class="panel step">
        <h2><span class="step-no">1</span> Client</h2>
        @if (!clients().length) {
          <p class="muted">Aucun client pour l’instant. <a routerLink="/clients/new">Ajouter un client</a></p>
        } @else {
          <app-client-picker [clients]="clients()" [selected]="clientId()" inputId="wk-client" (picked)="clientId.set($event.id)" />
        }
      </section>

      <section class="panel step">
        <h2><span class="step-no">2</span> Exercice</h2>
        <label for="exo">Nom de l’exercice</label>
        <small class="field-help">{{ glossary.exercice }}</small>
        <input id="exo" list="exo-list" autocomplete="off" placeholder="Ex. Squat, Développé couché…" [value]="exercise()" (input)="exercise.set($any($event.target).value)">
        <datalist id="exo-list">@for (e of exercises(); track e.id) { <option [value]="e['nom']"></option> }</datalist>
        @if (exercises().length) {
          <div class="filter-tabs quick-exos" role="group" aria-label="Exercices fréquents">
            @for (e of exercises().slice(0, 8); track e.id) {
              <button type="button" [attr.aria-pressed]="exercise().toLowerCase() === display(e['nom']).toLowerCase()" (click)="exercise.set(display(e['nom']))">{{ e['nom'] }}</button>
            }
          </div>
        }
        <div class="date-row">
          <label for="log-date">Date</label>
          <input id="log-date" type="date" [value]="date()" (input)="date.set($any($event.target).value)">
        </div>
      </section>

      <section class="panel step">
        <h2><span class="step-no">3</span> Séries</h2>
        <p class="field-help rpe-line"><strong>RPE</strong> : effort ressenti, de 1 (facile) à 10 (maximum).</p>
        <details class="field-more"><summary>En savoir plus sur les séries</summary><p><strong>Reps</strong> : {{ glossary.reps }}</p><p><strong>Charge</strong> : {{ glossary.charge }}</p><p><strong>RPE</strong> : {{ glossary.rpe }}</p><p>{{ glossary.volume }}</p><p>{{ glossary.rm }}</p></details>
        @if (hint()) { <p class="auto-note"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> {{ hint() }}</p> }
        @if (planned(); as p) {
          <label class="mark-done"><input type="checkbox" [checked]="markDone()" (change)="markDone.set($any($event.target).checked)"> Marquer la séance de {{ time(p['date_heure']) }} comme effectuée</label>
        }
        <div class="sets">
          <div class="sets-head"><span>#</span><span>Reps</span><span>Charge (kg)</span><span>RPE</span><span></span></div>
          @for (s of sets(); track $index; let i = $index) {
            <div class="set-row">
              <span class="set-no">{{ i + 1 }}</span>
              <input type="number" inputmode="numeric" min="1" max="100" step="1" aria-label="Répétitions série {{ i + 1 }}" [value]="s.reps" (input)="patch(i, 'reps', $any($event.target).value)">
              <input type="number" inputmode="decimal" min="0" max="1000" step="0.5" aria-label="Charge en kilos série {{ i + 1 }}" [value]="s.charge" (input)="patch(i, 'charge', $any($event.target).value)">
              <input type="number" inputmode="decimal" min="1" max="10" step="0.5" placeholder="—" aria-label="Effort perçu série {{ i + 1 }}" [value]="s.rpe" (input)="patch(i, 'rpe', $any($event.target).value)">
              <button type="button" class="quiet" [disabled]="sets().length === 1" (click)="remove(i)" aria-label="Retirer la série {{ i + 1 }}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>
          }
        </div>
        <button type="button" class="secondary add-set" (click)="add()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter une série</button>

        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <div class="actions save-row">
          <button class="primary" [disabled]="busy()" (click)="save()">
            <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> {{ busy() ? 'Enregistrement…' : 'Enregistrer ' + sets().length + ' série(s)' }}
          </button>
          <span class="muted">{{ volume() }} kg de volume</span>
        </div>
      </section>
    }
  `,
  styles: [`
    :host{display:block}
    .step h2{display:flex;align-items:center;gap:12px;margin:0 0 16px;font-size:18px}
    .step-no{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-size:14px;font-weight:800}
    .date-row{margin-top:18px;max-width:240px}
    .sets{display:grid;gap:10px}
    .sets-head,.set-row{display:grid;grid-template-columns:34px 1fr 1fr 1fr 44px;gap:10px;align-items:center}
    .sets-head{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--soft)}
    .set-no{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--surface-2);font-weight:700;font-size:13px}
    .set-row input{margin:0;text-align:center;font-size:16px;font-weight:700;min-height:48px}
    .add-set{margin-top:14px}
    .mark-done{display:flex;gap:10px;align-items:center;margin:0 0 14px;padding:12px 14px;border-radius:14px;border:1px solid var(--edge);background:var(--surface-2);font-size:14px;font-weight:600;cursor:pointer}
    .mark-done input{margin:0;width:18px;height:18px}
    .auto-note{display:flex;gap:10px;align-items:center;margin:0 0 14px;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-size:13px;font-weight:600}
    .save-row{margin-top:22px}
    .quick-exos{margin:14px 0 0}
    .done-panel{text-align:center;padding:36px 24px}
    .done-icon{font-size:52px;color:var(--accent)}
    .queued-icon{color:var(--text)}
    .queued-panel h2{max-width:520px;margin-left:auto;margin-right:auto}
    .record-grid{display:grid;gap:12px;margin:22px auto;max-width:520px;text-align:left}
    .record-card{display:flex;gap:14px;align-items:center;padding:16px;border-radius:20px;background:var(--accent);color:var(--on-accent)}
    .record-card strong{display:block;font-size:15px}
    .record-card span{font-size:13px}
    .record-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--on-accent);color:var(--accent);font-size:20px;flex:none}
    .done-panel .actions{justify-content:center}
    @media(max-width:600px){.sets-head,.set-row{grid-template-columns:28px 1fr 1fr 1fr 36px;gap:6px}}
  `],
})
export class WorkoutPage {
  private api = inject(Api);
  private queue = inject(OfflineQueue);
  private rum = inject(Rum);
  private toast = inject(Toast);
  private route = inject(ActivatedRoute);
  private voice = inject(VoicePrefill);
  display = display;
  glossary = trainingGlossary;

  clients = signal<Row[]>([]);
  exercises = signal<Row[]>([]);
  loading = signal(true);
  busy = signal(false);
  /** Erreurs de saisie, affichées au-dessus du bouton d'enregistrement. */
  error = signal('');
  loadError = signal('');
  clientId = signal('');
  exercise = signal('');
  date = signal(todayInDakar());
  sets = signal<SetRow[]>([{ reps: '8', charge: '', rpe: '' }, { reps: '8', charge: '', rpe: '' }, { reps: '8', charge: '', rpe: '' }]);
  done = signal<{ count: number; records: NewRecord[]; linked: boolean } | null>(null);
  /** Saisie gardée sur l'appareil faute de réseau : jamais présentée comme un succès. */
  queued = signal<{ exercise: string; sets: number } | null>(null);
  /** Idempotency-Key de la tentative en cours : réutilisée pour le même contenu, nouvelle dès que le contenu change. */
  private attempt: { key: string; json: string } | null = null;
  clientLogs = signal<Row[]>([]);
  planned = signal<Row | null>(null);
  hint = signal('');
  /** Saisie préremplie par la dictée : le coach vérifie puis enregistre. */
  voiceNote = signal(false);
  private voiceSets = false;
  markDone = signal(false);
  private touched = false;

  volume = computed(() => Math.round(this.sets().reduce((sum, s) => sum + (Number(s.reps) || 0) * (Number(s.charge) || 0), 0)));

  constructor() {
    void this.load();
    effect(() => {
      const n = this.voice.arrived();
      untracked(() => { if (n > 0 && !this.loading()) this.applyVoice(this.clients()); });
    });
    effect(() => {
      const id = this.clientId();
      untracked(() => { this.touched = false; this.hint.set(''); this.clientLogs.set([]); this.planned.set(null); });
      if (id) void this.loadContext(id);
    });
    effect(() => {
      const name = this.exercise();
      const logs = this.clientLogs();
      untracked(() => this.prefill(name, logs));
    });
  }

  time = (value: unknown) => new Intl.DateTimeFormat('fr-SN', { timeZone: 'Africa/Dakar', hour: '2-digit', minute: '2-digit' }).format(new Date(String(value)));

  /** Historique du client et séance du jour : de quoi préremplir sans rien demander au coach. */
  private async loadContext(id: string) {
    try {
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      // Fenêtre utile seulement : les séances d'aujourd'hui pour ce client, pas tout l'historique.
      const today = todayInDakar();
      const [logs, sessions] = await Promise.all([this.api.get<Row[]>(`workouts?clientId=${id}&from=${since}`), this.api.get<Row[]>(`sessions?from=${today}&to=${today}&clientId=${id}`)]);
      if (this.clientId() !== id) return;
      const day = (v: unknown) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dakar' }).format(new Date(String(v)));
      this.planned.set(sessions.find(s => s['client_id'] === id && s['statut'] === 'PLANIFIEE' && day(s['date_heure']) === todayInDakar()) ?? null);
      this.clientLogs.set(logs);
    } catch { /* le préremplissage est un confort : la saisie reste possible sans */ }
  }

  private prefill(name: string, logs: Row[]) {
    if (this.touched || this.voiceSets) return;
    const wanted = name.trim().toLowerCase();
    const match = logs.filter(l => display((l['exercice'] as Row | undefined)?.['nom']).toLowerCase() === wanted);
    if (!wanted || !match.length) { this.hint.set(''); return; }
    const lastDate = match.map(l => String(l['log_date'])).sort().at(-1)!;
    // On reprend la DERNIÈRE saisie de cette journée, pas toutes les séries du jour : les séries d'une même saisie partagent leur horodatage.
    const ofDay = match.filter(l => l['log_date'] === lastDate);
    const lastEntry = ofDay.map(l => String(l['created_at'])).sort().at(-1)!;
    const last = ofDay.filter(l => String(l['created_at']) === lastEntry)
      .sort((a, b) => Number(a['serie_numero']) - Number(b['serie_numero']))
      .slice(0, 20);
    this.sets.set(last.map(l => ({ reps: String(l['reps']), charge: String(Number(l['charge_kg'])), rpe: l['rpe'] == null ? '' : String(Number(l['rpe'])) })));
    this.hint.set(`Séries reprises de la dernière séance (${dateLabel(lastDate)}).`);
  }

  label = (type: string) => recordLabel[type] ?? type;
  unit = (type: string) => recordUnit[type] ?? '';

  async load() {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [clients, exercises] = await Promise.all([this.api.get<Row[]>('clients'), this.api.get<Row[]>('exercises')]);
      this.clients.set(clients);
      this.exercises.set(exercises);
      const wanted = this.route.snapshot.queryParamMap.get('clientId');
      if (wanted && clients.some(c => c.id === wanted)) this.clientId.set(wanted);
      else if (clients.length === 1) this.clientId.set(clients[0].id);
      this.applyVoice(clients);
    } catch (e) {
      this.loadError.set(errorText(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Applique la dictée : champs reconnus seulement, rien n'est enregistré. */
  private applyVoice(clients: Row[]) {
    const v = this.voice.take('workout');
    if (!v) return;
    this.voiceNote.set(true);
    if (v.clientId && !this.clientId() && clients.some(c => c.id === v.clientId)) this.clientId.set(v.clientId);
    const name = v.fields['exercice'];
    if (typeof name === 'string' && name.trim() && !this.exercise().trim()) this.exercise.set(name.trim().slice(0, 100));
    const day = v.fields['log_date'];
    if (typeof day === 'string' && this.date() === todayInDakar() && /^\d{4}-\d{2}-\d{2}/.test(day)) this.date.set(day.slice(0, 10));
    const raw = v.fields['sets'];
    if (Array.isArray(raw)) {
      const rows: SetRow[] = raw.slice(0, 20).map((x: Record<string, unknown>) => ({
        reps: Number.isInteger(Number(x?.['reps'])) && Number(x['reps']) > 0 ? String(Number(x['reps'])) : '',
        charge: x?.['charge_kg'] != null && Number.isFinite(Number(x['charge_kg'])) ? String(Number(x['charge_kg'])) : '',
        rpe: x?.['rpe'] != null && Number.isFinite(Number(x['rpe'])) ? String(Number(x['rpe'])) : '',
      }));
      if (rows.length && !this.touched) { this.voiceSets = true; this.sets.set(rows); }
    }
  }

  patch(index: number, key: keyof SetRow, value: string) {
    this.touched = true;
    this.sets.update(rows => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  add() {
    this.touched = true;
    this.sets.update(rows => [...rows, { ...rows[rows.length - 1] }]);
  }

  remove(index: number) {
    this.touched = true;
    this.sets.update(rows => rows.filter((_, i) => i !== index));
  }

  again() {
    this.done.set(null);
    this.queued.set(null);
    this.markDone.set(false);
    this.touched = false;
    this.voiceSets = false;
    this.voiceNote.set(false);
    this.hint.set('');
    this.exercise.set('');
    this.sets.set([{ reps: '8', charge: '', rpe: '' }, { reps: '8', charge: '', rpe: '' }, { reps: '8', charge: '', rpe: '' }]);
  }

  /** Toast sobre : l'écran de fin détaille déjà les séries et les records, on ne répète que l'essentiel. */
  private announce(exercise: string, records: number) {
    const client = this.clients().find(c => c.id === this.clientId());
    const who = client ? `${client['prenom']} ${client['nom']}` : '';
    const detail = [exercise, who, records ? `${records} ${records > 1 ? 'records battus' : 'record battu'}` : ''].filter(Boolean).join(', ');
    this.toast.success('Entraînement enregistré', detail);
  }

  /** Pas de réseau : la saisie est gardée sur l'appareil avec sa clé d'idempotence, et l'écran le dit sans parler de succès. */
  private async keepOnDevice(key: string, body: Record<string, unknown>, exercise: string, sets: number, sessionId?: unknown) {
    const client = this.clients().find(c => c.id === this.clientId());
    await this.queue.enqueue({ id: key, body, client: client ? `${client['prenom']} ${client['nom']}` : 'Client', exercise, sets, logDate: String(body['log_date']), ...(sessionId ? { markDoneSessionId: String(sessionId) } : {}) });
    this.attempt = null;
    this.queued.set({ exercise, sets });
  }

  async save() {
    if (this.busy()) return;
    const name = this.exercise().trim();
    if (!this.clientId()) { this.error.set('Choisissez un client.'); return; }
    if (name.length < 2) { this.error.set('Indiquez le nom de l’exercice (2 caractères minimum).'); return; }
    const payload: { reps: number; charge_kg: number; rpe?: number }[] = [];
    for (const [i, s] of this.sets().entries()) {
      const reps = Number(s.reps);
      const charge = s.charge === '' ? 0 : Number(s.charge);
      if (!Number.isInteger(reps) || reps < 1 || reps > 100) { this.error.set(`Série ${i + 1} : les répétitions doivent être un entier de 1 à 100.`); return; }
      if (!Number.isFinite(charge) || charge < 0 || charge > 1000) { this.error.set(`Série ${i + 1} : la charge doit être comprise entre 0 et 1000 kg.`); return; }
      const rpe = s.rpe === '' ? undefined : Number(s.rpe);
      if (rpe !== undefined && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) { this.error.set(`Série ${i + 1} : l’effort perçu va de 1 à 10.`); return; }
      payload.push({ reps, charge_kg: charge, ...(rpe !== undefined ? { rpe } : {}) });
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const existing = this.exercises().find(e => display(e['nom']).toLowerCase() === name.toLowerCase());
      // Le coach décide : la séance n'est liée et marquée effectuée que si la case est cochée.
      const session = this.markDone() && this.date() === todayInDakar() ? this.planned() : null;
      const body = { client_id: this.clientId(), log_date: this.date(), sets: payload, ...(session ? { session_id: session.id } : {}), ...(existing ? { exercice_id: existing.id } : { exercice_nom: name }) };
      const json = JSON.stringify(body);
      if (!this.attempt || this.attempt.json !== json) this.attempt = { key: newUuid(), json };
      const key = this.attempt.key;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { await this.keepOnDevice(key, body, name, payload.length, session?.id); return; }
      let result: { logs: Row[]; newRecords: NewRecord[] };
      try {
        result = await this.api.write<{ logs: Row[]; newRecords: NewRecord[] }>('POST', 'workouts', body, { 'Idempotency-Key': key });
      } catch (e) {
        if (isNetworkError(e)) { await this.keepOnDevice(key, body, name, payload.length, session?.id); return; }
        throw e;
      }
      this.attempt = null;
      let linked = false;
      if (session) {
        try { await this.api.write('PATCH', 'sessions/' + session.id + '/status', { statut: 'EFFECTUEE' }); linked = true; this.planned.set(null); } catch {
          // La saisie est enregistrée même si le statut n'a pas pu changer : on le dit, sans rien décider à la place du coach.
          this.toast.error('Séance non marquée effectuée', 'Vos séries sont enregistrées. Ouvrez la séance pour changer son statut.');
        }
      }
      this.done.set({ count: result.logs.length, records: result.newRecords ?? [], linked });
      this.rum.completeTask('saisie_entrainement');
      this.announce(name, result.newRecords?.length ?? 0);
      // Simple rafraîchissement de la liste : un échec ici ne doit pas faire croire que la saisie a échoué.
      if (!existing) this.exercises.set(await this.api.get<Row[]>('exercises').catch(() => this.exercises()));
    } catch (e) {
      this.toast.fail('Entraînement non enregistré', e, () => void this.save());
    } finally {
      this.busy.set(false);
    }
  }
}
