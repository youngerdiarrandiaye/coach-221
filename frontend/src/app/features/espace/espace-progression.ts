import { Component, computed, inject, signal } from '@angular/core';
import { EspaceStore, dayLabel, num } from '../../core/espace-store';
import { ChartPoint, PerfChart } from '../../shared/perf-chart';
import { progressMetrics } from '../../shared/progress-chart';

type Period = 'week' | 'month';

/** Progression : courbe du poids, mesures, volume et séances par période, records personnels. */
@Component({
  standalone: true,
  imports: [PerfChart],
  template: `
    @if (store.error()) { <div class="empty"><p class="error" role="alert">{{ store.error() }}</p><button class="secondary" type="button" (click)="store.load(true)">Réessayer</button></div> }
    @else if (!store.data()) { <p role="status" class="muted">Chargement…</p> }
    @else if (store.data(); as d) {
      <h1>Ma progression</h1>

      <section class="panel">
        <div class="e-head"><h2>Évolution du poids</h2><span class="muted">issue de vos pesées</span></div>
        @if (weightPoints().length < 2) { <p class="muted">Il faut au moins deux pesées pour tracer la courbe.</p> }
        @else { <app-perf-chart [points]="weightPoints()" mode="line" [fit]="true" unit="kg" title="Évolution de mon poids" /> }
      </section>

      <section class="panel">
        <div class="e-head"><h2>Mes mesures</h2>@if (latest(); as l) { <span class="muted">Dernière mesure : {{ dayLabel(l.mesure_date) }}</span> }</div>
        @if (!cards().length) { <p class="muted">Aucune mesure enregistrée pour le moment.</p> }
        @else {
          <div class="e-measures">@for (m of cards(); track m.key) {
            <div class="e-measure"><span class="e-m-label">{{ m.label }}</span><strong>{{ num(m.value, 2) }}<small>{{ m.unit ? ' ' + m.unit : '' }}</small></strong>
              @if (m.delta !== null) { <span class="e-m-delta">{{ m.delta > 0 ? '+' : '' }}{{ num(m.delta, 2) }} depuis la précédente</span> }
            </div>
          }</div>
        }
      </section>

      <div class="e-tabs" role="group" aria-label="Période">
        <button type="button" [attr.aria-pressed]="period() === 'week'" (click)="period.set('week')">7 jours</button>
        <button type="button" [attr.aria-pressed]="period() === 'month'" (click)="period.set('month')">30 jours</button>
      </div>
      <section class="panel">
        <div class="e-head"><h2>Volume d’entraînement</h2><span class="muted">kg soulevés (répétitions × charge)</span></div>
        <app-perf-chart [points]="volumePoints()" unit="kg" title="Volume d’entraînement par période" />
        <p class="muted e-total">{{ num(totals().volume_kg, 0) }} kg · {{ totals().series }} série(s) · {{ totals().records }} record(s)</p>
      </section>
      <section class="panel">
        <div class="e-head"><h2>Séances effectuées</h2></div>
        <app-perf-chart [points]="sessionPoints()" title="Séances effectuées par période" />
      </section>

      <section class="panel">
        <div class="e-head"><h2>Mes records</h2><span class="muted">{{ d.records.length }} exercice(s)</span></div>
        @if (!d.records.length) { <p class="muted">Vos records apparaîtront dès les premiers entraînements enregistrés.</p> }
        @else {
          <ul class="e-records">@for (r of d.records; track r.exercice_id) {
            <li><span class="e-trophy" aria-hidden="true"><i class="fa-solid fa-trophy"></i></span>
              <div><strong>{{ r.exercice }}</strong><span class="muted">{{ r.groupe_musculaire ? r.groupe_musculaire + ' · ' : '' }}{{ dayLabel(r.record_date) }}</span></div>
              <div class="e-fig"><strong>{{ num(r.best_1rm) }} kg</strong><span class="muted">1RM estimé</span><span class="muted">max {{ num(r.max_charge) }} kg × {{ r.max_reps }}</span></div></li>
          }</ul>
        }
      </section>
    }
  `,
  styles: [`
    :host{display:block}h1{margin:0 0 18px;font-size:clamp(26px,4.5vw,36px);letter-spacing:-.03em}
    .panel{padding:20px;border-radius:24px;border:1px solid var(--edge);background:var(--surface);margin-bottom:12px}
    .e-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap}.e-head h2{margin:0;font-size:18px}
    .e-measures{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
    .e-measure{display:flex;flex-direction:column;gap:4px;padding:14px;border-radius:18px;background:var(--surface-2)}
    .e-m-label{font-size:12px;color:var(--soft);font-weight:600}.e-measure strong{font-size:22px;font-weight:800}.e-measure small{font-size:.55em}.e-m-delta{font-size:12px;color:var(--soft)}
    .e-tabs{display:flex;gap:8px;margin:6px 0 12px}
    .e-tabs button{min-height:40px;padding:0 16px;border:1px solid var(--edge);border-radius:999px;background:transparent;color:var(--soft);font-weight:600;cursor:pointer}
    .e-tabs button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
    .e-total{margin:10px 0 0;font-size:13px}
    .e-records{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
    .e-records li{display:flex;align-items:center;gap:12px}.e-records li>div{display:flex;flex-direction:column;min-width:0}.e-records .e-fig{margin-left:auto;text-align:right}
    .e-records .muted{font-size:12px}
    .e-trophy{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:12px;background:var(--surface-2);color:var(--accent)}
  `],
})
export class EspaceProgression {
  protected store = inject(EspaceStore);
  protected num = num; protected dayLabel = dayLabel;
  period = signal<Period>('month');

  weightPoints = computed<ChartPoint[]>(() => (this.store.data()?.measures ?? []).filter(m => m.poids_kg != null).map(m => ({ label: dayLabel(m.mesure_date), value: Number(m.poids_kg) })));
  latest = computed(() => this.store.data()?.measures.at(-1) ?? null);

  /** Dernière valeur de chaque mesure suivie et écart avec la mesure précédente renseignée. */
  cards = computed(() => {
    const rows = this.store.data()?.measures ?? [];
    return progressMetrics.flatMap(metric => {
      const values = rows.map(r => (r as unknown as Record<string, unknown>)[metric.key]).filter(v => v != null && v !== '').map(Number).filter(Number.isFinite);
      if (!values.length) return [];
      const value = values[values.length - 1];
      return [{ key: metric.key, label: metric.label, unit: metric.unit, value, delta: values.length > 1 ? Math.round((value - values[values.length - 2]) * 100) / 100 : null }];
    });
  });

  private analytics = computed(() => this.store.data()?.analytics[this.period()] ?? null);
  totals = computed(() => this.analytics()?.totals ?? { volume_kg: 0, series: 0, seances: 0, records: 0, delta_volume_pct: null });
  volumePoints = computed<ChartPoint[]>(() => (this.analytics()?.buckets ?? []).map(b => ({ label: b.label, value: b.volume_kg })));
  sessionPoints = computed<ChartPoint[]>(() => (this.analytics()?.buckets ?? []).map(b => ({ label: b.label, value: b.seances })));
}
