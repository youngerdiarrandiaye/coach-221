import { Component, ElementRef, OnDestroy, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, dateLabel, describeError, display, money } from '../../core/api';
import { VOICE_TARGETS, VoiceIntent, VoiceParse, VoicePrefill, isVoiceIntent } from '../../core/voice-prefill';
import { features } from '../features';
import { FocusTrap } from '../focus-trap';

type Phase = 'edit' | 'listening' | 'loading' | 'result';

const LABELS: Record<string, string> = {
  client_id: 'Client', exercice: 'Exercice', sets: 'Séries', log_date: 'Date', mesure_date: 'Date de mesure',
  ...Object.fromEntries(['clients', 'progress', 'payments', 'sessions'].flatMap(k => features[k].fields.map(f => [f.key, f.label.replace(/ \((FCFA|kg|cm|%|minutes|bpm)\)$/, '')]))),
  date_heure: 'Date et heure', duree_minutes: 'Durée', date_paiement: 'Date du paiement', montant: 'Montant', methode: 'Mode de paiement', statut: 'Statut', titre: 'Titre',
};
const label = (key: string) => LABELS[key] ?? display(key);

/** Date renvoyée par le serveur en heure de Dakar (UTC+0) : « AAAA-MM-JJThh:mm » lisible quel que soit le fuseau du navigateur. */
const dakar = (value: unknown) => {
  const text = String(value ?? '');
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : text + 'Z');
  return Number.isNaN(d.getTime()) ? text : d.toISOString().slice(0, 16);
};

function format(key: string, value: unknown): string {
  if (key === 'montant') return money(value);
  if (key === 'date_heure') return dateLabel(dakar(value) + ':00Z');
  if (key === 'date_paiement' || key === 'log_date' || key === 'mesure_date') return dateLabel(value);
  if (key === 'duree_minutes') return value + ' min';
  if (key === 'sets' && Array.isArray(value)) {
    return value.map((s: Record<string, unknown>) => [s['reps'] != null ? s['reps'] + ' reps' : '', s['charge_kg'] != null ? s['charge_kg'] + ' kg' : '', s['rpe'] != null ? 'effort ' + s['rpe'] : ''].filter(Boolean).join(', ')).join(' · ');
  }
  if (key.endsWith('_kg')) return value + ' kg';
  if (key.endsWith('_cm')) return value + ' cm';
  if (key.endsWith('_pct')) return value + ' %';
  if (key.endsWith('_bpm')) return value + ' bpm';
  return display(value);
}

interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
/** Application ajoutée à l'écran d'accueil (iPhone : « standalone », ailleurs : mode d'affichage autonome). */
const isInstalled = () => typeof window !== 'undefined' && ((navigator as any).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true);
const recognitionClass = (): (new () => SpeechRecognitionLike) | null => {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  // iPhone : la reconnaissance vocale du navigateur n'existe pas dans une application ajoutée à l'écran d'accueil
  // (la classe est présente mais ne démarre jamais) : on passe directement à la saisie et au micro du clavier.
  if (isIos() && isInstalled()) return null;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
};

/** Le micro est refusé : où l'autoriser, selon le téléphone. */
const micHelp = () => isIos()
  ? 'Le micro est refusé. Réglages de l’iPhone > Safari > Micro : autorisez ce site, ou touchez le micro du clavier.'
  : 'Le micro est refusé. Autorisez-le : réglages du téléphone > Applications > Chrome (ou CoachSen) > Autorisations > Micro. Ou touchez le micro du clavier.';

/** Texte de la dictée : certains Android renvoient des résultats cumulés (« bonjour », « bonjour Awa ») ; on garde le plus complet. */
const joinResults = (results: ArrayLike<ArrayLike<{ transcript: string }>>) => {
  let text = '';
  for (let i = 0; i < results.length; i++) {
    const part = (results[i][0]?.transcript ?? '').trim();
    if (!part) continue;
    text = part.toLowerCase().startsWith(text.toLowerCase()) && text ? part : (text ? text + ' ' + part : part);
  }
  return text;
};

/** Feuille « Dictée » : le coach parle ou écrit, l'IA propose, le formulaire s'ouvre prérempli. Rien n'est enregistré ici. */
@Component({
  selector: 'app-voice-sheet',
  standalone: true,
  imports: [FocusTrap],
  template: `
    <div class="modal-backdrop voice-backdrop" (click)="close()">
      <section class="modal voice-sheet" role="dialog" aria-modal="true" aria-labelledby="voice-title" appFocusTrap (escape)="close()" (click)="$event.stopPropagation()" data-testid="voice-sheet">
        <header class="voice-head">
          <h2 id="voice-title"><i class="fa-solid fa-microphone" aria-hidden="true"></i> Dictée</h2>
          <button type="button" class="quiet voice-close" (click)="close()" aria-label="Fermer la dictée"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>

        @if (phase() !== 'result') {
          <p class="voice-status" role="status" aria-live="polite">
            @if (phase() === 'listening') { <span class="voice-dot" aria-hidden="true"></span> J’écoute… }
            @else if (phase() === 'loading') { Analyse en cours… }
            @else if (!supported) { La dictée n’est pas disponible ici : saisissez votre demande ou dictez-la avec le clavier du téléphone. }
            @else { Dites par exemple : « Paiement de vingt-cinq mille en Wave pour Awa ». }
          </p>
          <label for="voice-text" class="sr-only">Votre demande</label>
          <textarea id="voice-text" rows="3" maxlength="1000" autocomplete="off" placeholder="Votre demande…" [attr.data-autofocus]="!supported ? '' : null"
                    [value]="transcript()" [disabled]="phase() === 'loading'" (input)="transcript.set($any($event.target).value)"></textarea>

          @if (problem()) {
            <p class="error voice-problem" role="alert">{{ problem() }}</p>
          }
          <p class="voice-hint"><i class="fa-solid fa-keyboard" aria-hidden="true"></i> Astuce : le micro du clavier de votre téléphone dicte aussi dans ce champ.</p>

          <div class="actions voice-actions">
            @if (phase() === 'listening') {
              <button type="button" class="primary" data-autofocus (click)="stopListening()"><i class="fa-solid fa-stop" aria-hidden="true"></i> Arrêter</button>
            } @else {
              <button type="button" class="primary" [disabled]="phase() === 'loading' || !transcript().trim()" (click)="understand()">
                {{ phase() === 'loading' ? 'Analyse…' : 'Comprendre' }}
              </button>
              @if (supported) {
                <button type="button" class="secondary" [disabled]="phase() === 'loading'" (click)="listen()"><i class="fa-solid fa-microphone" aria-hidden="true"></i> Dicter</button>
              }
              @if (retryable() && lastFailed()) {
                <button type="button" class="secondary" [disabled]="waitLeft() > 0" (click)="understand()">{{ waitLeft() > 0 ? 'Réessayer dans ' + waitLeft() + ' s' : 'Réessayer' }}</button>
              }
            }
          </div>
        } @else if (result(); as r) {
          <div class="voice-card" data-testid="voice-card">
            @if (intent(); as it) {
              <h3>J’ai compris : {{ phrase(it) }}</h3>
              @if (rows().length || r.client || chosen()) {
                <dl class="voice-fields">
                  @for (row of rows(); track row.key) { <div><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div> }
                  @if (chosen() ?? r.client; as c) { <div><dt>Client</dt><dd>{{ c.name }}</dd></div> }
                </dl>
              } @else { <p class="muted">Je n’ai reconnu aucun détail : le formulaire s’ouvrira vide.</p> }

              @if (needsClient() && !r.client && r.candidates.length) {
                <p class="voice-label" id="voice-candidates">Quel client ?</p>
                <div class="filter-tabs" role="group" aria-labelledby="voice-candidates">
                  @for (c of r.candidates; track c.id) {
                    <button type="button" [attr.aria-pressed]="chosen()?.id === c.id" (click)="chosen.set(c)">{{ c.name }}</button>
                  }
                </div>
              }
              @if (missingLabels().length) {
                <p class="voice-missing"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> À compléter : {{ missingLabels().join(', ') }}.</p>
              }
              @for (w of r.warnings; track w) { <p class="voice-hint">{{ w }}</p> }
              @if (r.source === 'rules' || r.degraded) { <p class="voice-hint">Compréhension approximative : vérifiez bien chaque champ.</p> }
            } @else {
              <h3>Je ne peux pas remplir cette demande</h3>
              <p class="muted">Je sais préparer un client, un paiement, une séance, une mesure ou une saisie d’entraînement. Reformulez votre demande.</p>
            }
          </div>
          <div class="actions voice-actions">
            @if (intent()) { <button type="button" class="primary" data-testid="voice-fill" data-autofocus (click)="fill()">Remplir le formulaire</button> }
            <button type="button" class="secondary" (click)="again()">Recommencer</button>
          </div>
        }

        <p class="voice-privacy"><i class="fa-solid fa-lock" aria-hidden="true"></i> Votre voix est transcrite par le navigateur. Le texte est analysé par un service d’IA pour remplir le formulaire. Rien n’est enregistré sans votre validation.</p>
      </section>
    </div>
  `,
})
export class VoiceSheet implements OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private prefill = inject(VoicePrefill);
  readonly closed = output<void>();

  readonly supported = recognitionClass() !== null;
  phase = signal<Phase>('edit');
  transcript = signal('');
  problem = signal('');
  retryable = signal(false);
  lastFailed = signal(false);
  waitLeft = signal(0);
  result = signal<VoiceParse | null>(null);
  chosen = signal<{ id: string; name: string } | null>(null);

  private rec: SpeechRecognitionLike | null = null;
  private recError = '';
  private version = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  intent = computed<VoiceIntent | null>(() => { const i = this.result()?.intent; return isVoiceIntent(i) ? i : null; });
  needsClient = computed(() => { const i = this.intent(); return i !== null && i !== 'client'; });
  rows = computed(() => Object.entries(this.result()?.fields ?? {})
    .filter(([key, v]) => key !== 'client_id' && v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([key, v]) => ({ key, label: label(key), value: format(key, v) })));
  missingLabels = computed(() => (this.result()?.missing ?? []).filter(k => !(k === 'client_id' && this.chosen())).map(label));

  constructor() {
    // Le clic sur le micro est le geste de l'utilisateur : la dictée démarre aussitôt.
    if (this.supported) queueMicrotask(() => this.listen());
  }

  /** Quand l'élément qui avait le focus disparaît (changement d'état), le focus revient dans la feuille : Échap et Tab restent actifs. */
  private refocus() {
    setTimeout(() => {
      const root = this.host.nativeElement.querySelector<HTMLElement>('.voice-sheet');
      if (!root || root.contains(document.activeElement) && document.activeElement !== root && document.activeElement !== document.body) return;
      (root.querySelector<HTMLElement>('[data-autofocus]') ?? root).focus();
    }, 30);
  }

  phrase(intent: VoiceIntent) { return VOICE_TARGETS[intent].phrase; }

  listen() {
    const Rec = recognitionClass();
    if (!Rec) return;
    if (typeof window !== 'undefined' && window.isSecureContext === false) { this.fallback('La dictée demande une connexion sécurisée (HTTPS). Saisissez votre demande à la place.'); return; }
    this.dropRecognition();
    this.problem.set(''); this.lastFailed.set(false); this.recError = '';
    this.transcript.set('');
    const rec = new Rec();
    rec.lang = 'fr-FR'; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = e => {
      if (this.rec !== rec) return;
      this.transcript.set(joinResults(e.results).trim());
    };
    rec.onerror = e => {
      if (this.rec !== rec) return;
      this.recError = String(e?.error ?? 'error');
      if (this.recError === 'aborted') return;
      this.problem.set(({
        'not-allowed': micHelp(),
        'service-not-allowed': micHelp(),
        'no-speech': 'Je n’ai rien entendu. Réessayez avec « Dicter », ou saisissez votre demande.',
        'audio-capture': 'Aucun micro détecté. Saisissez votre demande ci-dessous.',
        'network': 'La dictée a besoin d’une bonne connexion internet (elle passe par le service de reconnaissance du téléphone). Réessayez, ou touchez le micro du clavier.',
        'language-not-supported': 'Le français n’est pas disponible pour la dictée sur ce téléphone. Touchez le micro du clavier.',
      } as Record<string, string>)[this.recError] ?? `La dictée a échoué (code : ${this.recError}). Touchez le micro du clavier du téléphone, ou saisissez votre demande.`);
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (this.phase() !== 'listening') return;
      this.phase.set('edit');
      this.refocus();
      // Fin de la parole : on lance la compréhension sans clic supplémentaire.
      if (!this.recError && this.transcript().trim()) void this.understand();
      else if (!this.recError) this.problem.set('Je n’ai rien entendu. Réessayez avec « Dicter », ou saisissez votre demande.');
    };
    this.rec = rec;
    this.phase.set('listening');
    this.refocus();
    try { rec.start(); } catch { this.rec = null; this.fallback('La dictée n’a pas pu démarrer. Saisissez votre demande à la place.'); }
  }

  stopListening() { try { this.rec?.stop(); } catch { /* déjà arrêtée */ } }

  private fallback(message: string) { this.phase.set('edit'); this.problem.set(message); }

  private dropRecognition() {
    const rec = this.rec; this.rec = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = null;
    try { rec.abort(); } catch { /* déjà arrêtée */ }
  }

  async understand() {
    const text = this.transcript().trim();
    if (!text) { this.problem.set('Dites ou saisissez ce que vous voulez remplir.'); return; }
    if (this.phase() === 'loading') return;
    this.dropRecognition();
    const version = ++this.version;
    this.problem.set(''); this.lastFailed.set(false); this.retryable.set(false);
    this.phase.set('loading');
    this.refocus();
    try {
      const data = await this.api.write<VoiceParse>('POST', 'voice/parse', { transcript: text.slice(0, 1000), intent: 'auto' });
      if (version !== this.version) return;
      this.result.set({ ...data, fields: data.fields ?? {}, missing: data.missing ?? [], candidates: data.candidates ?? [], warnings: data.warnings ?? [] });
      this.chosen.set(null);
      this.phase.set('result');
      this.refocus();
    } catch (error) {
      if (version !== this.version) return;
      const info = describeError(error);
      this.problem.set(`${info.message} ${info.hint}`.trim());
      this.retryable.set(info.retryable); this.lastFailed.set(true);
      this.countdown(info.retryAfter ?? 0);
      this.phase.set('edit');
      this.refocus();
    }
  }

  private countdown(seconds: number) {
    clearInterval(this.timer);
    this.waitLeft.set(seconds);
    if (seconds <= 0) return;
    this.timer = setInterval(() => { const left = this.waitLeft() - 1; this.waitLeft.set(Math.max(0, left)); if (left <= 0) clearInterval(this.timer); }, 1000);
  }

  again() { this.version++; this.result.set(null); this.chosen.set(null); this.problem.set(''); this.phase.set('edit'); this.refocus(); if (this.supported) this.listen(); }

  fill() {
    const r = this.result(); const intent = this.intent();
    if (!r || !intent) return;
    this.prefill.set({ intent, fields: r.fields, clientId: intent === 'client' ? '' : (this.chosen()?.id ?? r.client?.id ?? '') });
    this.close();
    void this.router.navigateByUrl(VOICE_TARGETS[intent].route);
  }

  close() { this.closed.emit(); }

  ngOnDestroy() { this.version++; this.dropRecognition(); clearInterval(this.timer); }
}
