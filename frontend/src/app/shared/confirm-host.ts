import { Component, computed, inject, signal } from '@angular/core';
import { Confirm } from '../core/confirm';
import { FocusTrap } from './focus-trap';

/** Boîte de confirmation commune (voir Confirm). Montée une seule fois dans AppComponent. */
@Component({
  selector: 'app-confirm-host',
  standalone: true,
  imports: [FocusTrap],
  template: `
    @if (confirm.current(); as req) {
      <div class="modal-backdrop" (click)="cancel()">
        <section class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
                 [attr.aria-describedby]="req.detail ? 'confirm-desc' : null" [attr.data-tone]="req.tone" data-testid="confirm-dialog"
                 appFocusTrap (escape)="cancel()" (click)="$event.stopPropagation()">
          <h2 id="confirm-title">{{ req.title }}</h2>
          @if (req.detail) { <p id="confirm-desc">{{ req.detail }}</p> }
          @if (req.tone === 'typed' && req.expected) {
            <label for="confirm-typed">Saisissez « {{ req.expected }} » pour confirmer</label>
            <input id="confirm-typed" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" data-autofocus
                   [value]="typed()" (input)="typed.set($any($event.target).value)">
          }
          <div class="actions">
            <button type="button" class="secondary" [attr.data-autofocus]="req.tone === 'typed' ? null : ''" (click)="cancel()">{{ req.cancelLabel }}</button>
            <button type="button" [class]="req.tone === 'normal' ? 'primary' : 'danger-button'" [disabled]="!ready()" (click)="ok()">{{ req.confirmLabel }}</button>
          </div>
        </section>
      </div>
    }
  `,
})
export class ConfirmHost {
  confirm = inject(Confirm);
  typed = signal('');
  ready = computed(() => {
    const req = this.confirm.current();
    return !!req && (req.tone !== 'typed' || !req.expected || this.typed().trim().toLowerCase() === req.expected.trim().toLowerCase());
  });
  ok() { if (!this.ready()) return; this.typed.set(''); this.confirm.answer(true); }
  cancel() { this.typed.set(''); this.confirm.answer(false); }
}
