import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, Row, dateLabel, display, errorText } from '../core/api';
import { Rum } from '../core/rum';
import { Toast } from '../core/toast';
import { ChartPoint, PerfChart } from '../shared/perf-chart';
import { progressMetrics } from '../shared/progress-chart';
import { trainingGlossary } from '../shared/help';

type Period = 'week' | 'month' | 'year';
interface Bucket { label: string; start: string; volume_kg: number; series: number; seances: number; poids_moyen_kg: number | null }
interface Analytics {
  period: Period; from: string; to: string; buckets: Bucket[];
  totals: { volume_kg: number; series: number; seances: number; records: number; delta_volume_pct: number | null };
}
interface RecordRow { exercice_id: string; exercice: string; groupe_musculaire: string | null; best_1rm: number; max_charge: number; max_reps: number; record_date: string }

const periods: { key: Period; label: string; caption: string }[] = [
  { key: 'week', label: 'Semaine', caption: '7 derniers jours' },
  { key: 'month', label: 'Mois', caption: '30 derniers jours' },
  { key: 'year', label: 'Année', caption: '12 derniers mois' },
];
const number = (v: number) => new Intl.NumberFormat('fr-SN', { maximumFractionDigits: 1 }).format(v).replace(/[  ]/g, ' ');

/** Tableau de bord performance d'un client : volume, séances, records, évolution du poids. */
@Component({
  standalone: true,
  imports: [RouterLink, PerfChart],
  template: `
    <a class="back" routerLink="/progress"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Clients</a>
    @if (error()) { <div class="empty"><p class="error" role="alert">{{ error() }}</p><button class="secondary" type="button" (click)="retry()">Réessayer</button></div> }
    @if (client(); as c) {
      <div class="page-heading">
        <div class="who">
          <span class="who-avatar" aria-hidden="true">{{ initial(c) }}</span>
          <div>
            <p class="eyebrow">PERFORMANCE</p>
            <h1>{{ c['prenom'] }} {{ c['nom'] }}</h1>
            @if (c['objectif']) { <span class="pill" data-tone="ok">{{ display(c['objectif']) }}</span> }
          </div>
        </div>

      </div>
      <div class="duo-actions">
        <a class="button primary" [routerLink]="'/workouts/new'" [queryParams]="{ clientId: id }"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i><span>Saisir un entraînement</span></a>
        <a class="button secondary" [routerLink]="'/progress/' + id + '/new'"><i class="fa-solid fa-ruler" aria-hidden="true"></i><span>Ajouter une mesure</span></a>
      </div>

      <p class="duo-links"><a [routerLink]="'/progress/' + id">Voir les mesures</a><a [routerLink]="'/progress/' + id + '/rapport'">Rapport du mois</a><a [routerLink]="'/clients/' + id">Fiche client</a></p>

      <div class="filter-tabs period-tabs" role="group" aria-label="Période d’analyse">
        @for (p of periods; track p.key) {
          <button type="button" [attr.aria-pressed]="period() === p.key" (click)="select(p.key)">{{ p.label }}</button>
        }
        <span class="muted period-caption">{{ caption() }}</span>
      </div>

      <details class="field-more understand"><summary>Comprendre ces chiffres</summary><p><strong>Volume soulevé</strong> : {{ glossary.volume }}</p><p><strong>Séances effectuées</strong> : les séances du planning que vous avez marquées comme effectuées sur la période.</p><p><strong>Records battus</strong> : les jours où le client a dépassé son meilleur 1RM estimé, sa charge maximale ou son nombre de répétitions maximal sur un exercice.</p><p><strong>1RM estimé</strong> : {{ glossary.rm }}</p></details>

      @if (loadingAnalytics()) { <p role="status">Chargement des analyses…</p> }
      @else if (analytics(); as a) {
        <div class="kpis">
          <section class="kpi featured">
            <span class="kpi-icon"><i class="fa-solid fa-weight-hanging" aria-hidden="true"></i></span>
            <p>Volume soulevé</p>
            <strong>{{ num(a.totals.volume_kg) }} kg</strong>
            @if (a.totals.delta_volume_pct !== null) {
              <span class="delta"><i class="fa-solid" [class.fa-arrow-trend-up]="a.totals.delta_volume_pct >= 0" [class.fa-arrow-trend-down]="a.totals.delta_volume_pct < 0" aria-hidden="true"></i> {{ a.totals.delta_volume_pct > 0 ? '+' : '' }}{{ num(a.totals.delta_volume_pct) }} % vs période précédente</span>
            } @else { <span class="delta">Pas de période précédente à comparer</span> }
          </section>
          <section class="kpi">
            <span class="kpi-icon"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i></span>
            <p>Séances effectuées</p>
            <strong>{{ a.totals.seances }}</strong>
            <span class="delta">{{ a.totals.series }} série(s) enregistrée(s)</span>
          </section>
          <section class="kpi">
            <span class="kpi-icon"><i class="fa-solid fa-trophy" aria-hidden="true"></i></span>
            <p>Records battus</p>
            <strong>{{ a.totals.records }}</strong>
            <span class="delta">sur la période</span>
          </section>
        </div>

        <section class="panel">
          <div class="panel-head"><h2>Volume d’entraînement</h2><span class="muted">kg soulevés (reps × charge)</span></div>
          <app-perf-chart [points]="volumePoints()" unit="kg" title="Volume d’entraînement par période" />
        </section>

        <div class="two-col">
          <section class="panel">
            <div class="panel-head"><h2>Séances effectuées</h2></div>
            <app-perf-chart [points]="sessionPoints()" title="Séances effectuées par période" />
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Poids moyen</h2><span class="muted">issu des mesures</span></div>
            <app-perf-chart [points]="weightPoints()" mode="line" unit="kg" title="Poids moyen par période" />
          </section>
        </div>
      }

      <section class="panel">
        <div class="panel-head"><h2>Mesures</h2>@if (latest(); as l) { <span class="muted">Dernière mesure : {{ date(l['mesure_date']) }}</span> }</div>
        @if (!latest()) {
          <p class="muted">Aucune mesure enregistrée. Ajoutez le poids de départ pour suivre l’évolution.</p>
        } @else {
          <div class="measure-list">
            @for (m of measureCards(); track m.key) {
              <div class="measure">
                <span class="m-label">{{ m.label }}</span>
                <strong>{{ num(m.value) }}<small>{{ m.unit ? ' ' + m.unit : '' }}</small></strong>
                @if (m.delta !== null) {
                  <span class="m-delta"><i class="fa-solid" [class.fa-arrow-trend-up]="m.delta > 0" [class.fa-arrow-trend-down]="m.delta < 0" [class.fa-minus]="m.delta === 0" aria-hidden="true"></i> {{ m.delta > 0 ? '+' : '' }}{{ num(m.delta) }}{{ m.unit ? ' ' + m.unit : '' }}</span>
                }
              </div>
            }
          </div>
        }
        <div class="actions">
          <a class="button secondary" [routerLink]="'/progress/' + id + '/new'"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter une mesure</a>
          <a class="button secondary" [routerLink]="'/progress/' + id">Historique et rapport</a>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Records personnels</h2><span class="muted">{{ records().length }} exercice(s)</span></div>
        @if (!records().length) {
          <div class="empty"><div class="empty-icon"><i class="fa-solid fa-trophy" aria-hidden="true"></i></div><h2>Aucun record pour l’instant</h2><p>Enregistrez un premier entraînement pour créer les références de {{ c['prenom'] }}.</p></div>
        } @else {
          <div class="records">
            @for (r of records(); track r.exercice_id) {
              <article class="record">
                <span class="record-icon"><i class="fa-solid fa-trophy" aria-hidden="true"></i></span>
                <div class="record-main">
                  <strong>{{ r.exercice }}</strong>
                  @if (r.groupe_musculaire) { <span class="muted">{{ r.groupe_musculaire }}</span> }
                  <span class="muted">{{ date(r.record_date) }}</span>
                </div>
                <div class="record-figures">
                  <span class="big">{{ num(r.best_1rm) }}<small> kg</small></span>
                  <span class="muted">1RM estimé</span>
                  <ul class="chips"><li><span>Charge max</span>{{ num(r.max_charge) }} kg</li><li><span>Reps max</span>{{ r.max_reps }}</li></ul>
                </div>
              </article>
            }
          </div>
        }
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Progression par exercice</h2><span class="muted">1RM estimé, 120 derniers jours</span></div>
        @if (!exoList().length) {
          <p class="muted">Pas encore assez de séries pour tracer une courbe.</p>
        } @else {
          <div class="filter-tabs" role="group" aria-label="Exercice suivi">
            @for (e of exoList(); track e.id) { <button type="button" [attr.aria-pressed]="e.id === currentExo()" (click)="selectedExo.set(e.id)">{{ e.nom }}</button> }
          </div>
          @if (curveStats(); as cs) {
            <div class="curve-stats"><div><span class="muted">1RM actuel</span><strong>{{ num(cs.current) }} kg</strong></div><div><span class="muted">Meilleur 1RM</span><strong>{{ num(cs.best) }} kg</strong></div><div><span class="muted">Depuis le début</span><strong>{{ cs.gain > 0 ? '+' : '' }}{{ num(cs.gain) }} kg</strong></div></div>
          }
          <app-perf-chart [points]="curvePoints()" mode="line" unit="kg" title="Évolution du 1RM estimé" />
        }
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Dernières séances</h2><a [routerLink]="'/workouts/new'" [queryParams]="{ clientId: id }">Ajouter</a></div>
        @if (!recent().length) {
          <p class="muted">Aucune série enregistrée sur les 120 derniers jours.</p>
        } @else {
          <div class="card-list">
            @for (g of recent(); track g.key) {
              <article class="item-card">
                <span class="item-avatar" aria-hidden="true"><i class="fa-solid fa-dumbbell"></i></span>
                <div class="item-main">
                  <strong class="item-title">{{ g.exercice }}</strong>
                  <span class="item-sub">{{ date(g.date) }}</span>
                  <ul class="chips">@for (s of g.sets.slice(0, 6); track $index) { <li>{{ s.reps }} × {{ num(s.charge) }} kg</li> }@if (g.sets.length > 6) { <li>+ {{ g.sets.length - 6 }} séries</li> }</ul>
                </div>
                <div class="item-side"><span class="pill" data-tone="ok">{{ num(g.volume) }} kg</span></div>
              </article>
            }
          </div>
        }
      </section>
    }
  `,
  styles: [`
    :host{display:block}
    .who{display:flex;align-items:center;gap:18px}
    .who-avatar{display:grid;place-items:center;width:72px;height:72px;border-radius:24px;background:var(--accent);color:var(--on-accent);font-size:30px;font-weight:800;flex:none}
    .period-tabs{align-items:center}
    .period-caption{margin-left:8px;font-size:13px}
    .kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:22px}
    .kpi{padding:22px;border-radius:26px;border:1px solid var(--edge);background:var(--surface);min-width:0}
    .kpi p{margin:14px 0 6px;font-size:13px;color:var(--soft);font-weight:600}
    .kpi strong{display:block;font-size:clamp(26px,3vw,38px);font-weight:800;letter-spacing:-.02em;line-height:1.1}
    .kpi .delta{display:block;margin-top:10px;font-size:12px;color:var(--soft)}
    .kpi-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;background:var(--surface-2);color:var(--accent);font-size:17px}
    .kpi.featured{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
    .kpi.featured p,.kpi.featured .delta{color:var(--on-accent)}
    .kpi.featured .kpi-icon{background:var(--on-accent)}
    .panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
    .panel-head h2{margin:0;font-size:18px}
    .measure-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
    .measure{display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:20px;border:1px solid var(--edge);background:var(--surface-2);min-width:0}
    .m-label{font-size:13px;color:var(--soft);font-weight:600}
    .measure strong{font-size:24px;font-weight:800;letter-spacing:-.02em}
    .measure strong small{font-size:13px;color:var(--soft);font-weight:600}
    .m-delta{font-size:12px;font-weight:700;color:var(--accent)}
    .curve-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
    .curve-stats>div{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:18px;border:1px solid var(--edge);background:var(--surface-2)}
    .curve-stats strong{font-size:20px;font-weight:800}
    .two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
    .records{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .record{display:flex;gap:14px;align-items:center;padding:18px;border-radius:22px;border:1px solid var(--edge);background:var(--surface-2)}
    .record-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:15px;background:var(--accent);color:var(--on-accent);font-size:20px;flex:none}
    .record-main{display:flex;flex-direction:column;min-width:0;flex:1}
    .record-main strong{font-size:16px}
    .record-figures{text-align:right}
    .record-figures .big{display:block;font-size:28px;font-weight:800;line-height:1;color:var(--accent)}
    .record-figures .big small{font-size:14px;color:var(--text);font-weight:700}
    .record-figures .chips{justify-content:flex-end}
    @media(max-width:1000px){.kpis{grid-template-columns:1fr}.two-col,.records{grid-template-columns:1fr}}
    @media(max-width:600px){.curve-stats strong{font-size:16px}.record{flex-wrap:wrap}.record-figures{text-align:left;width:100%}.record-figures .chips{justify-content:flex-start}}
  `],
})
export class PerformancePage {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private rum = inject(Rum);

  readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly periods = periods;
  glossary = trainingGlossary;
  display = display;
  num = number;

  client = signal<Row | null>(null);
  analytics = signal<Analytics | null>(null);
  records = signal<RecordRow[]>([]);
  workouts = signal<Row[]>([]);
  measures = signal<Row[]>([]);
  period = signal<Period>('month');
  loadingAnalytics = signal(true);
  error = signal('');
  private toast = inject(Toast);

  private sortedMeasures = computed(() => [...this.measures()].sort((a, b) => String(b['mesure_date']).localeCompare(String(a['mesure_date']))));
  latest = computed(() => this.sortedMeasures()[0] ?? null);
  measureCards = computed(() => {
    const [last, before] = this.sortedMeasures();
    if (!last) return [];
    return progressMetrics
      .filter(m => last[m.key] != null)
      .map(m => {
        const value = Number(last[m.key]);
        const prev = before && before[m.key] != null ? Number(before[m.key]) : null;
        return { key: m.key, label: m.label, unit: m.unit, value, delta: prev === null ? null : Math.round((value - prev) * 10) / 10 };
      });
  });
  caption = computed(() => periods.find(p => p.key === this.period())?.caption ?? '');
  volumePoints = computed<ChartPoint[]>(() => (this.analytics()?.buckets ?? []).map(b => ({ label: b.label, value: b.volume_kg })));
  sessionPoints = computed<ChartPoint[]>(() => (this.analytics()?.buckets ?? []).map(b => ({ label: b.label, value: b.seances })));
  weightPoints = computed<ChartPoint[]>(() => (this.analytics()?.buckets ?? []).map(b => ({ label: b.label, value: b.poids_moyen_kg })));

  selectedExo = signal<string | null>(null);
  exoList = computed(() => {
    const m = new Map<string, { id: string; nom: string; n: number }>();
    for (const l of this.workouts()) {
      const id = String(l['exercice_id'] ?? ''); if (!id) continue;
      const e = m.get(id) ?? { id, nom: String((l['exercice'] as Row | undefined)?.['nom'] ?? '—'), n: 0 };
      e.n++; m.set(id, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  });
  currentExo = computed(() => this.selectedExo() ?? this.exoList()[0]?.id ?? null);
  /** Meilleur 1RM estimé (formule d'Epley, comme le serveur) par jour pour l'exercice choisi. */
  private curve = computed(() => {
    const id = this.currentExo(); const days = new Map<string, number>();
    for (const l of this.workouts()) {
      if (String(l['exercice_id']) !== id) continue;
      const v = Number(l['charge_kg']) * (1 + Number(l['reps']) / 30);
      if (!Number.isFinite(v)) continue;
      const d = String(l['log_date']); days.set(d, Math.max(days.get(d) ?? 0, v));
    }
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ d, v: Math.round(v * 10) / 10 }));
  });
  curvePoints = computed<ChartPoint[]>(() => this.curve().slice(-10).map(p => ({ label: p.d.slice(8, 10) + '/' + p.d.slice(5, 7), value: p.v })));
  curveStats = computed(() => { const c = this.curve(); if (!c.length) return null; return { current: c[c.length - 1].v, best: Math.max(...c.map(p => p.v)), gain: Math.round((c[c.length - 1].v - c[0].v) * 10) / 10 }; });

  recent = computed(() => {
    const groups = new Map<string, { key: string; date: string; exercice: string; sets: { reps: number; charge: number }[]; volume: number }>();
    for (const log of this.workouts()) {
      const exo = (log['exercice'] as Row | undefined)?.['nom'] ?? '—';
      const key = `${log['log_date']}|${log['exercice_id']}`;
      const group = groups.get(key) ?? { key, date: String(log['log_date']), exercice: String(exo), sets: [], volume: 0 };
      const reps = Number(log['reps']);
      const charge = Number(log['charge_kg']);
      group.sets.push({ reps, charge });
      group.volume += reps * charge;
      groups.set(key, group);
    }
    return [...groups.values()].slice(0, 8);
  });

  constructor() {
    void this.loadAll();
  }

  initial(c: Row) { return String(c['prenom'] ?? '?').charAt(0).toUpperCase(); }
  date(value: unknown) { return dateLabel(value); }

  select(period: Period) {
    if (period === this.period()) return;
    this.period.set(period);
    void this.loadAnalytics(false);
  }

  private async loadAll() {
    try {
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
      const [client, records, workouts, measures] = await Promise.all([
        this.api.get<Row>('clients/' + this.id),
        this.api.get<RecordRow[]>('records?clientId=' + this.id),
        this.api.get<Row[]>(`workouts?clientId=${this.id}&from=${since}`),
        this.api.get<Row[]>('progress?clientId=' + this.id),
      ]);
      this.measures.set(measures);
      this.client.set(client);
      this.records.set(records);
      this.workouts.set(workouts);
      await this.loadAnalytics(true);
      this.rum.completeTask('voir_performance');
    } catch (e) {
      this.error.set(errorText(e));
      this.loadingAnalytics.set(false);
    }
  }

  retry() {
    this.error.set('');
    void this.loadAll();
  }

  /** Au premier chargement l'échec s'affiche dans la page ; lors d'un changement de période, c'est un toast. */
  private async loadAnalytics(initial: boolean) {
    this.loadingAnalytics.set(true);
    try {
      this.analytics.set(await this.api.get<Analytics>(`analytics?clientId=${this.id}&period=${this.period()}`));
    } catch (e) {
      if (initial) this.error.set(errorText(e));
      else this.toast.fail('Analyse non actualisée', e, () => void this.loadAnalytics(false));
    } finally {
      this.loadingAnalytics.set(false);
    }
  }
}
