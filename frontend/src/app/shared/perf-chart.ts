import { Component, computed, input } from '@angular/core';

export interface ChartPoint { label: string; value: number | null }

/** Graphique SVG simple et lisible : barres (volume, séances) ou courbe (poids). */
@Component({
  selector: 'app-perf-chart',
  standalone: true,
  template: `
    @if (!hasData()) {
      <p class="chart-empty">Pas encore de données sur cette période.</p>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" role="img" [attr.aria-label]="title()" class="perf-svg">
        @for (g of grid(); track g.y) {
          <line [attr.x1]="left" [attr.x2]="width - 8" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" />
          <text [attr.x]="left - 8" [attr.y]="g.y + 4" text-anchor="end" class="axis">{{ g.text }}</text>
        }
        @if (mode() === 'bar') {
          @for (bar of bars(); track bar.label) {
            <g>
              <rect [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.w" [attr.height]="bar.h" rx="6" [class.peak]="bar.peak" class="bar"><title>{{ bar.label }} : {{ bar.text }}</title></rect>
              <text [attr.x]="bar.x + bar.w / 2" [attr.y]="height - 8" text-anchor="middle" class="axis">{{ bar.label }}</text>
            </g>
          }
        } @else {
          <polyline [attr.points]="line()" class="line" fill="none" />
          @for (dot of dots(); track dot.label) {
            <circle [attr.cx]="dot.x" [attr.cy]="dot.y" r="5" class="dot"><title>{{ dot.label }} : {{ dot.text }}</title></circle>
            <text [attr.x]="dot.x" [attr.y]="height - 8" text-anchor="middle" class="axis">{{ dot.label }}</text>
          }
        }
      </svg>
    }
  `,
  styles: [`
    :host{display:block}
    .perf-svg{width:100%;height:auto;display:block;overflow:visible}
    .grid{stroke:var(--edge);stroke-width:1}
    .axis{fill:var(--soft);font-size:11px;font-family:inherit}
    .bar{fill:var(--accent);opacity:.45;transition:opacity .15s}
    .bar.peak,.bar:hover{opacity:1}
    .line{stroke:var(--accent);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
    .dot{fill:var(--surface);stroke:var(--accent);stroke-width:3}
    .chart-empty{margin:24px 0;color:var(--soft);text-align:center}
  `],
})
export class PerfChart {
  points = input.required<ChartPoint[]>();
  mode = input<'bar' | 'line'>('bar');
  unit = input('');
  title = input('Graphique');
  /** Courbe : l'axe s'ajuste aux valeurs (utile pour un poids qui varie de quelques kg) au lieu de partir de zéro. */
  fit = input(false);

  readonly width = 640;
  readonly height = 240;
  readonly left = 48;
  private readonly top = 12;
  private readonly bottom = 30;

  private values = computed(() => this.points().map(p => p.value ?? 0));
  hasData = computed(() => this.points().some(p => (p.value ?? 0) > 0));
  private max = computed(() => {
    const m = Math.max(...this.values(), 1);
    const step = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / step) * step;
  });
  private plotHeight = () => this.height - this.top - this.bottom;
  private fitted = computed(() => {
    const v = this.points().filter(p => (p.value ?? 0) > 0).map(p => p.value as number);
    if (!this.fit() || this.mode() !== 'line' || !v.length) return null;
    const lo = Math.min(...v), hi = Math.max(...v), pad = Math.max((hi - lo) * 0.3, 0.5);
    return { lo: lo - pad, hi: hi + pad };
  });
  private yOf = (value: number) => {
    const f = this.fitted();
    return this.top + this.plotHeight() * (1 - (f ? (value - f.lo) / (f.hi - f.lo) : value / this.max()));
  };
  private format(value: number) {
    return new Intl.NumberFormat('fr-SN', { maximumFractionDigits: 1 }).format(value).replace(/[  ]/g, ' ') + (this.unit() ? ' ' + this.unit() : '');
  }

  grid = computed(() => {
    const f = this.fitted();
    const at = (t: number) => f ? f.lo + (f.hi - f.lo) * t : this.max() * t;
    const nf = new Intl.NumberFormat('fr-SN', f ? { maximumFractionDigits: 1 } : { notation: 'compact' });
    return [0, 0.5, 1].map(t => ({ y: this.yOf(at(t)), text: nf.format(at(t)) }));
  });

  bars = computed(() => {
    const pts = this.points();
    const slot = (this.width - this.left - 8) / Math.max(pts.length, 1);
    const w = Math.min(slot * 0.62, 44);
    const peak = Math.max(...this.values());
    return pts.map((p, i) => {
      const v = p.value ?? 0;
      const y = this.yOf(v);
      return { label: p.label, x: this.left + slot * i + (slot - w) / 2, y, w, h: Math.max(this.top + this.plotHeight() - y, v > 0 ? 3 : 0), peak: v === peak && v > 0, text: this.format(v) };
    });
  });

  private placed = computed(() => {
    const pts = this.points();
    const slot = (this.width - this.left - 8) / Math.max(pts.length, 1);
    return pts.map((p, i) => ({ label: p.label, value: p.value, x: this.left + slot * i + slot / 2 })).filter(p => p.value != null && p.value > 0);
  });
  dots = computed(() => this.placed().map(p => ({ label: p.label, x: p.x, y: this.yOf(p.value as number), text: this.format(p.value as number) })));
  line = computed(() => this.dots().map(d => `${d.x},${d.y}`).join(' '));
}
