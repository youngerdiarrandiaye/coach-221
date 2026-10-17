import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Row, dateLabel, display, errorText } from '../core/api';

@Component({
 selector:'app-client-sessions',standalone:true,imports:[RouterLink],
 template:`<section class="panel" aria-labelledby="client-sessions-title">
  <h2 id="client-sessions-title">Prochaines séances</h2>
  <a class="button secondary" routerLink="/sessions/new" [queryParams]="{clientId}">Planifier une séance pour ce client</a>
  @if(loading()){<p role="status">Chargement des séances…</p>}
  @else if(error()){<p class="error" role="alert">{{error()}}</p><button class="secondary" (click)="load()">Réessayer</button>}
  @else{<ul>@for(session of sessions();track session.id){<li><a [routerLink]="'/sessions/'+session.id">{{display(session['titre'])}}</a> · {{dateLabel(session['date_heure'])}} · {{session['duree_minutes']}} min</li>}@empty{<li>Aucune séance à venir pour ce client.</li>}</ul>}
 </section>`,styles:[`ul{padding-left:20px}li{margin-top:14px}`],
})
export class ClientSessionsComponent implements OnChanges {
 @Input({required:true}) clientId='';private api=inject(Api);private request=0;
 sessions=signal<Row[]>([]);loading=signal(true);error=signal('');display=display;dateLabel=dateLabel;
 ngOnChanges(){void this.load();}
 async load(){
  const request=++this.request;this.loading.set(true);this.error.set('');
  try{
   const rows=await this.api.get<Row[]>('sessions?clientId='+encodeURIComponent(this.clientId));
   if(request!==this.request)return;
   const now=Date.now();
   this.sessions.set(rows.filter(row=>row['statut']==='PLANIFIEE'&&Date.parse(String(row['date_heure']))>=now).sort((a,b)=>Date.parse(String(a['date_heure']))-Date.parse(String(b['date_heure']))));
  }catch(error){if(request===this.request)this.error.set(errorText(error));}
  finally{if(request===this.request)this.loading.set(false);}
 }
}
