import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';

/**
 * Mesure d'usage réel (RUM) : nombre de clics et durée entre l'arrivée sur le tableau de bord
 * et la fin d'une tâche, plus les signaux de performance du navigateur (LCP, CLS, INP approchés).
 * Aucun contenu personnel n'est envoyé : uniquement un nom de tâche, un chemin, un nombre de clics et une durée.
 */
@Injectable({ providedIn: 'root' })
export class Rum {
  private router = inject(Router);
  private clicks = 0;
  private startedAt = performance.now();
  private started = false;
  private lcp = 0;
  private cls = 0;
  private inp = 0;
  private vitalsSent = false;

  start() {
    if (this.started) return;
    this.started = true;
    addEventListener('click', () => { this.clicks++; }, { capture: true, passive: true });
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd && /^\/(dashboard)?(\?|$)/.test(event.urlAfterRedirects)) this.reset();
    });
    this.observeVitals();
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.sendVitals(); });
  }

  /** Nouveau point de départ : le coach est revenu à l'accueil. */
  reset() {
    this.clicks = 0;
    this.startedAt = performance.now();
  }

  /** Signale qu'une tâche métier est terminée (ex. « saisie_entrainement »). */
  completeTask(task: string) {
    const clicks = Math.min(this.clicks, 50);
    const duration = Math.min(Math.round(performance.now() - this.startedAt), 600000);
    this.send({ name: 'task', task, path: this.cleanPath(), clicks, duration_ms: duration });
    this.reset();
  }

  private cleanPath() {
    return this.router.url.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').slice(0, 120);
  }

  private observeVitals() {
    const watch = (type: string, handle: (entry: any) => void, extra: object = {}) => {
      try {
        new PerformanceObserver(list => list.getEntries().forEach(handle)).observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      } catch { /* type non pris en charge par ce navigateur */ }
    };
    watch('largest-contentful-paint', e => { this.lcp = e.startTime; });
    watch('layout-shift', e => { if (!e.hadRecentInput) this.cls += e.value; });
    watch('event', e => { if (e.interactionId) this.inp = Math.max(this.inp, e.duration); }, { durationThreshold: 40 });
  }

  private sendVitals() {
    if (this.vitalsSent) return;
    this.vitalsSent = true;
    const path = this.cleanPath();
    if (this.lcp) this.send({ name: 'vital', task: 'LCP', path, value: Math.round(this.lcp) });
    if (this.inp) this.send({ name: 'vital', task: 'INP', path, value: Math.round(this.inp) });
    this.send({ name: 'vital', task: 'CLS', path, value: Math.round(this.cls * 1000) / 1000 });
  }

  /** Envoi sans bloquer l'interface ; une mesure perdue n'est jamais une erreur. */
  private send(body: object) {
    try {
      void fetch('/api/v1/rum', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', 'X-CoachSen-Client': 'angular' },
        body: JSON.stringify(body),
      }).catch(() => undefined);
    } catch { /* ignoré */ }
  }
}
