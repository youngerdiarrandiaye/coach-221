import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Row, display, dateLabel, money, errorText } from '../core/api';
import { features } from '../shared/features';
import { Theme } from '../core/theme';
import { Toast } from '../core/toast';
import { Confirm, ConfirmOptions } from '../core/confirm';
import { Privacy } from '../core/privacy';
import { ClientSessionsComponent } from '../shared/client-sessions.component';
import { FocusTrap } from '../shared/focus-trap';
import { Photo } from '../shared/photo';
import { ClientAccessComponent } from '../shared/client-access.component';
@Component({standalone:true,imports:[RouterLink,ClientSessionsComponent,FocusTrap,Photo,ClientAccessComponent],template:`<a class="back" [routerLink]="'/'+kind"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> {{feature.title}}</a>@if(loading()){<p role="status">Chargement…</p>}@if(error()){<div class="empty"><p class="error" role="alert">{{error()}}</p><button class="secondary" type="button" (click)="load()">Réessayer</button></div>}@if(row();as item){@if(kind==='clients'||kind==='sessions'){<app-photo class="detail-photo" name="detail-header" />}<div class="page-heading"><div><p class="eyebrow">{{feature.singular}}</p><h1>{{title(item)}}</h1><p>{{kind==='payments'?money(item['montant']):feature.description}}</p></div><div class="actions"><a class="button primary" [routerLink]="'/'+kind+'/'+id+'/edit'">Modifier</a>@if(kind==='clients'){<a class="button secondary" [routerLink]="'/clients/'+id+'/performance'"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Performance</a><a class="button secondary" [routerLink]="'/progress/'+id">Mesures</a>}@if(kind==='payments'||kind==='clients'){<button class="secondary" [disabled]="busy()" (click)="download()">Télécharger le PDF</button>}</div></div><section class="panel detail-grid">@for(field of feature.fields;track field.key){<div><dt>{{field.label}}</dt><dd>{{value(item,field.key)}}</dd></div>}@if(item['statut']){<div><dt>Statut</dt><dd class="badge">{{display(item['statut'])}}</dd></div>}</section>@if(kind==='clients'){<app-client-access [clientId]="id" [email]="display(item['email'])==='—'?'':display(item['email'])" /><app-client-sessions [clientId]="id" /><section class="panel data-rights" aria-labelledby="data-title"><h2 id="data-title">Données de ce client</h2><p class="muted">Toutes les données de ce client, dans un fichier JSON.</p><div class="actions"><button type="button" class="secondary" [disabled]="busy()" (click)="exportData()"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Exporter les données</button></div><p class="muted">Archiver masque le client sans rien effacer. Supprimer efface tout, définitivement.</p><div class="actions"><button type="button" class="quiet danger" [disabled]="busy()" data-testid="erase-open" (click)="openErase()">Supprimer définitivement ce client</button></div></section>}@if(kind==='sessions'){<section class="panel"><h2>Statut de la séance</h2><div class="actions">@for(s of statuses;track s){<button class="secondary" [disabled]="busy()||item['statut']===s" (click)="setStatus(s)">{{display(s)}}</button>}</div></section>}<div class="actions"><button class="quiet danger" [disabled]="busy()" (click)="remove()">{{kind==='clients'?'Archiver ce client':'Supprimer ce '+feature.singular}}</button></div>}@if(erasing()){<div class="modal-backdrop"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="erase-title" aria-describedby="erase-desc" appFocusTrap (escape)="closeErase()" data-testid="erase-dialog"><h2 id="erase-title">Supprimer définitivement ce client ?</h2><p id="erase-desc">Cette action est irréversible. Elle efface {{label()}} et toutes ses données : séances (effectuées comprises), paiements, mesures, entraînements, récurrences et rappels. Pour garder l’historique, utilisez plutôt « Archiver ». Pensez à exporter les données avant.</p><label for="erase-name">Saisissez « {{label()}} » pour confirmer</label><input id="erase-name" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" data-autofocus [value]="typed()" (input)="typed.set($any($event.target).value)" (keydown.enter)="erase()"><div class="actions"><button type="button" class="secondary" (click)="closeErase()" [disabled]="busy()">Annuler</button><button type="button" class="danger-button" (click)="erase()" [disabled]="busy()||!nameMatches()" data-testid="erase-confirm">{{busy()?'Suppression…':'Supprimer définitivement'}}</button></div></section></div>}`})
export class DetailPage {
 private route=inject(ActivatedRoute);private router=inject(Router);private api=inject(Api);private toast=inject(Toast);private theme=inject(Theme);private confirm=inject(Confirm);private privacy=inject(Privacy);kind=this.route.snapshot.data['kind'] as string;id=this.route.snapshot.paramMap.get('id')!;feature=features[this.kind];row=signal<Row|null>(null);loading=signal(true);busy=signal(false);error=signal('');erasing=signal(false);typed=signal('');display=display;money=money;statuses=['PLANIFIEE','EFFECTUEE','ANNULEE'];
 constructor(){void this.load();} title(row:Row){return this.kind==='clients'?[row['prenom'],row['nom']].join(' '):this.kind==='sessions'?display(row['titre']):'Détail du paiement';}
 value(row:Row,key:string){if(key==='client_id')return display(row['clients'])!=='—'?display(row['clients']):display(row[key]);if(key==='montant')return money(row[key]);if(key.includes('date'))return dateLabel(row[key]);return display(row[key]);}
 async load(){this.error.set('');try{this.row.set(await this.api.get<Row>(this.kind+'/'+this.id));}catch(e){this.error.set(errorText(e));}finally{this.loading.set(false);}}
 /** Désignation courte de l'élément affiché, utilisée dans le détail des toasts. */
 label(){
  const item=this.row();if(!item)return '';
  if(this.kind==='clients')return this.title(item);
  const who=display(item['clients'])!=='—'?display(item['clients']):'';
  if(this.kind==='sessions')return [display(item['titre']),who].filter(Boolean).join(', ');
  return [this.privacy.hidden()?'':money(item['montant']),who].filter(Boolean).join(', ');
 }
 async setStatus(statut:string,confirmed=false){
  const label=this.label();
  const ask=({PLANIFIEE:{title:'Remettre cette séance au planning ?',detail:'La séance repasse au statut Planifiée.',confirmLabel:'Remettre au planning',tone:'normal'},EFFECTUEE:{title:'Marquer cette séance effectuée ?',detail:(label?label+'. ':'')+'Elle sera comptée dans l’historique du client.',confirmLabel:'Marquer effectuée',tone:'normal'},ANNULEE:{title:'Annuler cette séance ?',detail:(label?label+'. ':'')+'Elle restera visible dans l’historique, marquée comme annulée.',confirmLabel:'Annuler la séance',tone:'sensitive'}} as Record<string,ConfirmOptions>)[statut];
  if(!confirmed&&ask&&!(await this.confirm.ask(ask)))return;
  this.busy.set(true);
  try{
   await this.api.write('PATCH','sessions/'+this.id+'/status',{statut});await this.load();
   this.toast.success(({PLANIFIEE:'Séance planifiée',EFFECTUEE:'Séance effectuée',ANNULEE:'Séance annulée'} as Record<string,string>)[statut]??'Statut modifié',label);
  }catch(e){this.toast.fail('Statut non modifié',e,()=>void this.setStatus(statut,true));}
  finally{this.busy.set(false);}
 }
 async download(){
  const name='coachsen-'+this.id+'.pdf';this.busy.set(true);
  this.toast.info('Préparation du PDF','Le téléchargement démarre.',{key:'download'});
  try{
   await this.api.download('exports/'+(this.kind==='clients'?'client':'payment')+'/'+this.id+'?theme='+this.theme.current(),name);
   this.toast.dismissKey('download');this.toast.success('PDF téléchargé',this.label());
  }catch(e){this.toast.dismissKey('download');this.toast.fail('PDF non téléchargé',e,()=>void this.download());}
  finally{this.busy.set(false);}
 }
 nameMatches(){const item=this.row();return !!item&&this.typed().trim()===this.title(item);}
 openErase(){this.typed.set('');this.erasing.set(true);}
 closeErase(){if(!this.busy())this.erasing.set(false);}
 async exportData(){
  const label=this.label();
  if(!(await this.confirm.ask({title:'Exporter les données de ce client ?',detail:'Le fichier contient des données personnelles : gardez-le en lieu sûr.',confirmLabel:'Exporter',tone:'sensitive'})))return;const slug=label.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||this.id;
  this.busy.set(true);this.toast.info('Préparation de l’export','Le téléchargement démarre.',{key:'download'});
  try{
   await this.api.download('clients/'+this.id+'/export','coachsen-client-'+slug+'.json');
   this.toast.dismissKey('download');this.toast.success('Données exportées',label);
  }catch(e){this.toast.dismissKey('download');this.toast.fail('Données non exportées',e,()=>void this.exportData());}
  finally{this.busy.set(false);}
 }
 /** Effacement définitif : le serveur vérifie lui aussi le nom exact ; le succès n'est annoncé qu'après sa confirmation. */
 async erase(){
  const item=this.row();if(!item||this.busy()||!this.nameMatches())return;
  const label=this.label();this.busy.set(true);
  try{
   await this.api.write('POST','clients/'+this.id+'/erase',{confirmation:this.title(item)});
   this.erasing.set(false);await this.router.navigateByUrl('/clients');
   this.toast.success('Client supprimé définitivement',label+' et toutes ses données ont été effacés.');
  }catch(e){this.toast.fail('Client non supprimé',e,()=>void this.erase());}
  finally{this.busy.set(false);}
 }
 async remove(confirmed=false){
  if(this.busy())return;const label=this.label();const client=this.kind==='clients';
  const noun=this.kind==='sessions'?'cette séance':this.kind==='payments'?'ce paiement':'ce client';
  if(!confirmed&&!(await this.confirm.ask({title:client?'Archiver ce client ?':this.kind==='sessions'?'Supprimer cette séance ?':'Supprimer ce paiement ?',detail:(label?label+'. ':'')+(client?'Il ne figurera plus dans votre liste active ; ses données sont conservées.':'La suppression de '+noun+' est définitive.'),confirmLabel:client?'Archiver le client':this.kind==='sessions'?'Supprimer la séance':'Supprimer le paiement',tone:'sensitive'})))return;
  this.busy.set(true);
  try{
   await this.api.write('DELETE',this.kind+'/'+this.id);await this.router.navigateByUrl('/'+this.kind);
   this.toast.success(({clients:'Client archivé',sessions:'Séance supprimée',payments:'Paiement supprimé'} as Record<string,string>)[this.kind]??'Élément supprimé',label);
  }catch(e){this.toast.fail(this.kind==='clients'?'Client non archivé':this.kind==='sessions'?'Séance non supprimée':'Paiement non supprimé',e,()=>void this.remove(true));}
  finally{this.busy.set(false);}
 }
}
