import { Component, computed, effect, inject, signal } from '@angular/core';
import { Api, errorText } from '../../core/api';
import { Toast } from '../../core/toast';
import { EspaceStore, dayLabel, monthLabel, num } from '../../core/espace-store';
import { ChartPoint, PerfChart } from '../../shared/perf-chart';

interface MonthReport {
  month: string;
  coach: string | null;
  kpis: { seances_effectuees: number; seances_planifiees: number; seances_annulees: number; taux_presence: number | null; volume_kg: number; series: number; records: number; poids_debut: number | null; poids_fin: number | null; delta_poids: number | null };
  weeks: { label: string; start: string; volume_kg: number; seances_effectuees: number }[];
  poids: { label: string; value: number }[];
  mensurations: { key: string; label: string; unit: string; debut: number | null; fin: number | null; delta: number | null }[];
  records: { exercice: string; type: string; value: number; date: string }[];
}

/** Rapports : rapport mensuel (aperçu et PDF), puis le détail semaine par semaine et jour par jour. */
@Component({
  standalone: true,
  imports: [PerfChart],
  template: `
    @if (store.error()) { <div class="empty"><p class="error" role="alert">{{ store.error() }}</p><button class="secondary" type="button" (click)="store.load(true)">Réessayer</button></div> }
    @else if (!store.data()) { <p role="status" class="muted">Chargement…</p> }
    @else if (store.data(); as d) {
      <h1>Mes rapports</h1>

      <section class="panel">
        <div class="e-head"><h2>Rapport mensuel</h2>
          <button type="button" class="e-download" [disabled]="!month() || downloading()" (click)="download()"><i class="fa-solid fa-download" aria-hidden="true"></i> {{ downloading() ? 'Préparation…' : 'Télécharger le PDF' }}</button></div>
        @if (!d.months.length) { <p class="muted">Votre premier rapport sera disponible dès votre première séance, pesée ou entraînement enregistré.</p> }
        @else {
          <div class="e-months" role="group" aria-label="Mois du rapport">@for (m of d.months; track m) {
            <button type="button" [attr.aria-pressed]="m === month()" (click)="month.set(m)">{{ label(m) }}</button>
          }</div>
          @if (reportError()) { <p class="error" role="alert">{{ reportError() }}</p> }
          @else if (!report()) { <p role="status" class="muted">Chargement du rapport…</p> }
          @else if (report(); as r) {
            <div class="e-kpis">
              <div class="e-kpi"><span class="muted">Séances effectuées</span><strong>{{ r.kpis.seances_effectuees }}</strong><small class="muted">sur {{ r.kpis.seances_planifiees + r.kpis.seances_effectuees }} prévue(s)</small></div>
              <div class="e-kpi"><span class="muted">Présence</span><strong>{{ r.kpis.taux_presence === null ? '—' : r.kpis.taux_presence + ' %' }}</strong></div>
              <div class="e-kpi"><span class="muted">Volume soulevé</span><strong>{{ num(r.kpis.volume_kg, 0) }} kg</strong><small class="muted">{{ r.kpis.series }} série(s)</small></div>
              <div class="e-kpi"><span class="muted">Records battus</span><strong>{{ r.kpis.records }}</strong></div>
              <div class="e-kpi"><span class="muted">Poids</span><strong>{{ r.kpis.poids_fin === null ? '—' : num(r.kpis.poids_fin) + ' kg' }}</strong>
                @if (r.kpis.delta_poids !== null) { <small class="muted">{{ r.kpis.delta_poids > 0 ? '+' : '' }}{{ num(r.kpis.delta_poids) }} kg sur le mois</small> }</div>
            </div>
            @if (volumePoints().length) { <h3>Volume par semaine</h3><app-perf-chart [points]="volumePoints()" unit="kg" title="Volume par semaine" /> }
            @if (r.mensurations.length) {
              <h3>Mensurations</h3>
              <ul class="e-plain">@for (m of r.mensurations; track m.key) { <li><span>{{ m.label }}</span><strong>{{ m.fin === null ? '—' : num(m.fin, 2) + ' ' + m.unit }}</strong>@if (m.delta !== null) { <span class="muted">{{ m.delta > 0 ? '+' : '' }}{{ num(m.delta, 2) }}</span> }</li> }</ul>
            }
            @if (r.records.length) {
              <h3>Records du mois</h3>
              <ul class="e-plain">@for (x of r.records; track $index) { <li><span>{{ x.exercice }}</span><strong>{{ num(x.value) }} kg</strong><span class="muted">{{ dayLabel(x.date) }}</span></li> }</ul>
            }
          }
        }
      </section>

      <section class="panel">
        <div class="e-head"><h2>Semaine par semaine</h2><span class="muted">8 dernières semaines</span></div>
        <ul class="e-plain e-weeks">@for (w of d.weeks; track w.start) {
          <li><span>{{ dayLabel(w.start) }} → {{ dayLabel(w.end) }}</span>
            <span><strong>{{ w.sessionsDone }}</strong> séance(s) effectuée(s) sur {{ w.sessionsPlanned }}</span>
            <span class="muted">{{ num(w.volumeKg, 0) }} kg · {{ w.sets }} série(s){{ w.weightKg === null ? '' : ' · ' + num(w.weightKg) + ' kg' }}</span></li>
        }</ul>
      </section>

      <section class="panel">
        <div class="e-head"><h2>Journal quotidien</h2><span class="muted">14 derniers jours</span></div>
        @if (!d.journal.length) { <p class="muted">Rien à afficher pour le moment.</p> }
        @else { <ul class="e-plain">@for (e of d.journal; track $index) { <li><span>{{ dayLabel(e.date) }}</span><strong>{{ e.label }}</strong></li> }</ul> }
      </section>
    }
  `,
  styles: [`
    :host{display:block}h1{margin:0 0 18px;font-size:clamp(26px,4.5vw,36px);letter-spacing:-.03em}h3{margin:20px 0 8px;font-size:15px}
    .panel{padding:20px;border-radius:24px;border:1px solid var(--edge);background:var(--surface);margin-bottom:12px}
    .e-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}.e-head h2{margin:0;font-size:18px}
    .e-download{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 16px;border:0;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;cursor:pointer}
    .e-download:disabled{opacity:.6;cursor:default}
    .e-months{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
    .e-months button{min-height:38px;padding:0 14px;border:1px solid var(--edge);border-radius:999px;background:transparent;color:var(--soft);font-weight:600;cursor:pointer;text-transform:capitalize}
    .e-months button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
    .e-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
    .e-kpi{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:18px;background:var(--surface-2)}.e-kpi strong{font-size:22px;font-weight:800}.e-kpi .muted{font-size:12px}
    .e-plain{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
    .e-plain li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;padding:10px 0;border-bottom:1px solid var(--edge)}.e-plain li:last-child{border-bottom:0}
    .e-plain li>span:first-child{min-width:130px}.e-weeks li{flex-direction:column;gap:2px}
  `],
})
export class EspaceRapports {
  protected store = inject(EspaceStore);
  private api = inject(Api);
  private toast = inject(Toast);
  protected num = num; protected dayLabel = dayLabel; protected label = monthLabel;

  month = signal('');
  report = signal<MonthReport | null>(null);
  reportError = signal('');
  downloading = signal(false);
  private seq = 0;

  volumePoints = computed<ChartPoint[]>(() => (this.report()?.weeks ?? []).map(w => ({ label: w.label, value: w.volume_kg })));

  constructor() {
    void this.store.load();
    // Premier mois disponible choisi dès que les données arrivent.
    effect(() => { const months = this.store.data()?.months; if (months?.length && !this.month()) this.month.set(months[0]); });
    effect(() => { const m = this.month(); if (m) void this.loadReport(m); });
  }

  private async loadReport(m: string) {
    const mine = ++this.seq;
    this.report.set(null); this.reportError.set('');
    try { const r = await this.api.get<MonthReport>('me/report/data?month=' + encodeURIComponent(m)); if (mine === this.seq) this.report.set(r); }
    catch (e) { if (mine === this.seq) this.reportError.set(errorText(e)); }
  }

  async download() {
    const m = this.month(); if (!m || this.downloading()) return;
    this.downloading.set(true);
    try { await this.api.download('me/report?month=' + encodeURIComponent(m), `mon-rapport-${m}.pdf`); }
    catch (e) { this.toast.error('Rapport non téléchargé', errorText(e)); }
    finally { this.downloading.set(false); }
  }
}
