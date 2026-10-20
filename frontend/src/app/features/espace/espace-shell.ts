import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../core/api';
import { EspaceStore } from '../../core/espace-store';

/** Coque de l'espace client : en-tête, navigation (barre du bas sur téléphone) et contenu. Lecture seule. */
@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip" href="#espace-main">Aller au contenu</a>
    <header class="esp-top">
      <a routerLink="/espace" class="esp-brand" aria-label="CoachSen, mon espace"><span class="esp-logo" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>coachsen<span class="esp-dot">.</span></a>
      <nav class="esp-tabs" aria-label="Navigation de mon espace">
        <a routerLink="/espace" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page">Résumé</a>
        <a routerLink="/espace/progression" routerLinkActive="on" ariaCurrentWhenActive="page">Progression</a>
        <a routerLink="/espace/rapports" routerLinkActive="on" ariaCurrentWhenActive="page">Rapports</a>
      </nav>
      <div class="esp-who">
        @if (store.data(); as d) { <span class="esp-name">{{ d.client.prenom }}</span> }
        <button type="button" class="esp-out" [disabled]="busy()" (click)="logout()" aria-label="Me déconnecter"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>Déconnexion</span></button>
      </div>
    </header>
    <main id="espace-main" class="esp-main"><router-outlet /></main>
    <nav class="esp-bottom" aria-label="Navigation mobile">
      <a routerLink="/espace" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page"><i class="fa-solid fa-house" aria-hidden="true"></i><span>Résumé</span></a>
      <a routerLink="/espace/progression" routerLinkActive="on" ariaCurrentWhenActive="page"><i class="fa-solid fa-chart-line" aria-hidden="true"></i><span>Progression</span></a>
      <a routerLink="/espace/rapports" routerLinkActive="on" ariaCurrentWhenActive="page"><i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>Rapports</span></a>
    </nav>
  `,
  styles: [`
    :host{display:block;min-height:100dvh;background:var(--bg);color:var(--text)}
    .skip{position:fixed;top:-100px;left:12px;background:var(--accent);color:var(--on-accent);padding:12px;z-index:100;border-radius:10px}.skip:focus{top:12px}
    .esp-top{position:fixed;top:0;left:0;right:0;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:16px;height:calc(60px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 20px 0;background:var(--bg);border-bottom:1px solid var(--edge);box-sizing:border-box}
    .esp-brand{display:inline-flex;align-items:center;font-size:22px;font-weight:800;letter-spacing:-.04em;color:var(--text);text-decoration:none}
    .esp-logo{display:grid;place-items:center;width:32px;height:32px;margin-right:8px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-size:15px}
    .esp-dot{color:var(--accent)}
    .esp-tabs{display:flex;gap:6px}
    .esp-tabs a{padding:9px 16px;border-radius:999px;color:var(--soft);font-weight:600;font-size:14px;text-decoration:none}
    .esp-tabs a.on{background:var(--accent);color:var(--on-accent)}
    .esp-who{display:flex;align-items:center;gap:12px}
    .esp-name{font-weight:700;font-size:14px}
    .esp-out{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid var(--edge);border-radius:999px;background:transparent;color:var(--soft);font-size:13px;font-weight:600;cursor:pointer}
    .esp-main{max-width:980px;margin:0 auto;padding:calc(84px + env(safe-area-inset-top)) 20px 48px}
    .esp-bottom{display:none}
    @media(max-width:800px){
      .esp-tabs,.esp-out span{display:none}
      .esp-out{width:40px;padding:0;justify-content:center}
      .esp-main{padding:calc(76px + env(safe-area-inset-top)) 16px calc(100px + env(safe-area-inset-bottom))}
      .esp-bottom{display:grid;grid-template-columns:repeat(3,1fr);position:fixed;left:0;right:0;bottom:0;z-index:30;padding:8px 8px calc(8px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--edge)}
      .esp-bottom a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:56px;border-radius:16px;color:var(--soft);font-size:12px;font-weight:600;text-decoration:none}
      .esp-bottom a i{font-size:19px}
      .esp-bottom a.on{color:var(--accent)}
    }
  `],
})
export class EspaceShell {
  protected store = inject(EspaceStore);
  private auth = inject(Auth);
  private router = inject(Router);
  busy = signal(false);

  constructor() { void this.store.load(); }

  async logout() {
    this.busy.set(true);
    try { await this.auth.logout(); this.store.clear(); await this.router.navigateByUrl('/login'); }
    finally { this.busy.set(false); }
  }
}
