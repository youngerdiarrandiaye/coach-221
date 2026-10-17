import { NgTemplateOutlet } from '@angular/common';
import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { Toast, ToastItem } from '../core/toast';

const ICONS: Record<ToastItem['kind'], string> = {
  success: 'fa-check',
  info: 'fa-circle-info',
  error: 'fa-triangle-exclamation',
};

/**
 * Affichage des toasts, monté une seule fois dans AppComponent.
 * Deux régions vivantes : « polite » pour les succès et infos, « assertive » pour les erreurs.
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="toast-stack">
      <div class="toast-region" aria-live="polite" aria-relevant="additions text">
        @for (item of calm(); track item.id) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: item }" /> }
      </div>
      <div class="toast-region" aria-live="assertive" aria-relevant="additions text">
        @for (item of errors(); track item.id) { <ng-container [ngTemplateOutlet]="card" [ngTemplateOutletContext]="{ $implicit: item }" /> }
      </div>
    </div>

    <ng-template #card let-item>
      <div class="toast" [attr.data-kind]="item.kind" [attr.role]="item.kind === 'error' ? 'alert' : 'status'"
           (pointerenter)="hover($event, item, true)" (pointerleave)="hover($event, item, false)"
           (focusin)="toast.pause(item.id)" (focusout)="toast.resume(item.id)"
           (keydown.escape)="toast.dismiss(item.id)">
        @if (item.avatar) { <span class="toast-avatar" aria-hidden="true">{{ item.avatar }}</span> }
        @else { <span class="toast-badge" aria-hidden="true"><i class="fa-solid" [class]="icon(item)"></i></span> }
        <div class="toast-body">
          <strong class="toast-title">{{ item.title }}</strong>
          @if (item.detail) { <span class="toast-detail">{{ item.detail }}</span> }
          @if (item.action; as action) {
            <button type="button" class="toast-action" (click)="act(item)">{{ action.label }}</button>
          }
        </div>
        <button type="button" class="toast-close" aria-label="Fermer la notification" (click)="toast.dismiss(item.id)">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
  styles: [`
    .toast-stack{position:fixed;right:28px;bottom:104px;z-index:1000;display:flex;flex-direction:column;gap:10px;width:min(380px,calc(100vw - 24px));pointer-events:none}
    .toast-region{display:flex;flex-direction:column;gap:10px}
    :root:root .toast{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;padding:14px 12px 14px 14px;border-radius:20px;background:var(--surface-2);border:1px solid var(--edge);color:var(--text);box-shadow:0 14px 40px #00000052,0 2px 8px #00000030;animation:toast-in .22s ease-out}
    :root:root .toast[data-kind=error]{border:2px solid var(--text);padding:13px 11px 13px 13px}
    .toast-badge{flex:none;display:grid;place-items:center;width:36px;height:36px;font-size:16px}
    .toast[data-kind=success] .toast-badge{border-radius:50%;background:var(--accent);color:var(--on-accent)}
    .toast[data-kind=info] .toast-badge{border-radius:12px;background:var(--surface-3);color:var(--text)}
    .toast[data-kind=error] .toast-badge{border-radius:6px;background:var(--text);color:var(--bg)}
    .toast-avatar{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-size:19px;font-weight:800}
    .toast-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding-top:1px}
    .toast-title{font-size:14px;font-weight:700;line-height:1.35;color:var(--text);overflow-wrap:anywhere}
    .toast-detail{font-size:13px;line-height:1.45;color:var(--soft);overflow-wrap:anywhere}
    :root:root .toast-action{align-self:flex-start;margin-top:10px;min-height:36px;padding:6px 16px;border:1px solid var(--text);border-radius:999px;background:transparent;color:var(--text);font-size:13px;font-weight:700}
    :root:root .toast-action:hover{background:var(--text);color:var(--bg);transform:none}
    :root:root .toast-close{flex:none;min-height:36px;width:36px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--soft);font-size:15px}
    :root:root .toast-close:hover{background:var(--edge);color:var(--text);transform:none}
    :root:root .toast :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    @keyframes toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    @media(max-width:600px){
      .toast-stack{right:12px;left:12px;bottom:92px;width:auto}
      :root:root .toast-close{min-height:44px;width:44px}
      :root:root .toast-action{min-height:44px;padding:8px 20px}
    }
    @media(prefers-reduced-motion:reduce){:root:root .toast{animation:none}}
  `],
})
export class ToastHost {
  protected toast = inject(Toast);
  protected calm = computed(() => this.toast.items().filter(item => item.kind !== 'error'));
  protected errors = computed(() => this.toast.items().filter(item => item.kind === 'error'));
  protected icon(item: ToastItem) { return ICONS[item.kind]; }
  /** Seule la souris suspend la fermeture : sur écran tactile, le « survol » resterait bloqué après un appui. */
  protected hover(event: PointerEvent, item: ToastItem, inside: boolean) {
    if (event.pointerType !== 'mouse') return;
    if (inside) this.toast.pause(item.id); else this.toast.resume(item.id);
  }
  protected act(item: ToastItem) { if (item.action?.run() !== false) this.toast.dismiss(item.id); }
}
