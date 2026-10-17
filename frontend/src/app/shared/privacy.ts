import { Component, inject, input } from '@angular/core';
import { MASK, Privacy } from '../core/privacy';

/** Montant déjà mis en forme, remplacé par des points quand les montants sont masqués. Le libellé accessible reste « Montant masqué ». */
@Component({
  selector: 'app-amount',
  standalone: true,
  template: `@if (privacy.hidden()) { <span role="img" aria-label="Montant masqué">{{ mask }}</span> } @else { {{ text() }} }`,
})
export class AmountComponent {
  privacy = inject(Privacy);
  text = input.required<string>();
  mask = MASK;
}

/** Œil qui masque ou affiche tous les montants. */
@Component({
  selector: 'app-privacy-toggle',
  standalone: true,
  template: `<button type="button" class="eye-btn" [attr.aria-pressed]="privacy.hidden()" aria-label="Masquer les montants" [title]="privacy.hidden() ? 'Afficher les montants' : 'Masquer les montants'" (click)="privacy.toggle()"><i class="fa-solid" [class.fa-eye-slash]="privacy.hidden()" [class.fa-eye]="!privacy.hidden()" aria-hidden="true"></i></button>`,
})
export class PrivacyToggle {
  privacy = inject(Privacy);
}
