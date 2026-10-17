import { Component, ViewEncapsulation, computed, effect, input, signal } from '@angular/core';

/**
 * Photo d'ambiance décorative (dossier assets/photos, voir scripts/generate-photos.mjs).
 * Tant que l'image n'existe pas, rien n'est affiché, ou le contenu de repli si on en fournit :
 * `<app-photo name="empty-clients"><div class="empty-icon">…</div></app-photo>`.
 */
@Component({
  selector: 'app-photo',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `@if (shown()) { <img class="photo" [src]="src()" alt="" loading="lazy" decoding="async" (error)="failed.set(true)" /> } @else { <ng-content /> }`,
})
export class Photo {
  /** Nom du fichier sans extension (login-hero, home-banner, empty-clients, …). */
  readonly name = input('');
  protected failed = signal(false);
  protected src = computed(() => `/assets/photos/${this.name()}.png`);
  protected shown = computed(() => !!this.name() && !this.failed());
  constructor() { effect(() => { this.name(); this.failed.set(false); }); }
}
