import { Injectable, signal } from '@angular/core';

/**
 * Niveaux de confirmation :
 * - `normal` : action courante mais qui change des données (« Marquer effectuée ») ; bouton principal.
 * - `sensitive` : action difficile à annuler ou visible par un client (suppression, annulation, envoi, déconnexion) ; bouton de danger (neutre inversé dans les thèmes sans rouge).
 * - `typed` : effacement définitif ; le coach doit saisir `expected` (le serveur re-vérifie).
 */
export type ConfirmTone = 'normal' | 'sensitive' | 'typed';

export interface ConfirmOptions {
  title: string;
  /** Conséquence en une phrase : ce qui va se passer, ce qui sera perdu. */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Texte à saisir pour valider (tone `typed`). */
  expected?: string;
}

export interface ConfirmRequest extends Required<Pick<ConfirmOptions, 'title' | 'confirmLabel' | 'cancelLabel' | 'tone'>> {
  detail?: string;
  expected?: string;
  resolve: (ok: boolean) => void;
}

/**
 * Demande de confirmation unique pour toute l'application. Usage :
 * `if (!(await this.confirm.ask({ title: 'Annuler cette séance ?', detail: '…', tone: 'sensitive' }))) return;`
 * La boîte (ConfirmHost) est montée une seule fois dans AppComponent. Une seule demande à la fois :
 * une nouvelle demande refuse la précédente. Après l'action, afficher un toast de résultat (voir Toast).
 */
@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly current = signal<ConfirmRequest | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise<boolean>(resolve => {
      const tone = options.tone ?? 'normal';
      this.current.set({
        title: options.title,
        detail: options.detail,
        expected: options.expected,
        tone,
        confirmLabel: options.confirmLabel ?? (tone === 'sensitive' || tone === 'typed' ? 'Confirmer' : 'Oui, continuer'),
        cancelLabel: options.cancelLabel ?? 'Annuler',
        resolve,
      });
    });
  }

  answer(ok: boolean) {
    const request = this.current();
    this.current.set(null);
    request?.resolve(ok);
  }
}
