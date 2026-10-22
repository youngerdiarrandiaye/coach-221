import { Injectable, signal } from '@angular/core';
import { describeError, waitLabel } from './api';

export type ToastKind = 'success' | 'info' | 'error';

export interface ToastAction {
  label: string;
  /** Renvoie `false` pour garder le toast affiché (action refusée pour l'instant). */
  run: () => void | boolean;
}

export interface ToastOptions {
  /** Bouton d'action affiché dans le toast (par exemple « Réessayer »). */
  action?: ToastAction;
  /** Le toast reste affiché jusqu'à sa fermeture explicite (ex. état hors ligne). */
  persistent?: boolean;
  /** Durée d'affichage en millisecondes, à la place de la durée par défaut du type de toast. */
  duration?: number;
  /** Identifiant logique : un nouveau toast avec la même clé remplace l'ancien. */
  key?: string;
  /** Initiale affichée dans un avatar rond à la place de l'icône (rappels façon message). */
  avatar?: string;
}

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: ToastAction;
  persistent: boolean;
  duration?: number;
  key?: string;
  avatar?: string;
}

interface Timer {
  handle: ReturnType<typeof setTimeout> | undefined;
  startedAt: number;
  remaining: number;
}

const MAX_VISIBLE = 3;
const DUPLICATE_WINDOW_MS = 2000;
const DURATION_MS: Record<ToastKind, number> = { success: 4000, info: 4000, error: 8000 };

/**
 * Retours d'action pour le coach. Les toasts informent du résultat d'une action,
 * ils ne déclenchent ni ne décident rien. Le service vit à la racine : un toast
 * survit donc aux changements de page.
 */
@Injectable({ providedIn: 'root' })
export class Toast {
  /** Toasts actuellement affichés (3 au maximum). */
  readonly items = signal<ToastItem[]>([]);

  private waiting: ToastItem[] = [];
  private timers = new Map<number, Timer>();
  private recent = new Map<string, number>();
  private nextId = 1;
  private watching = false;

  success(title: string, detail?: string, options?: ToastOptions) { this.push('success', title, detail, options); }
  info(title: string, detail?: string, options?: ToastOptions) { this.push('info', title, detail, options); }
  error(title: string, detail?: string, options?: ToastOptions) { this.push('error', title, detail, options); }

  /**
   * Erreur d'une action : le titre dit ce qui a échoué, le détail dit pourquoi et comment corriger.
   * Si `retry` est fourni et que l'erreur est temporaire, un bouton « Réessayer » est proposé.
   */
  fail(title: string, error: unknown, retry?: () => void) {
    const info = describeError(error);
    // Erreur 429 : « Réessayer » ne rejoue pas la mutation avant la fin du délai imposé par le serveur.
    const until = info.retryAfter ? Date.now() + info.retryAfter * 1000 : 0;
    const guarded = retry && until ? () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left > 0) { this.info('Patientez encore ' + waitLabel(left), 'Vous pourrez réessayer ensuite.', { key: 'rate-limit-wait' }); return false; }
      retry();
      return true;
    } : retry;
    const action = guarded && info.retryable ? { label: 'Réessayer', run: guarded } : undefined;
    this.push('error', title, `${info.message} ${info.hint}`.trim(), { action });
  }

  dismiss(id: number) {
    this.stop(id);
    const wasVisible = this.items().some(item => item.id === id);
    this.waiting = this.waiting.filter(item => item.id !== id);
    if (!wasVisible) return;
    this.items.update(list => list.filter(item => item.id !== id));
    this.promote();
  }

  dismissKey(key: string) {
    const target = [...this.items(), ...this.waiting].find(item => item.key === key);
    if (target) this.dismiss(target.id);
  }

  /** Suspend la fermeture automatique (survol, focus clavier). */
  pause(id: number) {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === undefined) return;
    clearTimeout(timer.handle);
    timer.handle = undefined;
    timer.remaining = Math.max(1500, timer.remaining - (Date.now() - timer.startedAt));
  }

  /** Reprend la fermeture automatique avec le temps restant. */
  resume(id: number) {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== undefined) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  /** Informe le coach quand le navigateur perd ou retrouve le réseau. */
  watchNetwork() {
    if (this.watching || typeof window === 'undefined') return;
    this.watching = true;
    window.addEventListener('offline', () => {
      this.info('Hors ligne', 'Les saisies d’entraînement sont gardées sur cet appareil jusqu’au retour de la connexion.', { duration: 8000, key: 'network' });
    });
    window.addEventListener('online', () => {
      this.dismissKey('network');
      this.success('Connexion rétablie', 'Vous pouvez continuer.');
    });
    if (navigator.onLine === false) this.info('Hors ligne', 'Les saisies d’entraînement sont gardées sur cet appareil jusqu’au retour de la connexion.', { duration: 8000, key: 'network' });
  }

  private push(kind: ToastKind, title: string, detail?: string, options: ToastOptions = {}) {
    const now = Date.now();
    const signature = `${kind}|${title}|${detail ?? ''}`;
    for (const [known, at] of this.recent) if (now - at > DUPLICATE_WINDOW_MS) this.recent.delete(known);
    if (this.recent.has(signature)) return;
    this.recent.set(signature, now);

    if (options.key) this.dismissKey(options.key);

    const same = this.items().find(item => item.kind === kind && item.title === title && item.detail === detail);
    if (same) {
      // Même message encore affiché : on prolonge sa durée au lieu d'empiler un doublon.
      this.stop(same.id);
      this.start(same);
      return;
    }

    const item: ToastItem = { id: this.nextId++, kind, title, detail, action: options.action, persistent: !!options.persistent, duration: options.duration, key: options.key, avatar: options.avatar };
    if (this.items().length < MAX_VISIBLE) this.show(item);
    else this.waiting.push(item);
  }

  private show(item: ToastItem) {
    this.items.update(list => [...list, item]);
    this.start(item);
  }

  private start(item: ToastItem) {
    if (item.persistent) return;
    const remaining = item.duration ?? DURATION_MS[item.kind];
    this.timers.set(item.id, { handle: setTimeout(() => this.dismiss(item.id), remaining), startedAt: Date.now(), remaining });
  }

  private stop(id: number) {
    const timer = this.timers.get(id);
    if (timer?.handle !== undefined) clearTimeout(timer.handle);
    this.timers.delete(id);
  }

  private promote() {
    while (this.items().length < MAX_VISIBLE && this.waiting.length) this.show(this.waiting.shift()!);
  }
}
