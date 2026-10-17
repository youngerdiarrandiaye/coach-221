import { Injectable, signal } from '@angular/core';

const KEY = 'coachsen.privacy.amounts';
/** Texte affiché à la place d'un montant masqué. */
export const MASK = '•••••';

/** Masque ou affiche les montants de l'application. Masqué par défaut ; le choix est mémorisé dans le navigateur. */
@Injectable({ providedIn: 'root' })
export class Privacy {
  readonly hidden = signal(read());

  toggle() {
    const next = !this.hidden();
    this.hidden.set(next);
    try { localStorage.setItem(KEY, next ? 'hidden' : 'shown'); } catch { /* sans stockage, le choix vaut pour la visite en cours */ }
  }
}

function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'shown'; } catch { return true; }
}
