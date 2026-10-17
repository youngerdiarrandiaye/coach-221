import { Component, inject } from '@angular/core';
import { THEMES, Theme } from '../core/theme';

/** Choix du thème : trois aperçus, un clic. */
@Component({
 selector: 'app-theme-picker', standalone: true,
 template: `<section class="panel" aria-labelledby="theme-title">
  <h2 id="theme-title">Apparence</h2>
  <div class="themes" role="radiogroup" aria-labelledby="theme-title">
   @for (t of themes; track t.id) {
    <button type="button" role="radio" class="theme-card secondary" [class.on]="theme.current() === t.id" [attr.aria-checked]="theme.current() === t.id" (click)="theme.set(t.id)">
     <span class="swatch" [attr.data-t]="t.id" aria-hidden="true"><i></i><i></i><i></i></span>
     <strong>{{ t.label }}</strong><small>{{ t.hint }}</small>
    </button>
   }
  </div>
 </section>`,
 styles: [`
  .themes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  :root:root:root .theme-card{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:6px;padding:14px;border-radius:22px;text-align:left;height:auto}
  .theme-card small{font-weight:500;opacity:.75;font-size:13px}
  .theme-card.on{outline:2px solid var(--accent);outline-offset:2px}
  .swatch{display:flex;gap:6px;width:100%;height:56px;padding:8px;border-radius:14px}
  .swatch i{flex:1;border-radius:8px}
  .swatch[data-t=nuit]{background:#0a0a0a}.swatch[data-t=nuit] i:nth-child(1){background:#c8f31d}.swatch[data-t=nuit] i:nth-child(2){background:#1b1b1b}.swatch[data-t=nuit] i:nth-child(3){background:#2a2a2a}
  .swatch[data-t=corail]{background:#fff4f6}.swatch[data-t=corail] i:nth-child(1){background:linear-gradient(135deg,#ff1f6b,#ff9f43)}.swatch[data-t=corail] i:nth-child(2){background:#fff}.swatch[data-t=corail] i:nth-child(3){background:#ffd9e3}
    .swatch[data-t=lagon]{background:#0c0d0e}.swatch[data-t=lagon] i:nth-child(1){background:#5fc9d2}.swatch[data-t=lagon] i:nth-child(2){background:#1e2123}.swatch[data-t=lagon] i:nth-child(3){background:#2b6870}
  @media(max-width:420px){.themes{grid-template-columns:1fr}}
 `],
})
export class ThemePicker { theme = inject(Theme); themes = THEMES; }
