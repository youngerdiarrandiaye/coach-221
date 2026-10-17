import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit, inject, input, output, viewChild } from '@angular/core';

const FOCUSABLE = 'a[href],button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

/**
 * Panneau latéral sur ordinateur, feuille basse sur mobile (le style bascule en CSS).
 * Boîte de dialogue modale : le focus reste à l'intérieur, Échap ferme, le focus revient à l'élément d'origine.
 */
@Component({
  selector: 'app-agenda-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ag-backdrop" (click)="backdrop()"></div>
    <section class="ag-panel" role="dialog" aria-modal="true" [attr.aria-label]="label()" #panel tabindex="-1">
      <div class="ag-panel-grip" aria-hidden="true"></div>
      <button type="button" class="quiet ag-panel-close" aria-label="Fermer le panneau" [disabled]="locked()" (click)="close()"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <div class="ag-panel-body"><ng-content /></div>
    </section>
  `,
})
export class AgendaPanel implements OnInit, OnDestroy {
  label = input.required<string>();
  /** Bloque la fermeture pendant un enregistrement ou quand des saisies seraient perdues par un clic à côté. */
  locked = input(false);
  /** Vrai si un clic sur le fond ne doit pas fermer (saisie en cours). */
  dirty = input(false);
  closed = output<void>();

  private panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private opener = document.activeElement as HTMLElement | null;
  private scrollLock = '';

  ngOnInit() {
    this.scrollLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Le focus va au premier champ s'il existe, sinon au panneau lui-même.
    setTimeout(() => {
      const root = this.panel().nativeElement;
      const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('.ag-panel-body ' + FOCUSABLE) ?? root;
      target.focus({ preventScroll: true });
    });
  }

  ngOnDestroy() {
    document.body.style.overflow = this.scrollLock;
    const opener = this.opener;
    if (opener && document.contains(opener)) setTimeout(() => opener.focus({ preventScroll: true }));
  }

  close() { if (!this.locked()) this.closed.emit(); }
  backdrop() { if (!this.dirty()) this.close(); }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
    if (event.key !== 'Tab') return;
    const root = this.panel().nativeElement;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) { event.preventDefault(); root.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || active === root || !root.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || !root.contains(active))) { event.preventDefault(); first.focus(); }
  }
}
