import { Directive, ElementRef, OnDestroy, OnInit, inject, output } from '@angular/core';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Boîte de dialogue accessible : le focus entre dans la boîte (sur l'élément `data-autofocus`, sinon le premier
 * élément actif), reste piégé pendant que la boîte est ouverte, Échap la ferme et le focus revient à l'élément d'origine.
 */
@Directive({ selector: '[appFocusTrap]', standalone: true, host: { '(keydown)': 'onKey($event)' } })
export class FocusTrap implements OnInit, OnDestroy {
  /** Émis quand le coach appuie sur Échap. */
  readonly escape = output<void>();
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private origin = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

  ngOnInit() {
    const root = this.host.nativeElement;
    if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
    queueMicrotask(() => (root.querySelector<HTMLElement>('[data-autofocus]') ?? this.items()[0] ?? root).focus());
  }

  ngOnDestroy() { try { this.origin?.focus(); } catch { /* l'élément d'origine a disparu */ } }

  private items(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
  }

  protected onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); this.escape.emit(); return; }
    if (event.key !== 'Tab') return;
    const list = this.items();
    if (!list.length) { event.preventDefault(); this.host.nativeElement.focus(); return; }
    const first = list[0], last = list[list.length - 1], active = document.activeElement;
    if (event.shiftKey && (active === first || active === this.host.nativeElement)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    else if (!this.host.nativeElement.contains(active)) { event.preventDefault(); first.focus(); }
  }
}
