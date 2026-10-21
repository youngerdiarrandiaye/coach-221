import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, Auth, Row, display } from './api';
import { coachLabel } from './coach-name';
import { Toast } from './toast';

export interface ReminderSettings {
  enabled: boolean;
  /** Délais d'alerte avant la séance, en minutes, triés du plus court au plus long. */
  offsets: number[];
  /** Envoyer aussi une notification du système (en plus du message dans l'application). */
  system: boolean;
}

const SETTINGS_KEY = 'coachsen.reminders';
const FIRED_KEY = 'coachsen.reminders.fired';
const PUSH_ASK_KEY = 'coachsen.push.ask';
const PUSH_ASK_EVERY_MS = 7 * 86_400_000;
const DEFAULTS: ReminderSettings = { enabled: true, offsets: [30], system: true };
const MAX_OFFSET = 24 * 60;

export const formatOffset = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
};

const toKey = (base64Url: string) => {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

const read = <T>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible : les réglages restent valables jusqu'au rechargement */ } };

/**
 * Rappels de séance définis par le coach (ex. 10, 20, 30 min ou 1 h avant).
 * Les alertes partent tant que l'application est ouverte (au premier plan ou en arrière-plan).
 * Application fermée : les navigateurs ne permettent pas de minuterie fiable sans notification push serveur.
 */
@Injectable({ providedIn: 'root' })
export class Reminders {
  private api = inject(Api);
  private auth = inject(Auth);
  private coach = () => coachLabel(this.auth.profile()?.['prenom'], this.auth.profile()?.['nom']);
  private toast = inject(Toast);
  private router = inject(Router);

  settings = signal<ReminderSettings>(this.load());
  permission = signal<NotificationPermission | 'unsupported'>('Notification' in globalThis ? Notification.permission : 'unsupported');

  /** Notifications push serveur : arrivent même quand l'application est fermée. */
  readonly pushSupported = 'serviceWorker' in navigator && 'PushManager' in globalThis;
  pushActive = signal(false);
  pushBusy = signal(false);

  private sessions: Row[] = [];
  private fired: Record<string, number> = read(FIRED_KEY, {});
  private started = false;

  private load(): ReminderSettings {
    const saved = read<Partial<ReminderSettings>>(SETTINGS_KEY, {});
    const offsets = Array.isArray(saved.offsets) ? saved.offsets.filter(n => Number.isInteger(n) && n >= 1 && n <= MAX_OFFSET) : DEFAULTS.offsets;
    return { enabled: saved.enabled ?? DEFAULTS.enabled, offsets: [...new Set(offsets)].sort((a, b) => a - b), system: saved.system ?? DEFAULTS.system };
  }

  private save(next: ReminderSettings) {
    this.settings.set(next);
    write(SETTINGS_KEY, next);
    this.pushSettingsToServer(next);
  }

  /** Le serveur envoie les notifications push : il doit connaître les délais choisis par le coach. */
  private pushSettingsToServer(next: ReminderSettings) {
    void this.api.write('PUT', 'reminders/settings', { enabled: next.enabled, offsets: next.offsets, system: next.system }).catch(() => undefined);
  }

  /** Les réglages du serveur font foi ; à la première utilisation, on y envoie ceux de cet appareil. */
  private async syncFromServer() {
    try {
      const remote = await this.api.get<{ enabled: boolean; offsets: number[]; system: boolean; updated_at: string | null }>('reminders/settings');
      if (remote.updated_at) {
        const next = { enabled: remote.enabled, offsets: [...remote.offsets].sort((a, b) => a - b), system: remote.system };
        this.settings.set(next);
        write(SETTINGS_KEY, next);
      } else {
        this.pushSettingsToServer(this.settings());
      }
    } catch { /* hors ligne ou serveur indisponible : les réglages de l'appareil restent utilisés */ }
  }

  start() {
    if (this.started) return;
    this.started = true;
    void this.syncFromServer().then(() => this.refresh());
    void this.refreshPushState();
    // Alertes hors application : mises en route d'elles-mêmes (un appui suffit), un peu après l'ouverture pour ne pas gêner l'écran.
    setTimeout(() => void this.setupPush(), 4000);
    setInterval(() => this.tick(), 20_000);
    setInterval(() => void this.refresh(), 120_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { void this.refresh(); this.tick(); }
    });
  }

  setEnabled(enabled: boolean) { this.save({ ...this.settings(), enabled }); }
  setSystem(system: boolean) { this.save({ ...this.settings(), system }); }

  addOffset(minutes: number): boolean {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_OFFSET) return false;
    const current = this.settings();
    if (current.offsets.includes(minutes)) return true;
    this.save({ ...current, offsets: [...current.offsets, minutes].sort((a, b) => a - b) });
    return true;
  }

  removeOffset(minutes: number) {
    const current = this.settings();
    this.save({ ...current, offsets: current.offsets.filter(n => n !== minutes) });
  }

  /**
   * Alertes de séance même application fermée, avec le nombre de messages sur l'icône (pastille).
   * - déjà autorisé : l'appareil est (ré)abonné sans rien demander ;
   * - pas encore demandé : un message propose « Activer » (un appui), puis ne revient pas avant 7 jours ;
   * - iPhone sans l'application installée : on propose de l'installer (sans cela le téléphone ne reçoit pas les alertes) ;
   * - refusé par le coach : on ne redemande jamais (réglage du téléphone).
   */
  private async setupPush() {
    if (!this.settings().enabled || !this.settings().system) return;
    const recentlyAsked = () => Date.now() - read<number>(PUSH_ASK_KEY, 0) < PUSH_ASK_EVERY_MS;
    if (!this.pushSupported) {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
      if (ios && !installed && !recentlyAsked()) {
        write(PUSH_ASK_KEY, Date.now());
        this.toast.info('Alertes de séance', 'Sur iPhone, ajoutez CoachSen à l’écran d’accueil pour les recevoir, avec le nombre sur l’icône.', { persistent: true, key: 'push-ask', action: { label: 'Voir comment', run: () => void this.router.navigateByUrl('/installer') } });
      }
      return;
    }
    await this.refreshPushState();
    const permission = this.permission();
    if (permission === 'granted') { await this.enablePush(); return; }
    if (permission !== 'default' || recentlyAsked()) return;
    write(PUSH_ASK_KEY, Date.now());
    this.toast.info('Alertes de séance', 'Recevez-les même application fermée, avec le nombre de messages sur l’icône.', { persistent: true, key: 'push-ask', action: { label: 'Activer', run: () => void this.activateFromPrompt() } });
  }

  /** Appelée par l'appui sur « Activer » : le geste du coach autorise la demande de permission du téléphone. */
  private async activateFromPrompt() {
    const result = await this.enablePush();
    if (result === 'ok') this.toast.success('Alertes activées', 'Vous recevrez vos alertes de séance même application fermée.');
    else if (result === 'denied') this.toast.error('Notifications bloquées', 'Autorisez les notifications pour CoachSen dans les réglages du téléphone.');
    else if (result === 'not-configured') this.toast.error('Alertes indisponibles', 'Le service d’alertes n’est pas encore configuré. Réessayez plus tard.');
    else this.toast.error('Activation impossible', 'Réessayez depuis Profil, section Rappels.');
  }

  async refreshPushState() {
    if (!this.pushSupported) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      this.pushActive.set(!!(await registration?.pushManager.getSubscription()));
    } catch { this.pushActive.set(false); }
  }

  /** Abonne cet appareil aux notifications push. Renvoie 'ok' ou la raison de l'échec. */
  async enablePush(): Promise<'ok' | 'denied' | 'unsupported' | 'not-configured' | 'error'> {
    if (!this.pushSupported) return 'unsupported';
    if (this.permission() !== 'granted') await this.requestPermission();
    if (this.permission() !== 'granted') return 'denied';
    this.pushBusy.set(true);
    try {
      const { publicKey } = await this.api.get<{ publicKey: string }>('push/key');
      const registration = await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription())
        ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await this.api.write('POST', 'push/subscribe', { endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } });
      this.pushActive.set(true);
      return 'ok';
    } catch (error) {
      const status = (error as { status?: number })?.status;
      return status === 503 ? 'not-configured' : 'error';
    } finally {
      this.pushBusy.set(false);
    }
  }

  async disablePush() {
    this.pushBusy.set(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await this.api.write('POST', 'push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      this.pushActive.set(false);
    } finally {
      this.pushBusy.set(false);
    }
  }

  /** Demande au serveur d'envoyer une vraie notification push d'essai à cet appareil. */
  async testPush(): Promise<boolean> {
    try {
      await this.api.write('POST', 'push/test', {});
      return true;
    } catch { return false; }
  }

  async requestPermission() {
    if (!('Notification' in globalThis)) return;
    this.permission.set(await Notification.requestPermission());
  }

  /** Envoie une alerte d'essai pour que le coach voie à quoi elle ressemble. */
  async test() {
    await this.deliver('Adam Carter', `${this.coach()}, votre séance Lower Body dans 20 min, 23:00`, '/sessions', 'test', true);
  }

  private async refresh() {
    if (!this.settings().enabled) return;
    try {
      // Fenêtre utile : le délai maximal est de 24 h, donc aujourd'hui et demain suffisent (séances planifiées seulement).
      const day = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dakar' }).format(new Date(Date.now() + offset * 86_400_000));
      this.sessions = await this.api.get<Row[]>(`sessions?from=${day(0)}&to=${day(1)}&statut=PLANIFIEE`);
    } catch { /* la prochaine tentative réessaiera ; pas de bruit pour le coach */ }
    this.tick();
  }

  private tick() {
    const { enabled, offsets } = this.settings();
    if (!enabled || !offsets.length) return;
    const now = Date.now();
    this.purge(now);
    for (const session of this.sessions) {
      if (session['statut'] !== 'PLANIFIEE') continue;
      const start = Date.parse(String(session['date_heure']));
      const remaining = start - now;
      if (!Number.isFinite(start) || remaining <= 0) continue;
      const reached = offsets.filter(o => remaining <= o * 60_000);
      if (!reached.length) continue;
      const pending = reached.filter(o => !this.fired[`${session.id}:${o}`]);
      if (!pending.length) continue;
      // Une seule alerte même si plusieurs délais sont déjà atteints (ex. application ouverte tard).
      for (const o of reached) this.fired[`${session.id}:${o}`] = now;
      write(FIRED_KEY, this.fired);
      const minutes = Math.max(1, Math.ceil(remaining / 60_000));
      const hour = new Intl.DateTimeFormat('fr-SN', { timeZone: 'Africa/Dakar', hour: '2-digit', minute: '2-digit' }).format(new Date(start));
      const client = display(session['clients']);
      const who = client !== '—' ? client : 'CoachSen';
      const preview = `${this.coach()}, votre séance ${display(session['titre'])} dans ${formatOffset(minutes)}, ${hour}`;
      void this.deliver(who, preview, '/sessions/' + session.id, String(session.id));
    }
  }

  private purge(now: number) {
    const limit = now - 2 * 86_400_000;
    let changed = false;
    for (const [key, at] of Object.entries(this.fired)) if (at < limit) { delete this.fired[key]; changed = true; }
    if (changed) write(FIRED_KEY, this.fired);
  }

  private async deliver(title: string, detail: string, url: string, tag: string, force = false) {
    this.toast.info(title, detail, { duration: 20_000, key: 'reminder-' + tag, avatar: title.trim().charAt(0).toUpperCase() || 'C', action: { label: 'Ouvrir la séance', run: () => void this.router.navigateByUrl(url) } });
    if (!this.settings().system || this.permission() !== 'granted' || (!force && (document.visibilityState === 'visible' || this.pushActive()))) return;
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      // Présentation façon messagerie : nom du contact en titre, aperçu dessous, une notification par séance qui se remplace d'elle-même.
      const options: NotificationOptions & { renotify?: boolean; vibrate?: number[]; timestamp?: number; actions?: { action: string; title: string }[] } = {
        body: detail, tag: 'session-' + tag, icon: '/icon-192.png', badge: '/badge-72.png', data: { url },
        renotify: true, vibrate: [200, 100, 200], timestamp: Date.now(),
        actions: [{ action: 'open', title: 'Ouvrir' }, { action: 'dismiss', title: 'Ignorer' }],
      };
      if (registration) await registration.showNotification(title, options);
      else new Notification(title, options);
    } catch { /* le message dans l'application a déjà été affiché */ }
  }
}
