import { Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Row, dateLabel, display, errorText, money } from '../core/api';
import { VoiceSheet } from './voice/voice-sheet';

interface SearchResults { clients: Row[]; sessions: Row[]; payments: Row[]; total: number }

@Component({
 selector: 'app-navigation-tools', standalone: true, imports: [RouterLink, VoiceSheet],
 template: `
 <div class="tools">
   <label for="global-search"><span class="sr-only">Recherche globale</span>
     <input id="global-search" type="search" maxlength="100" placeholder="Clients, séances, paiements…" [value]="query()" (input)="search($any($event.target).value)" aria-describedby="search-help">
   </label>
   <button class="secondary voice-btn" type="button" aria-haspopup="dialog" aria-label="Dictée vocale" title="Dictée vocale" data-testid="voice-open" (click)="voiceOpen.set(true)"><i class="fa-solid fa-microphone" aria-hidden="true"></i></button>
   <button class="secondary" type="button" [attr.aria-expanded]="notificationsOpen()" aria-controls="session-notifications" (click)="toggleNotifications()">Notifications</button>
 </div>
 @if(voiceOpen()){<app-voice-sheet (closed)="voiceOpen.set(false)" />}
 <p id="search-help" class="hint">Saisissez au moins 2 caractères.</p>
 @if(query().trim().length >= 2){
 <section aria-label="Résultats de recherche globale" [attr.aria-busy]="searchLoading()">
   @if(searchLoading()){<p role="status">Recherche en cours…</p>}
   @else if(searchError()){<p role="alert" class="error">{{searchError()}}</p><button class="secondary" (click)="search(query())">Réessayer la recherche</button>}
   @else if(results(); as result){
     <p role="status">{{result.total}} résultat(s) — jusqu’à 4 par catégorie.</p>
     @if(!result.total){<p>Aucun résultat. Essayez un autre nom ou titre.</p>}
     @for(group of groups; track group.key){
       @if(result[group.key].length){<h2>{{group.label}}</h2><ul>
       @for(row of result[group.key]; track row.id){<li><a [routerLink]="['/'+group.key,row.id]" (click)="search('')">{{label(row,group.key)}}</a></li>}
       </ul>}
     }
   }
 </section>
 }
 @if(notificationsOpen()){
 <section id="session-notifications" aria-label="Séances dans les deux prochaines heures" [attr.aria-busy]="notificationsLoading()">
   <h2>Séances dans les deux prochaines heures</h2>
   @if(notificationsLoading()){<p role="status">Chargement des notifications…</p>}
   @else if(notificationsError()){<p role="alert" class="error">{{notificationsError()}}</p>}
   @else if(!notifications().length){<p role="status">Aucune séance prévue dans les deux prochaines heures.</p>}
   @else{<ul>@for(row of notifications();track row.id){<li><a [routerLink]="['/sessions',row.id]" (click)="closeNotifications()">{{label(row,'sessions')}}</a></li>}</ul>}
   <button class="secondary" [disabled]="notificationsLoading()" (click)="loadNotifications()">Actualiser les notifications</button>
 </section>
 }
 `,
 styles: [`:host{display:block;padding:14px 38px;background:#fcfcf8;border-bottom:1px solid #e1e5da}.tools{display:flex;align-items:center;gap:16px}.tools label{flex:1;margin:0;max-width:580px}.tools input{margin:0;padding:10px 14px 10px 36px;border-color:#e7eadf;background:#f4f5ee;font-size:12px;font-weight:400;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23718078' stroke-width='1.6'%3E%3Ccircle cx='10' cy='10' r='6'/%3E%3Cpath d='m15 15 5 5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:12px center}.tools button{margin-left:auto;flex-shrink:0;font-size:11px;min-height:38px;padding:8px 13px;background:transparent}.hint{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}section{margin-top:16px;padding:20px;border:1px solid #e1e5da;border-radius:10px;background:white}h2{font-size:16px}ul{padding-left:20px}li{padding:6px 0}a{display:inline-block}@media(max-width:1150px){:host{padding:14px 25px}}@media(max-width:800px){:host{padding:12px 18px}}@media(max-width:430px){.tools{gap:8px}.tools button{font-size:10px;padding:8px}.tools input{font-size:11px}}`]
})
export class NavigationToolsComponent implements OnDestroy {
 private api=inject(Api);
 private searchVersion=0;
 private notificationVersion=0;
 private timer:ReturnType<typeof setTimeout>|undefined;
 voiceOpen=signal(false);query=signal('');searchLoading=signal(false);searchError=signal('');results=signal<SearchResults|null>(null);
 notificationsOpen=signal(false);notificationsLoading=signal(false);notificationsError=signal('');notifications=signal<Row[]>([]);
 groups: {key:'clients'|'sessions'|'payments';label:string}[]=[{key:'clients',label:'Clients'},{key:'sessions',label:'Séances'},{key:'payments',label:'Paiements'}];
 search(value:string){
   this.query.set(value);const version=++this.searchVersion;clearTimeout(this.timer);
   this.results.set(null);this.searchError.set('');this.searchLoading.set(value.trim().length>=2);
   if(value.trim().length<2)return;
   this.timer=setTimeout(()=>void this.loadSearch(value.trim(),version),250);
 }
 private async loadSearch(value:string,version:number){
   try{const data=await this.api.get<SearchResults>('search?q='+encodeURIComponent(value));if(version===this.searchVersion)this.results.set(data);}
   catch(error){if(version===this.searchVersion)this.searchError.set(errorText(error));}
   finally{if(version===this.searchVersion)this.searchLoading.set(false);}
 }
 toggleNotifications(){if(this.notificationsOpen())this.closeNotifications();else{this.notificationsOpen.set(true);void this.loadNotifications();}}
 closeNotifications(){this.notificationsOpen.set(false);++this.notificationVersion;}
 async loadNotifications(){
   const version=++this.notificationVersion;this.notificationsLoading.set(true);this.notificationsError.set('');this.notifications.set([]);
   try{const data=await this.api.get<Row[]>('notifications');if(version===this.notificationVersion)this.notifications.set(data);}
   catch(error){if(version===this.notificationVersion)this.notificationsError.set(errorText(error));}
   finally{if(version===this.notificationVersion)this.notificationsLoading.set(false);}
 }
 label(row:Row,kind:string){
   if(kind==='clients')return display(row);
   if(kind==='sessions')return [display(row['titre']),dateLabel(row['date_heure']),display(row['clients'])].join(' · ');
   return [display(row['clients']),money(row['montant']),dateLabel(row['date_paiement'])].join(' · ');
 }
 ngOnDestroy(){clearTimeout(this.timer);++this.searchVersion;++this.notificationVersion;}
}
