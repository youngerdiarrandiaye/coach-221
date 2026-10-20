import { Injectable, inject, signal } from '@angular/core';
import { Api, errorText } from './api';

export interface Measure {
  mesure_date: string; poids_kg: number | string | null; imc: number | string | null;
  tour_taille_cm: number | null; hanches_cm: number | null; bras_cm: number | null; cuisse_cm: number | null;
  masse_grasse_pct: number | null; frequence_cardiaque_repos_bpm: number | null; frequence_cardiaque_effort_bpm: number | null;
}
export interface UpcomingSession { date_heure: string; statut: string; titre: string; duree_minutes: number }
export interface Bucket { label: string; start: string; volume_kg: number; series: number; seances: number; poids_moyen_kg: number | null }
export interface Analytics { period: string; from: string; to: string; buckets: Bucket[]; totals: { volume_kg: number; series: number; seances: number; records: number; delta_volume_pct: number | null } }
export interface RecordRow { exercice_id: string; exercice: string; groupe_musculaire: string | null; best_1rm: number; max_charge: number; max_reps: number; record_date: string }
export interface Week { start: string; end: string; sessionsDone: number; sessionsPlanned: number; sets: number; volumeKg: number; weightKg: number | null }
export interface JournalEntry { date: string; kind: 'seance' | 'entrainement' | 'mesure'; label: string }
export interface Overview {
  client: { prenom: string; nom: string; objectif: string | null; taille_cm: number | null; poids_initial_kg: number | null; depuis: string };
  coach: string | null;
  measures: Measure[];
  upcoming: UpcomingSession[];
  attendance: { done: number; missed: number; rate: number | null };
  analytics: { week: Analytics; month: Analytics };
  records: RecordRow[];
  weeks: Week[];
  journal: JournalEntry[];
  months: string[];
}

/** Données de l'espace client (lecture seule), chargées une fois puis partagées entre les trois pages. */
@Injectable({ providedIn: 'root' })
export class EspaceStore {
  private api = inject(Api);
  data = signal<Overview | null>(null);
  error = signal('');
  loading = signal(false);

  async load(force = false) {
    if (this.loading() || (this.data() && !force)) return;
    this.loading.set(true); this.error.set('');
    try { this.data.set(await this.api.get<Overview>('me/overview')); }
    catch (e) { this.error.set(errorText(e)); }
    finally { this.loading.set(false); }
  }

  clear() { this.data.set(null); this.error.set(''); }
}

export const num = (v: number | null | undefined, digits = 1) => v == null ? '—' : new Intl.NumberFormat('fr-SN', { maximumFractionDigits: digits }).format(v).replace(/[  ]/g, ' ');
export const monthLabel = (m: string) => new Intl.DateTimeFormat('fr-SN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m + '-01T00:00:00Z'));
export const dayLabel = (d: string) => new Intl.DateTimeFormat('fr-SN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d.slice(0, 10) + 'T00:00:00Z'));
export const timeLabel = (iso: string) => new Intl.DateTimeFormat('fr-SN', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dakar' }).format(new Date(iso));
