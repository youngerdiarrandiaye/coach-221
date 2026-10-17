import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Api, Auth, describeError, retryAfterSeconds } from './api';
import { Toast } from './toast';

/** Corps d'une saisie d'entraînement (POST workouts). */
export type WorkoutBody = Record<string, unknown>;
export interface NewRecord { exercice: string; type: '1RM' | 'CHARGE' | 'REPS'; value: number; previous: number | null }
export interface WorkoutResult { logs: unknown[]; newRecords?: NewRecord[] }

export interface QueueItem {
  /** UUID : sert aussi d'en-tête Idempotency-Key, donc un rejeu ne crée jamais de doublon. */
  id: string;
  body: WorkoutBody;
  /** Libellés affichés au coach (client, exercice, nombre de séries, date). */
  client: string;
  exercise: string;
  sets: number;
  logDate: string;
  /** Séance à marquer effectuée une fois la saisie confirmée par le serveur (case cochée par le coach). */
  markDoneSessionId?: string;
  /** Coach propriétaire : une saisie n'est jamais montrée ni envoyée sous la session d'un autre coach. */
  userId?: string;
  createdAt: number;
  /** `pending` : envoyée automatiquement ; `rejected` : refusée par le serveur, en attente d'une décision du coach. */
  state: 'pending' | 'rejected';
  reason?: string;
}

const DB_NAME = 'coachsen-offline';
const STORE = 'kv';
const RECORD_KEY = 'workout-queue';
const LOCAL_KEY = 'coachsen.offline-queue';
const RETRY_EVERY_MS = 60_000;

export const newUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes); else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Une erreur « réseau » : pas de réponse du serveur, ou appareil hors ligne. */
export const isNetworkError = (error: unknown): boolean =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || (error instanceof HttpErrorResponse && error.status === 0);

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return; }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('IndexedDB bloquée'));
});

/** Stockage de la file : IndexedDB, avec repli sur localStorage si elle est indisponible. */
const storage = {
  async load(): Promise<QueueItem[]> {
    try {
      const db = await openDb();
      const value = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      if (Array.isArray(value)) return value as QueueItem[];
    } catch { /* repli ci-dessous */ }
    try { const raw = localStorage.getItem(LOCAL_KEY); const parsed = raw ? JSON.parse(raw) : []; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  },
  async save(items: QueueItem[]): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(JSON.parse(JSON.stringify(items)), RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      try { localStorage.removeItem(LOCAL_KEY); } catch { /* sans importance */ }
      return;
    } catch { /* repli ci-dessous */ }
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch { /* aucun stockage disponible : la file reste en mémoire jusqu'au rechargement */ }
  },
};

/**
 * File d'attente de la saisie d'entraînement hors ligne (et seulement elle).
 * Une saisie qui échoue faute de réseau est gardée sur l'appareil, puis envoyée dans l'ordre avec son
 * Idempotency-Key : le serveur renvoie la réponse d'origine si la saisie est déjà passée, sans doublon.
 * Un refus du serveur (erreur 4xx) sort l'élément de l'envoi automatique : le coach décide (réessayer ou supprimer).
 */
@Injectable({ providedIn: 'root' })
export class OfflineQueue {
  private api = inject(Api);
  private toast = inject(Toast);
  private auth = inject(Auth);

  private readonly all = signal<QueueItem[]>([]);
  /** Éléments du coach connecté. */
  readonly items = computed(() => { const id = this.auth.user()?.id; return this.all().filter(item => !!id && item.userId === id); });
  /** Nombre d'éléments à traiter : en attente d'envoi ou refusés. */
  readonly count = computed(() => this.items().length);
  readonly rejected = computed(() => this.items().filter(item => item.state === 'rejected'));
  readonly syncing = signal(false);
  /** Panneau « En attente de synchronisation » ouvert. */
  readonly panelOpen = signal(false);

  private started = false;
  private running = false;
  private blockedUntil = 0;
  private ready: Promise<void> = Promise.resolve();

  /** Charge la file, puis écoute le retour du réseau, le retour sur l'application et le démarrage. */
  start() {
    if (this.started) { void this.sync(); return; }
    if (typeof window === 'undefined') return;
    this.started = true;
    this.ready = storage.load().then(saved => {
      // Ce qui a été ajouté pendant le chargement passe après ce qui était déjà sur l'appareil.
      const known = new Set(this.all().map(item => item.id));
      this.all.set([...saved.filter(item => !known.has(item.id)), ...this.all()]);
    });
    window.addEventListener('online', () => void this.sync());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.sync(); });
    setInterval(() => { if (this.items().some(item => item.state === 'pending')) void this.sync(); }, RETRY_EVERY_MS);
    void this.ready.then(() => this.sync());
  }

  /** Garde une saisie sur l'appareil. L'identifiant est celui déjà utilisé comme Idempotency-Key à la première tentative. */
  async enqueue(entry: Omit<QueueItem, 'createdAt' | 'state' | 'reason' | 'userId'>): Promise<QueueItem> {
    const item: QueueItem = { ...entry, userId: this.auth.user()?.id, createdAt: Date.now(), state: 'pending' };
    this.all.update(list => [...list, item]);
    await this.ready;
    await storage.save(this.all());
    return item;
  }

  async retry(id: string) {
    this.update(id, { state: 'pending', reason: undefined });
    await this.persist();
    this.blockedUntil = 0;
    await this.sync();
  }

  async discard(id: string) {
    this.all.update(list => list.filter(item => item.id !== id));
    await this.persist();
  }

  private update(id: string, patch: Partial<QueueItem>) {
    this.all.update(list => list.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }

  private async persist() { await this.ready; await storage.save(this.all()); }

  /** Envoie, dans l'ordre, les éléments en attente. S'arrête au premier échec réseau ou serveur pour garder l'ordre. */
  async sync() {
    await this.ready;
    if (this.running || (typeof navigator !== 'undefined' && navigator.onLine === false) || Date.now() < this.blockedUntil) return;
    if (!this.items().some(item => item.state === 'pending')) return;
    this.running = true;
    this.syncing.set(true);
    let sent = 0;
    let records: NewRecord[] = [];
    let rejected = 0;
    try {
      for (const item of this.items().filter(i => i.state === 'pending')) {
        try {
          const result = await this.api.write<WorkoutResult>('POST', 'workouts', item.body, { 'Idempotency-Key': item.id });
          sent++;
          records = records.concat(result?.newRecords ?? []);
          this.all.update(list => list.filter(i => i.id !== item.id));
          await this.persist();
          if (item.markDoneSessionId) {
            try { await this.api.write('PATCH', 'sessions/' + item.markDoneSessionId + '/status', { statut: 'EFFECTUEE' }); }
            catch { this.toast.error('Séance non marquée effectuée', 'Vos séries sont enregistrées. Ouvrez la séance pour changer son statut.'); }
          }
        } catch (error) {
          if (error instanceof HttpErrorResponse && error.status === 429) {
            this.blockedUntil = Date.now() + (retryAfterSeconds(error) ?? 30) * 1000;
            break;
          }
          if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 408) {
            const info = describeError(error);
            this.update(item.id, { state: 'rejected', reason: info.message });
            await this.persist();
            rejected++;
            continue;
          }
          break; // réseau, serveur indisponible ou session expirée : l'élément reste en attente, dans l'ordre
        }
      }
    } finally {
      this.running = false;
      this.syncing.set(false);
    }
    if (sent) {
      const detail = records.length ? `${records.length} ${records.length > 1 ? 'records battus' : 'record battu'} : ${[...new Set(records.map(r => r.exercice))].join(', ')}` : '';
      this.toast.success(sent > 1 ? `${sent} entraînements synchronisés` : 'Entraînement synchronisé', detail || 'Enregistré sur le serveur.');
    }
    if (rejected) this.toast.error(rejected > 1 ? `${rejected} saisies refusées` : 'Saisie refusée', 'Ouvrez « En attente de synchronisation » pour la corriger ou la supprimer.', { key: 'sync-rejected' });
  }
}
