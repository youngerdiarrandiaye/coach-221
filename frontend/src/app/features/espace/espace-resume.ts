import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { display, errorText } from '../../core/api';
import { Toast } from '../../core/toast';
import { EspaceStore, dayLabel, num, timeLabel } from '../../core/espace-store';

/** Résumé : l'essentiel de la forme du moment (séances, volume, assiduité, poids, prochaines séances, cette semaine). */
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (store.error()) { <div class="empty"><p class="error" role="alert">{{ store.error() }}</p><button class="secondary" type="button" (click)="store.load(true)">Réessayer</button></div> }
    @else if (!store.data()) { <p role="status" class="muted">Chargement de votre espace…</p> }
    @else if (store.data(); as d) {
      <section class="e-hello">
        <p class="e-eyebrow">MON ESPACE</p>
        <h1>Bonjour {{ d.client.prenom }}</h1>
        <p class="muted">@if (d.coach) { Suivi par <strong>{{ d.coach }}</strong> } @if (d.client.objectif) { · Objectif : {{ display(d.client.objectif) }} }</p>
      </section>

      <div class="e-kpis">
        <section class="e-kpi e-featured"><span class="e-k-label">Séances ce mois</span><strong>{{ d.analytics.month.totals.seances }}</strong><span class="e-k-sub">{{ d.analytics.week.totals.seances }} cette semaine</span></section>
        <section class="e-kpi"><span class="e-k-label">Volume soulevé</span><strong>{{ num(d.analytics.month.totals.volume_kg, 0) }}<small> kg</small></strong>
          <span class="e-k-sub">@if (d.analytics.month.totals.delta_volume_pct !== null) { {{ d.analytics.month.totals.delta_volume_pct > 0 ? '+' : '' }}{{ num(d.analytics.month.totals.delta_volume_pct, 0) }} % vs le mois précédent } @else { sur 30 jours }</span></section>
        <section class="e-kpi"><span class="e-k-label">Records battus</span><strong>{{ d.analytics.month.totals.records }}</strong><span class="e-k-sub">sur 30 jours</span></section>
        <section class="e-kpi"><span class="e-k-label">Assiduité</span><strong>{{ d.attendance.rate === null ? '—' : d.attendance.rate + ' %' }}</strong><span class="e-k-sub">{{ d.attendance.done }} séance(s) effectuée(s)</span></section>
      </div>

      <div class="e-two">
        <section class="panel">
          <div class="e-head"><h2>Mon poids</h2><a routerLink="/espace/progression">Voir la progression</a></div>
          @if (weight(); as w) {
            <div class="e-weight"><strong>{{ num(w.now) }}<small> kg</small></strong>
              @if (w.start !== null) { <span class="muted">Départ : {{ num(w.start) }} kg</span> }
              @if (w.delta !== null) { <span class="pill" [attr.data-tone]="w.delta <= 0 ? 'ok' : 'warn'">{{ w.delta > 0 ? '+' : '' }}{{ num(w.delta) }} kg</span> }
            </div>
          } @else { <p class="muted">Aucune pesée enregistrée pour le moment. Votre coach les ajoute lors de vos séances.</p> }
        </section>
        <section class="panel">
          <div class="e-head"><h2>Prochaines séances</h2></div>
          @if (!d.upcoming.length) { <p class="muted">Aucune séance planifiée pour le moment.</p> }
          @else {
            <ul class="e-list">@for (s of d.upcoming; track s.date_heure) {
              <li><span class="e-dot" aria-hidden="true"><i class="fa-solid fa-calendar-day"></i></span><div><strong>{{ s.titre }}</strong><span class="muted">{{ timeLabel(s.date_heure) }} · {{ s.duree_minutes }} min</span></div></li>
            }</ul>
          }
        </section>
      </div>

      <section class="panel">
        <div class="e-head"><h2>Cette semaine</h2><a routerLink="/espace/rapports">Tous les rapports</a></div>
        @if (week(); as w) {
          <div class="e-week">
            <div><span class="muted">Séances</span><strong>{{ w.sessionsDone }} / {{ w.sessionsPlanned }}</strong></div>
            <div><span class="muted">Séries</span><strong>{{ w.sets }}</strong></div>
            <div><span class="muted">Volume</span><strong>{{ num(w.volumeKg, 0) }} kg</strong></div>
            <div><span class="muted">Poids moyen</span><strong>{{ w.weightKg === null ? '—' : num(w.weightKg) + ' kg' }}</strong></div>
          </div>
        }
      </section>

      <section class="panel">
        <div class="e-head"><h2>Mon journal</h2><span class="muted">14 derniers jours</span></div>
        @if (!d.journal.length) { <p class="muted">Rien à afficher pour le moment : votre journal se remplit à chaque séance, entraînement ou pesée.</p> }
        @else {
          <ul class="e-list">@for (e of d.journal.slice(0, 8); track $index) {
            <li><span class="e-dot" aria-hidden="true"><i class="fa-solid" [class]="icon(e.kind)"></i></span><div><strong>{{ e.label }}</strong><span class="muted">{{ dayLabel(e.date) }}</span></div></li>
          }</ul>
        }
      </section>
      <section class="panel e-digest">
        <label class="e-switch"><input type="checkbox" [checked]="d.settings.weekly_digest" [disabled]="savingDigest" (change)="toggleDigest($any($event.target).checked)" />
          <span><strong>Recevoir mon résumé chaque lundi par e-mail</strong><span class="muted">Vos séances, votre poids et vos prochaines séances de la semaine.</span></span></label>
      </section>
    }
  `,
  styles: [`
    :host{display:block}
    .e-digest{margin-top:4px}.e-switch{display:flex;align-items:flex-start;gap:12px;cursor:pointer}.e-switch input{width:22px;height:22px;margin-top:2px;accent-color:var(--accent);flex:none}.e-switch span{display:flex;flex-direction:column;gap:2px}.e-switch .muted{font-size:13px}
    .e-hello{margin-bottom:22px}.e-hello h1{margin:4px 0 6px;font-size:clamp(28px,5vw,40px);letter-spacing:-.03em}
    .e-eyebrow{margin:0;font-size:11px;letter-spacing:.16em;color:var(--accent);font-weight:700}
    .e-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}
    .e-kpi{display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:24px;border:1px solid var(--edge);background:var(--surface);min-width:0}
    .e-kpi strong{font-size:clamp(24px,3.4vw,34px);font-weight:800;letter-spacing:-.02em;line-height:1.1}.e-kpi small{font-size:.5em;font-weight:600}
    .e-k-label{font-size:13px;color:var(--soft);font-weight:600}.e-k-sub{font-size:12px;color:var(--soft)}
    .e-kpi.e-featured{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.e-kpi.e-featured .e-k-label,.e-kpi.e-featured .e-k-sub{color:var(--on-accent)}
    .e-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .panel{padding:20px;border-radius:24px;border:1px solid var(--edge);background:var(--surface);margin-bottom:12px}
    .e-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}.e-head h2{margin:0;font-size:18px}.e-head a{font-size:13px}
    .e-weight{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px}.e-weight strong{font-size:34px;font-weight:800;letter-spacing:-.02em}.e-weight small{font-size:.5em}
    .e-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
    .e-list li{display:flex;gap:12px;align-items:center}.e-list li div{display:flex;flex-direction:column;min-width:0}.e-list li span.muted{font-size:13px}
    .e-dot{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:12px;background:var(--surface-2);color:var(--accent)}
    .e-week{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.e-week div{display:flex;flex-direction:column;gap:4px}.e-week strong{font-size:20px}
    @media(max-width:800px){.e-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.e-two{grid-template-columns:1fr}.e-week{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `],
})
export class EspaceResume {
  protected store = inject(EspaceStore);
  private toast = inject(Toast);
  savingDigest = false;
  protected display = display; protected num = num; protected dayLabel = dayLabel; protected timeLabel = timeLabel;
  icon = (kind: string) => kind === 'seance' ? 'fa-calendar-check' : kind === 'entrainement' ? 'fa-dumbbell' : 'fa-weight-scale';

  /** Poids actuel, poids de départ (celui de la fiche, sinon la première pesée) et écart. */
  weight = computed(() => {
    const d = this.store.data(); if (!d) return null;
    const weights = d.measures.filter(m => m.poids_kg != null).map(m => Number(m.poids_kg));
    if (!weights.length) return null;
    const now = weights[weights.length - 1];
    const start = d.client.poids_initial_kg != null ? Number(d.client.poids_initial_kg) : weights.length > 1 ? weights[0] : null;
    return { now, start, delta: start === null ? null : Math.round((now - start) * 10) / 10 };
  });
  week = computed(() => this.store.data()?.weeks[0] ?? null);

  async toggleDigest(on: boolean) {
    this.savingDigest = true;
    try { await this.store.setWeeklyDigest(on); this.toast.success(on ? 'Résumé activé' : 'Résumé désactivé', on ? 'Vous le recevrez chaque lundi.' : 'Vous ne recevrez plus le résumé du lundi.'); }
    catch (e) { this.toast.error('Réglage non enregistré', errorText(e)); await this.store.load(true); }
    finally { this.savingDigest = false; }
  }
}
