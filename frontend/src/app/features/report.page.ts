import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Api, describeError, errorText } from '../core/api';
import { Confirm } from '../core/confirm';
import { Theme } from '../core/theme';
import { Toast } from '../core/toast';
import { PerfChart } from '../shared/perf-chart';

interface ReportData {
  client: { id: string; prenom: string; nom: string; objectif?: string | null };
  month: string;
  coach?: unknown;
  kpis: { seances_effectuees: number; seances_planifiees: number; seances_annulees: number; taux_presence: number | null; volume_kg: number; series: number; records: number; poids_debut: number | null; poids_fin: number | null; delta_poids: number | null };
  weeks: { label: string; start: string; volume_kg: number; seances_effectuees: number }[];
  poids: { label: string; value: number | null }[];
  mensurations: { key: string; label: string; unit: string; debut: number | null; fin: number | null; delta: number | null }[];
  records: { exercice: string; type: string; value: number; date: string }[];
}

const MAX_MESSAGE = 600;
const num = (v: number | null | undefined) => v == null ? '—' : new Intl.NumberFormat('fr-SN', { maximumFractionDigits: 1 }).format(v).replace(/[  ]/g, ' ');
const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const recordTypes: Record<string, string> = { '1RM': '1RM estimé', CHARGE: 'Charge maximale', REPS: 'Répétitions maximales' };

function previousMonth() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Dakar' }));
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Rapport mensuel d'un client : aperçu à l'écran, message du coach, envoi du PDF par partage direct. */
@Component({
  standalone: true,
  imports: [RouterLink, PerfChart],
  template: `
    <a class="back" [routerLink]="'/clients/' + clientId + '/performance'"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Retour à la performance</a>
    <div class="page-heading"><div><p class="eyebrow">RAPPORT DU MOIS</p><h1>{{ data() ? 'Rapport de ' + data()!.client.prenom + ' ' + data()!.client.nom : 'Rapport mensuel' }}</h1><p>Vérifiez le bilan, ajoutez un mot, puis envoyez le PDF à votre client.</p></div></div>

    <section class="panel report-month">
      <label for="month">Mois du rapport</label>
      <input id="month" type="month" [value]="month()" [max]="maxMonth" (change)="setMonth($any($event.target).value)" required>
      <span class="field-help">Bilan du mois précédent.</span>
    </section>

    @if (loading()) {
      <p class="empty" role="status">Chargement du rapport…</p>
    } @else if (error()) {
      <div class="empty"><p class="error" role="alert">{{ error() }}</p><button class="secondary" type="button" (click)="load()">Réessayer</button></div>
    } @else if (data(); as d) {
      @if (isEmpty()) {
        <p class="auto-note report-empty" role="status"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>Aucune séance ni mesure en {{ monthLabel() }}. Vous pouvez quand même envoyer le rapport, il restera très court.</span></p>
      }
      <div class="report-kpis" role="list" aria-label="Chiffres clés de {{ monthLabel() }}">
        <div class="report-kpi featured" role="listitem"><span>Séances effectuées</span><strong>{{ d.kpis.seances_effectuees }}</strong><small>sur {{ d.kpis.seances_planifiees + d.kpis.seances_effectuees }} prévue(s)</small></div>
        <div class="report-kpi" role="listitem"><span>Présence</span><strong>{{ d.kpis.taux_presence == null ? '—' : num(d.kpis.taux_presence) + ' %' }}</strong><small>{{ d.kpis.seances_annulees }} annulée(s)</small></div>
        <div class="report-kpi" role="listitem"><span>Volume soulevé</span><strong>{{ num(d.kpis.volume_kg) }} kg</strong><small>{{ d.kpis.series }} série(s)</small></div>
        <div class="report-kpi" role="listitem"><span>Records battus</span><strong>{{ d.kpis.records }}</strong><small>ce mois-ci</small></div>
        <div class="report-kpi" role="listitem"><span>Poids</span><strong>{{ num(d.kpis.poids_fin) }}{{ d.kpis.poids_fin == null ? '' : ' kg' }}</strong><small>{{ d.kpis.delta_poids == null ? 'Pas de comparaison' : (d.kpis.delta_poids > 0 ? '+' : '') + num(d.kpis.delta_poids) + ' kg sur le mois' }}</small></div>
      </div>

      <div class="two-col">
        <section class="panel"><div class="panel-head"><h2>Volume par semaine</h2><span class="muted">kg soulevés</span></div><app-perf-chart [points]="volumePoints()" unit="kg" title="Volume soulevé par semaine" /></section>
        <section class="panel"><div class="panel-head"><h2>Séances par semaine</h2></div><app-perf-chart [points]="sessionPoints()" title="Séances effectuées par semaine" /></section>
      </div>
      <section class="panel"><div class="panel-head"><h2>Poids sur 6 mois</h2><span class="muted">moyenne mensuelle</span></div><app-perf-chart [points]="d.poids" mode="line" unit="kg" title="Poids moyen sur 6 mois" /></section>

      @if (d.mensurations.length) {
        <section class="panel"><div class="panel-head"><h2>Mensurations</h2></div>
          <ul class="report-list">@for (m of d.mensurations; track m.key) {<li><span>{{ m.label }}</span><span class="muted">{{ num(m.debut) }} → {{ num(m.fin) }} {{ m.unit }}</span><strong>{{ m.delta == null ? '—' : (m.delta > 0 ? '+' : '') + num(m.delta) + ' ' + m.unit }}</strong></li>}</ul>
        </section>
      }
      <section class="panel"><div class="panel-head"><h2>Records battus</h2><span class="muted">{{ d.records.length }}</span></div>
        @if (!d.records.length) { <p class="muted">Aucun record battu en {{ monthLabel() }}.</p> }
        @else { <ul class="report-list">@for (r of d.records; track $index) {<li><span><i class="fa-solid fa-trophy" aria-hidden="true"></i> {{ r.exercice }}</span><span class="muted">{{ typeLabel(r.type) }} · {{ dateText(r.date) }}</span><strong>{{ num(r.value) }}{{ r.type.toUpperCase() === 'REPS' ? ' rép.' : ' kg' }}</strong></li>}</ul> }
      </section>

      <section class="panel report-send">
        <label for="message">Message du coach (facultatif)</label>
        <span class="field-help" id="message-help">Il apparaît dans un encadré du PDF. Modifiez la suggestion ou effacez-la.</span>
        <textarea id="message" rows="4" [maxLength]="maxMessage" [value]="message()" aria-describedby="message-help message-count" (input)="onMessage($any($event.target).value)"></textarea>
        <span class="report-count" id="message-count" [attr.data-near]="message().length >= 540">{{ message().length }} / {{ maxMessage }} caractères</span>

        @if (pdfError()) { <p class="error" role="alert">{{ pdfError() }} <button class="quiet" type="button" (click)="preparePdf()">Réessayer</button></p> }
        <div class="actions report-actions">
          <button class="primary" type="button" [disabled]="!pdfReady() || sending()" (click)="send()"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> {{ pdfReady() ? 'Envoyer' : (pdfError() ? 'PDF indisponible' : 'Préparation du PDF…') }}</button>
          <button class="secondary" type="button" [disabled]="!pdfReady()" (click)="download(true)"><i class="fa-solid fa-download" aria-hidden="true"></i> Télécharger le PDF</button>
        </div>
        <p class="sr-only" role="status" aria-live="polite">{{ pdfReady() ? 'Le PDF est prêt à envoyer.' : (pdfError() ? '' : 'Préparation du PDF en cours.') }}</p>

        @if (fallback()) {
          <div class="auto-note report-fallback" role="status"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>Cet appareil ne peut pas envoyer le PDF directement. Il a été téléchargé : joignez-le dans votre message WhatsApp. Sinon, envoyez un lien valable 24 heures.</span></div>
          <button class="secondary" type="button" [disabled]="linkBusy()" (click)="shareLink()"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> {{ linkBusy() ? 'Préparation du lien…' : 'Envoyer un lien WhatsApp (24 h)' }}</button>
        }
      </section>
    }
  `,
})
export class ReportPage implements OnDestroy {
  private http = inject(HttpClient);
  private api = inject(Api);
  private toast = inject(Toast);
  private theme = inject(Theme);
  private confirm = inject(Confirm);
  clientId = inject(ActivatedRoute).snapshot.paramMap.get('clientId') ?? '';
  maxMessage = MAX_MESSAGE;
  maxMonth = new Date().toISOString().slice(0, 7);
  num = num;

  month = signal(previousMonth());
  data = signal<ReportData | null>(null);
  loading = signal(true);
  error = signal('');
  message = signal('');
  private edited = false;
  pdf = signal<{ blob: Blob; key: string } | null>(null);
  pdfError = signal('');
  sending = signal(false);
  fallback = signal(false);
  linkBusy = signal(false);

  private dataSub?: Subscription;
  private pdfSub?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;

  private key = () => this.month() + '|' + this.message();
  pdfReady = computed(() => this.pdf()?.key === this.key() && !this.pdfError());
  monthLabel = computed(() => new Intl.DateTimeFormat('fr-SN', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(this.month() + '-01T12:00:00Z')));
  volumePoints = computed(() => (this.data()?.weeks ?? []).map(w => ({ label: w.label, value: w.volume_kg })));
  sessionPoints = computed(() => (this.data()?.weeks ?? []).map(w => ({ label: w.label, value: w.seances_effectuees })));
  isEmpty = computed(() => { const k = this.data()?.kpis; return !!k && !k.seances_effectuees && !k.series && !k.records && k.poids_fin == null && !(this.data()?.mensurations.length); });

  constructor() { void this.load(); }
  ngOnDestroy() { this.dataSub?.unsubscribe(); this.pdfSub?.unsubscribe(); clearTimeout(this.timer); }

  typeLabel(t: string) { return recordTypes[t.toUpperCase()] ?? 'Record'; }
  dateText(v: string) { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('fr-SN', { timeZone: 'Africa/Dakar', day: 'numeric', month: 'short' }).format(d); }

  setMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value === this.month()) return;
    this.month.set(value); this.fallback.set(false); this.edited = false; void this.load();
  }
  onMessage(value: string) {
    this.edited = true; this.message.set(value.slice(0, MAX_MESSAGE)); this.fallback.set(false);
    this.pdfSub?.unsubscribe(); this.pdfError.set('');
    clearTimeout(this.timer); this.timer = setTimeout(() => this.preparePdf(), 600);
  }
  private suggestion(d: ReportData) {
    const mois = this.monthLabel();
    const text = d.kpis.seances_effectuees > 0
      ? `Bravo pour ce mois de ${mois}, ${d.client.prenom} : ${d.kpis.seances_effectuees} séance(s) effectuée(s). Continuons sur cette lancée !`
      : `Bonjour ${d.client.prenom}, voici votre bilan de ${mois}. Reprenons ensemble dès la prochaine séance !`;
    return text.slice(0, MAX_MESSAGE);
  }

  load() {
    this.dataSub?.unsubscribe(); this.pdfSub?.unsubscribe(); clearTimeout(this.timer);
    this.loading.set(true); this.error.set(''); this.pdf.set(null); this.pdfError.set('');
    const month = this.month();
    this.dataSub = this.http.get<{ data: ReportData }>(`/api/v1/exports/report/${this.clientId}/data`, { params: { month } }).subscribe({
      next: r => {
        this.data.set(r.data);
        if (!this.edited) this.message.set(this.suggestion(r.data));
        this.loading.set(false); this.preparePdf();
      },
      error: e => { this.error.set(errorText(e)); this.loading.set(false); },
    });
  }

  preparePdf() {
    this.pdfSub?.unsubscribe(); clearTimeout(this.timer);
    this.pdfError.set(''); const key = this.key();
    const params: Record<string, string> = { month: this.month(), theme: this.theme.current() };
    if (this.message().trim()) params['message'] = this.message();
    this.pdfSub = this.http.get(`/api/v1/exports/report/${this.clientId}`, { params, responseType: 'blob' }).subscribe({
      next: blob => this.pdf.set({ blob: new Blob([blob], { type: 'application/pdf' }), key }),
      error: e => { const i = describeError(e); this.pdfError.set(`${i.message} ${i.hint}`); },
    });
  }

  private fileName() { const c = this.data()?.client; return `rapport-${slug((c?.prenom ?? '') + ' ' + (c?.nom ?? '')) || 'client'}-${this.month()}.pdf`; }
  private title() { const c = this.data()?.client; return `Rapport de ${c?.prenom ?? ''} ${c?.nom ?? ''} - ${this.monthLabel()}`.replace(/\s+/g, ' '); }

  async send() {
    const pdf = this.pdf(); if (!pdf || pdf.key !== this.key() || this.sending()) return;
    const c = this.data()?.client; const who = `${c?.prenom ?? ''} ${c?.nom ?? ''}`.trim() || 'ce client';
    if (!(await this.confirm.ask({ title: 'Envoyer le rapport ?', detail: `Le rapport de ${this.monthLabel()} sera partagé avec ${who}. Un envoi ne peut pas être repris.`, confirmLabel: 'Envoyer le rapport', tone: 'sensitive' }))) return;
    const file = new File([pdf.blob], this.fileName(), { type: 'application/pdf' });
    const text = this.message().trim() || `Votre rapport de ${this.monthLabel()}.`;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (!(typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }))) {
      this.download(false); this.fallback.set(true); return;
    }
    this.sending.set(true);
    try {
      await nav.share({ files: [file], title: this.title(), text });
      this.toast.success('Rapport prêt à envoyer', 'Terminez l’envoi dans l’application choisie.');
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return; // annulé par le coach : pas une erreur
      this.download(false); this.fallback.set(true);
    } finally { this.sending.set(false); }
  }

  download(announce: boolean) {
    const pdf = this.pdf(); if (!pdf) return;
    const url = URL.createObjectURL(pdf.blob); const a = document.createElement('a');
    a.href = url; a.download = this.fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toast.success('PDF téléchargé', this.fileName());
    void announce;
  }

  async shareLink() {
    if (this.linkBusy()) return;
    const c = this.data()?.client; const who = `${c?.prenom ?? ''} ${c?.nom ?? ''}`.trim() || 'ce client';
    if (!(await this.confirm.ask({ title: 'Préparer le lien WhatsApp ?', detail: `Un lien valable 24 heures vers le rapport de ${who} va être créé : toute personne qui l’a peut le lire.`, confirmLabel: 'Créer le lien', tone: 'sensitive' }))) return;
    this.linkBusy.set(true);
    try {
      const r = await this.api.write<{ waLink: string }>('POST', `exports/report/${this.clientId}/share`, { month: this.month(), message: this.message().trim() || undefined, theme: this.theme.current() });
      window.open(r.waLink, '_blank', 'noopener');
      this.toast.success('Lien WhatsApp prêt', 'Le lien est valable 24 heures.');
    } catch (e) { this.toast.fail('Lien non préparé', e, () => void this.shareLink()); }
    finally { this.linkBusy.set(false); }
  }
}
