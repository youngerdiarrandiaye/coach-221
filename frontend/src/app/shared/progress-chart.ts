import { Component, computed, input, signal } from '@angular/core';
import { Row, dateLabel } from '../core/api';

export const progressMetrics = [
  { key: 'poids_kg', label: 'Poids', unit: 'kg' },
  { key: 'imc', label: 'IMC', unit: '' },
  { key: 'frequence_cardiaque_repos_bpm', label: 'Fréquence cardiaque au repos', unit: 'bpm' },
  { key: 'frequence_cardiaque_effort_bpm', label: 'Fréquence cardiaque à l’effort', unit: 'bpm' },
  { key: 'tour_taille_cm', label: 'Tour de taille', unit: 'cm' },
  { key: 'hanches_cm', label: 'Hanches', unit: 'cm' },
  { key: 'bras_cm', label: 'Bras', unit: 'cm' },
  { key: 'cuisse_cm', label: 'Cuisse', unit: 'cm' },
  { key: 'masse_grasse_pct', label: 'Masse grasse', unit: '%' },
];

@Component({
  selector: 'app-progress-chart', standalone: true,
  template: `<section class="panel chart-panel" aria-labelledby="progress-heading">
    <h2 id="progress-heading">Évolution des mesures</h2>
    <label>Mesure à afficher<select [value]="selected()" (change)="selected.set($any($event.target).value)">
      @for(metric of metrics; track metric.key){<option [value]="metric.key">{{metric.label}}</option>}
    </select></label>
    @if(points().length > 1){
      <svg viewBox="0 0 640 240" role="img" [attr.aria-label]="metric().label + ' : évolution chronologique, ' + points().length + ' mesures'">
        <line x1="60" y1="20" x2="60" y2="200" stroke="currentColor" opacity=".3"/>
        <line x1="60" y1="200" x2="620" y2="200" stroke="currentColor" opacity=".3"/>
        <text x="4" y="30">{{format(bounds().max)}}</text><text x="4" y="200">{{format(bounds().min)}}</text>
        <polyline [attr.points]="line()" fill="none" stroke="currentColor" stroke-width="3"/>
        @for(point of points();track point.id){<circle [attr.cx]="x(point.time)" [attr.cy]="y(point.value)" r="4" fill="currentColor"><title>{{dateLabel(point.date)}} : {{format(point.value)}} {{metric().unit}}</title></circle>}
        <text x="60" y="228">{{dateLabel(points()[0].date)}}</text>
        <text x="620" y="228" text-anchor="end">{{dateLabel(points()[points().length-1].date)}}</text>
      </svg>
    }@else{<p role="status">{{points().length ? 'Ajoutez au moins 2 mesures pour voir l’évolution.' : 'Aucune donnée pour cette mesure.'}}</p>}
    @if(points().length){<details><summary>Valeurs de {{metric().label.toLocaleLowerCase('fr')}}</summary><ul>@for(point of points();track point.id){<li>{{dateLabel(point.date)}} : {{format(point.value)}} {{metric().unit}}</li>}</ul></details>}
  </section>`,
  styles: [`.chart-panel{margin-bottom:1.5rem;padding:1.5rem;min-width:0}.chart-panel h2{margin-top:0}.chart-panel label{display:grid;gap:.5rem;max-width:28rem}.chart-panel select{width:100%;min-width:0}svg{display:block;width:100%;max-height:320px;margin:1rem 0;color:var(--primary,#176347)}svg text{fill:currentColor;font-size:12px}summary{cursor:pointer}li{margin:.4rem 0}@media(max-width:480px){.chart-panel{padding:1rem}svg text{font-size:14px}}`]
})
export class ProgressChart {
  rows = input.required<Row[]>();
  metrics = progressMetrics;
  selected = signal('poids_kg');
  metric = computed(() => this.metrics.find(metric => metric.key === this.selected()) ?? this.metrics[0]);
  dateLabel = dateLabel;
  format(value: number){return value.toLocaleString('fr-FR',{maximumFractionDigits:2});}
  points = computed(() => this.rows().flatMap(row => {
    const raw = row[this.metric().key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    const date = String(row['mesure_date'] ?? '');
    const time = Date.parse(date);
    return Number.isFinite(value) && Number.isFinite(time) ? [{id:row.id,date,time,value}] : [];
  }).sort((a,b) => a.time-b.time));
  bounds = computed(() => {
    const values = this.points().map(point => point.value);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const padding = (max-min)*.1 || 1;
    return {min:min-padding,max:max+padding};
  });
  x(time:number){const points=this.points();const first=points[0].time;const span=points[points.length-1].time-first;return span ? 60+(time-first)/span*560 : 340;}
  y(value:number){const bounds=this.bounds();return 200-(value-bounds.min)/(bounds.max-bounds.min)*180;}
  line = computed(() => this.points().map(point=>`${this.x(point.time)},${this.y(point.value)}`).join(' '));
}


