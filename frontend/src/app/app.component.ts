import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './core/api';
import { NavigationToolsComponent } from './shared/navigation-tools.component';
import { Rum } from './core/rum';
import { Toast } from './core/toast';
import { Confirm } from './core/confirm';
import { Pwa } from './core/pwa';
import { Reminders } from './core/reminders';
import { ToastHost } from './shared/toast-host';
import { ConfirmHost } from './shared/confirm-host';
import { SyncDialog, SyncPill } from './shared/sync-panel';
import { OfflineQueue } from './core/offline-queue';
import { MoreSheet } from './core/more-sheet';
import { FocusTrap } from './shared/focus-trap';
import { coachInitial, coachLabel } from './core/coach-name';
@Component({selector:'app-root',standalone:true,imports:[RouterOutlet,ToastHost,ConfirmHost],template:'<router-outlet /><app-toast-host /><app-confirm-host />'})
export class AppComponent { constructor(){ inject(Toast).watchNetwork(); } }
@Component({standalone:true,imports:[RouterOutlet,RouterLink,RouterLinkActive,NavigationToolsComponent,SyncPill,SyncDialog,FocusTrap],template:`
<a class="skip" href="#main">Aller au contenu</a>
<div class="workspace">
 <aside class="sidebar">
  <a routerLink="/dashboard" class="brand"><span class="brand-icon" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>coach<span>sen</span><span class="brand-dot">.</span></a>
  <p class="eyebrow sidebar-label">L’ESPACE DES COACHS</p>
  <nav aria-label="Navigation principale">@for(link of links;track link.path){
   <a [routerLink]="link.path" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="fa-solid" [class]="link.icon" aria-hidden="true"></i><span>{{link.label}}</span><i class="fa-solid fa-arrow-right nav-arrow" aria-hidden="true"></i></a>
  }</nav>
  <div class="sidebar-bottom"><div class="sidebar-note"><span class="eyebrow">L’ÉNERGIE DU COLLECTIF</span><p>Plus loin.<br><strong>Ensemble.</strong></p><span class="note-star"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span><a routerLink="/clients/new">Agrandir mon équipe <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div><div class="sidebar-location"><span class="senegal-flag" aria-hidden="true"></span> Fait pour le Sénégal <span>SN</span></div></div>
 </aside>
 <div class="content"><header class="topbar"><a routerLink="/dashboard" class="brand mobile-brand" aria-label="CoachSen, accueil"><span class="brand-icon" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>coachsen</a><div class="workspace-title"><span class="status-dot" aria-hidden="true"></span> MON ESPACE COACH</div><div><app-sync-pill />@if(pwa.canInstall()){<button type="button" class="secondary install-btn" (click)="pwa.install()"><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i> Installer l’app</button>}<a class="profile-link" routerLink="/profile"><span class="profile-avatar">{{initial()}}</span><span>{{coachName()}}<small>Mon profil</small></span></a><button class="quiet logout" [disabled]="busy()" (click)="logout()"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Déconnexion</button></div></header>
 <app-navigation-tools /><main id="main"><router-outlet /></main><a class="fab" routerLink="/workouts/new" aria-label="Saisie rapide d’un entraînement" title="Saisie rapide"><i class="fa-solid fa-plus" aria-hidden="true"></i></a><footer><span>© {{year}} CoachSen</span><span>Le talent est ici. L’avenir aussi. <span class="footer-star"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span></span></footer></div>
 <app-sync-dialog />
 <nav class="bottom-nav" aria-label="Navigation mobile">
  <a routerLink="/dashboard" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="sheet.hide()"><i class="fa-solid fa-house" aria-hidden="true"></i><span>Accueil</span></a>
  <a routerLink="/clients" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="sheet.hide()"><i class="fa-solid fa-people-group" aria-hidden="true"></i><span>Clients</span></a>
  <a routerLink="/workouts/new" class="bn-add" aria-label="Saisie rapide d’un entraînement" (click)="sheet.hide()"><i class="fa-solid fa-plus" aria-hidden="true"></i></a>
  <a routerLink="/sessions" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="sheet.hide()"><i class="fa-solid fa-dumbbell" aria-hidden="true"></i><span>Séances</span></a>
  <button type="button" class="bn-more" [class.active]="sheet.open()" aria-haspopup="dialog" [attr.aria-expanded]="sheet.open()" aria-controls="more-sheet" (click)="sheet.toggle()"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i><span>Plus</span></button>
 </nav>
 @if(sheet.open()){
  <div class="sheet-backdrop" (click)="sheet.hide()"></div>
  <section id="more-sheet" class="more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-title" appFocusTrap (escape)="sheet.hide()">
   <h2 id="more-title">Plus de services</h2>
   <ul>@for(link of moreLinks;track link.label){<li><a [routerLink]="link.path" [fragment]="link.fragment" (click)="sheet.hide()"><i class="fa-solid" [class]="link.icon" aria-hidden="true"></i><span>{{link.label}}</span><i class="fa-solid fa-chevron-right sheet-chevron" aria-hidden="true"></i></a></li>}
    @if(pwa.canInstall()){<li><button type="button" (click)="pwa.install();sheet.hide()"><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i><span>Installer l’app</span></button></li>}
    <li><button type="button" [disabled]="busy()" (click)="sheet.hide();logout()"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>Déconnexion</span></button></li>
   </ul>
  </section>
 }
</div>`})
export class ShellComponent {
 auth=inject(Auth);coachName=computed(()=>coachLabel(this.auth.profile()?.['prenom'],this.auth.profile()?.['nom']));initial=computed(()=>coachInitial(this.auth.profile()?.['prenom'],this.auth.profile()?.['nom']));private rum=inject(Rum);router=inject(Router);busy=signal(false);private toast=inject(Toast);private confirm=inject(Confirm);private queue=inject(OfflineQueue);year=new Date().getFullYear();
 pwa=inject(Pwa);sheet=inject(MoreSheet);
 constructor(){this.rum.start();inject(Reminders).start();inject(OfflineQueue).start();this.router.events.subscribe(()=>this.sheet.hide());}
 moreLinks=[
  {path:'/payments',label:'Paiements',icon:'fa-wallet'},
  {path:'/progress',label:'Progression',icon:'fa-heart-pulse'},
  {path:'/stats',label:'Statistiques',icon:'fa-chart-column'},
  {path:'/export',label:'Exports',icon:'fa-file-arrow-down'},
  {path:'/sessions/recurrences',label:'Récurrences',icon:'fa-repeat'},
  {path:'/profile',label:'Mon profil',icon:'fa-user'},
  {path:'/profile',fragment:'rappels',label:'Rappels',icon:'fa-bell'}
 ].map(l=>({fragment:undefined as string|undefined,...l}));
 links=[
  {path:'/dashboard',label:'Vue d’ensemble',icon:'fa-gauge-high'},
  {path:'/clients',label:'Clients',icon:'fa-people-group'},
  {path:'/sessions',label:'Séances',icon:'fa-dumbbell'},
  {path:'/payments',label:'Paiements',icon:'fa-wallet'},
  {path:'/progress',label:'Progression',icon:'fa-heart-pulse'},
  {path:'/stats',label:'Statistiques',icon:'fa-chart-column'},
  {path:'/export',label:'Exports',icon:'fa-file-arrow-down'}
 ];
 async logout(){
  if(this.busy())return;
  const waiting=this.queue.count();
  const detail=waiting>0?(waiting>1?waiting+' saisies ne sont pas encore synchronisées et seront perdues si vous vous déconnectez.':'1 saisie n’est pas encore synchronisée et sera perdue si vous vous déconnectez.'):'Vous devrez saisir à nouveau vos identifiants pour revenir.';
  if(!(await this.confirm.ask({title:'Se déconnecter ?',detail,confirmLabel:'Me déconnecter',tone:'sensitive'})))return;
  this.busy.set(true);
  try{await this.auth.logout();await this.router.navigateByUrl('/login');this.toast.success('Déconnexion effectuée','À bientôt.');}
  catch(e){this.toast.fail('Déconnexion impossible',e,()=>void this.logout());}
  finally{this.busy.set(false);}
 }
}

