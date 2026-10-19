import { Injectable, inject, signal } from '@angular/core';
import { Toast } from './toast';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Installation de l'application sur l'écran d'accueil, proposée seulement quand le navigateur l'autorise. */
@Injectable({ providedIn: 'root' })
export class Pwa {
  private toast = inject(Toast);
  private deferred: InstallPromptEvent | null = null;
  canInstall = signal(false);

  constructor() {
    addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.deferred = event as InstallPromptEvent;
      this.canInstall.set(true);
    });
    addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canInstall.set(false);
      this.toast.success('Application installée', 'Retrouvez CoachSen sur votre écran d’accueil.');
    });
    this.clearAppBadge();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.clearAppBadge(); });
  }

  /** Efface la pastille de l'icône et les notifications déjà vues quand le coach ouvre l'application. */
  private clearAppBadge() {
    try {
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      void nav.clearAppBadge?.().catch(() => undefined);
      void navigator.serviceWorker?.getRegistration().then(reg => reg?.getNotifications().then(list => list.forEach(n => n.close())));
    } catch { /* navigateur sans badge : rien à faire */ }
  }

  async install() {
    if (!this.deferred) return;
    await this.deferred.prompt();
    await this.deferred.userChoice;
    this.deferred = null;
    this.canInstall.set(false);
  }
}
