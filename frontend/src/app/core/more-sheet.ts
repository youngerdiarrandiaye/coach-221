import { Injectable, signal } from '@angular/core';

/** État de la feuille « Plus de services » : partagé entre la barre du bas et l'accueil. */
@Injectable({ providedIn: 'root' })
export class MoreSheet {
  readonly open = signal(false);
  show() { this.open.set(true); }
  hide() { this.open.set(false); }
  toggle() { this.open.update(v => !v); }
}
