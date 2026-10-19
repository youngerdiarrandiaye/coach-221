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
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { this.clearAppBadge(); void this.checkForUpdate(); }
    });
    this.watchUpdates();
  }

  /** Version de l'application chargée dans cet écran (lue au démarrage dans /version.json, écrit à chaque déploiement). */
  private running: Promise<string | null> | null = null;

  private async fetchVersion(): Promise<string | null> {
    try {
      const response = await fetch('/version.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const body = await response.json() as { version?: unknown };
      return typeof body.version === 'string' && body.version ? body.version : null;
    } catch { return null; }
  }

  /**
   * Mises à jour à chaque déploiement : on compare la version chargée à la version en ligne, au retour sur l'application,
   * toutes les 10 minutes, et dès qu'un message du service worker (webhook de déploiement) l'annonce.
   * Le coach garde la main : « Actualiser » recharge la page, rien n'est perdu (la file hors ligne est conservée).
   */
  private watchUpdates() {
    this.running = this.fetchVersion();
    setInterval(() => { void this.checkForUpdate(); }, 10 * 60_000);
    try {
      navigator.serviceWorker?.addEventListener('message', event => {
        if ((event.data as { type?: string } | null)?.type === 'update-available') void this.checkForUpdate();
      });
      navigator.serviceWorker?.getRegistration().then(reg => reg?.update()).catch(() => undefined);
    } catch { /* pas de service worker : la comparaison de version suffit */ }
  }

  async checkForUpdate() {
    try {
      const [loaded, latest] = [await this.running, await this.fetchVersion()];
      if (!loaded || !latest || loaded === 'dev' || loaded === latest) return;
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update().catch(() => undefined);
      this.toast.info('Nouvelle version de CoachSen', 'Actualisez pour profiter des dernières améliorations.', {
        key: 'app-update', persistent: true, action: { label: 'Actualiser', run: () => { location.reload(); } },
      });
    } catch { /* hors ligne : on réessaiera au prochain passage */ }
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
