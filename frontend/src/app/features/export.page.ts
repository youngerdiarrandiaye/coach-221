import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Confirm } from '../core/confirm';
import { Theme } from '../core/theme';
import { Toast } from '../core/toast';

@Component({standalone:true,imports:[FormsModule,RouterLink],template:`
 @if(report){<a class="back" [routerLink]="'/progress/'+clientId"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Retour à la progression</a>}
 <div class="page-heading"><div><p class="eyebrow">VOS DONNÉES</p><h1>{{report?'Rapport mensuel':'Exports'}}</h1><p>{{report?'Téléchargez le bilan de votre client.':'Retrouvez vos données dans un fichier.'}}</p></div></div>
 @if(report){<section class="panel"><label for="month">Mois du rapport</label><input id="month" type="month" [(ngModel)]="month" required><div class="actions"><button class="primary" [disabled]="busy()||!validMonth()" (click)="downloadReport()">{{busy()?'Préparation…':'Télécharger le PDF'}}</button></div></section>}
 @else{<div class="kpi-grid">@for(item of exports;track item.path){<section class="panel"><h2>{{item.label}}</h2><p>{{item.description}}</p><button class="secondary" [disabled]="busy()" (click)="ask(item.path,item.label)">Télécharger</button></section>}</div>}
 `})
export class ExportPage {
 private api=inject(Api);private toast=inject(Toast);private theme=inject(Theme);private confirm=inject(Confirm);private route=inject(ActivatedRoute);report=!!this.route.snapshot.data['report'];clientId=this.route.snapshot.paramMap.get('clientId');month=new Date().toISOString().slice(0,7);busy=signal(false);
 exports=[{path:'clients.csv',label:'Clients',description:'Liste des clients au format CSV.'},{path:'sessions.csv',label:'Séances',description:'Planning et statuts au format CSV.'},{path:'payments.csv',label:'Paiements',description:'Montants FCFA et paiements au format CSV.'},{path:'all.json',label:'Toutes les données',description:'Archive complète au format JSON.'}];
 async ask(path:string,label:string){
  if(this.busy())return;
  const all=path==='all.json';
  if(!(await this.confirm.ask({title:all?'Télécharger toutes vos données ?':'Télécharger ce fichier ?',detail:all?'L’archive contient les données personnelles de tous vos clients : gardez-la en lieu sûr.':'Le fichier « '+label+' » contient des données de vos clients : ne le partagez pas.',confirmLabel:'Télécharger',tone:'sensitive'})))return;
  await this.download(path,path,label);
 }
 validMonth(){return /^\d{4}-(0[1-9]|1[0-2])$/.test(this.month);}
 async downloadReport(){if(!this.clientId||!this.validMonth())return;await this.download('report/'+this.clientId+'?month='+encodeURIComponent(this.month)+'&theme='+this.theme.current(),'rapport-'+this.month+'.pdf','Rapport mensuel '+this.monthLabel(),true);}
 private monthLabel(){return new Intl.DateTimeFormat('fr-SN',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(this.month+'-01T12:00:00Z'));}
 async download(path:string,name=path,label=name,pdf=false){
  if(this.busy())return;this.busy.set(true);
  this.toast.info(pdf?'Préparation du PDF':'Préparation du fichier','Le téléchargement démarre.',{key:'download'});
  try{
   await this.api.download('exports/'+path,name);
   this.toast.dismissKey('download');this.toast.success(pdf?'PDF téléchargé':'Fichier téléchargé',label+' ('+name+')');
  }catch(e){this.toast.dismissKey('download');this.toast.fail(pdf?'PDF non téléchargé':'Fichier non téléchargé',e,()=>void this.download(path,name,label,pdf));}
  finally{this.busy.set(false);}
 }
}
