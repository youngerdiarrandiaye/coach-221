import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Row, errorText, display, money, dateLabel } from '../core/api';
import { Toast } from '../core/toast';
import { features, Field } from '../shared/features';
import { AvatarComponent } from '../shared/avatar.component';
import { ClientPicker } from '../shared/client-picker';
import { ThemePicker } from '../shared/theme-picker';
import { ReminderSettingsComponent } from '../shared/reminder-settings';
import { helpFor } from '../shared/help';
import { Rum } from '../core/rum';
import { FormDefaults } from '../core/form-defaults';
import { VoiceIntent, VoicePrefill } from '../core/voice-prefill';
@Component({standalone:true,imports:[ReactiveFormsModule,RouterLink,AvatarComponent,ThemePicker,ReminderSettingsComponent,ClientPicker],template:`<a class="back" [routerLink]="back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Retour</a><div class="page-heading"><div><p class="eyebrow">VOTRE ACTIVITÉ</p><h1>{{kind==='profile'?'Mon profil':(id?'Modifier':'Ajouter')+' '+article+' '+feature.singular}}</h1><p>{{feature.description}}</p></div></div>@if(loading()){<p role="status">Chargement…</p>}@else if(loadError()){<div class="empty"><p class="error" role="alert">{{loadError()}}</p><button class="secondary" type="button" (click)="load()">Réessayer</button></div>}@else{@if(kind==='profile'){<app-avatar /><app-theme-picker /><app-reminder-settings />}@if(voiceNote()){<p class="auto-note voice-note" data-testid="voice-note"><i class="fa-solid fa-microphone" aria-hidden="true"></i> Rempli par la voix. Vérifiez avant d’enregistrer.</p>}@if(hint()){<p class="auto-note"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> {{hint()}}</p>}<form class="panel form-grid" [formGroup]="form" (ngSubmit)="save()">@for(field of fields;track field.key){<div [class.wide]="field.type==='textarea'||field.type==='days'"><label [for]="field.key">{{field.label}} @if(field.required){<span aria-label="obligatoire">*</span>}</label>@if(help(field);as h){<small class="field-help" [id]="field.key+'-help'">{{h.hint}}</small>@if(h.more){<details class="field-more"><summary>En savoir plus</summary><p>{{h.more}}</p></details>}}@if(field.type==='client'){<app-client-picker [clients]="clients()" [selected]="form.controls[field.key].value" [inputId]="field.key" [invalid]="invalid(field)" (picked)="pickClient($event.id)" (blurred)="form.controls[field.key].markAsTouched()" />}@else if(field.options){<select [id]="field.key" [formControlName]="field.key"><option value="">Sélectionner</option>@for(option of field.options;track option){<option [value]="option">{{display(option)}}</option>}</select>}@else if(field.type==='textarea'){<textarea [id]="field.key" [formControlName]="field.key" rows="4"></textarea>}@else if(field.type==='days'){<div class="day-picker">@for(day of days;track $index){<label><input type="checkbox" [checked]="selectedDays().includes($index)" (change)="toggleDay($index)">{{day}}</label>}</div>}@else{<input [id]="field.key" [type]="field.type||'text'" [formControlName]="field.key" [attr.autocomplete]="ac(field)" [attr.inputmode]="mode(field)" [attr.list]="field.key==='titre'&&titles().length?'titles-list':null" enterkeyhint="next" [attr.min]="field.type==='number'?field.min:null" [attr.max]="field.type==='number'?field.max:null" [attr.minlength]="field.type!=='number'?field.min:null" [attr.maxlength]="field.type!=='number'?field.max:null" [attr.step]="field.type==='number'?step(field):null" [attr.aria-invalid]="invalid(field)" [attr.aria-describedby]="describedBy(field)">}@if(invalid(field)){<small class="error" [id]="field.key+'-error'">{{field.label}} : valeur requise ou invalide{{field.min?' (minimum '+field.min+')':''}}.</small>}</div>}@if(titles().length){<datalist id="titles-list">@for(t of titles();track t){<option [value]="t"></option>}</datalist>}<div class="wide">@if(error()){<p class="error" role="alert">{{error()}}</p>}<div class="actions"><button class="primary" [disabled]="busy()">{{busy()?'Enregistrement…':'Enregistrer'}}</button><a class="button secondary" [routerLink]="back">Annuler</a></div></div></form>}`})
export class EditPage {
 private route=inject(ActivatedRoute);private router=inject(Router);private api=inject(Api);private rum=inject(Rum);private toast=inject(Toast);private defaults=inject(FormDefaults);private voice=inject(VoicePrefill);
 kind=this.route.snapshot.data['kind'] as string;feature=features[this.kind];id=this.route.snapshot.paramMap.get('id');clientId=this.route.snapshot.paramMap.get('clientId');article=['séance','récurrence','mesure'].includes(features[this.kind].singular)?'une':'un';fields:Field[]=this.kind==='progress'&&!this.clientId?[{key:'client_id',label:'Client',type:'client',required:true} as Field,...features['progress'].fields]:features[this.kind].fields;back=this.kind==='profile'?'/dashboard':this.kind==='recurrences'?'/sessions/recurrences':this.kind==='progress'?(this.clientId?'/progress/'+this.clientId:'/progress'):'/'+this.kind;
 form=new FormGroup<Record<string,FormControl<string>>>({});clients=signal<Row[]>([]);clientText=signal('');titles=signal<string[]>([]);loading=signal(true);hint=signal('');/** Formulaire prérempli par la dictée : note affichée, suggestions d'historique coupées (les champs manquants restent vides). */voiceNote=signal(false);busy=signal(false);error=signal('');/** Échec de chargement de la page (avec bouton Réessayer). */loadError=signal('');selectedDays=signal<number[]>([]);days=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];display=display;
 constructor(){for(const f of this.fields){const validators=[];if(f.required)validators.push(Validators.required);if(f.type==='email')validators.push(Validators.email);if(f.min!==undefined)validators.push(f.type==='number'?Validators.min(f.min):Validators.minLength(f.min));if(f.max!==undefined)validators.push(f.type==='number'?Validators.max(f.max):Validators.maxLength(f.max));this.form.addControl(f.key,new FormControl(this.initial(f),{nonNullable:true,validators}));}void this.load();effect(()=>{const n=this.voice.arrived();untracked(()=>{if(n>0&&!this.loading())this.applyVoice();});});}
 initial(f:Field){if(f.key==='date_paiement'||f.key==='mesure_date'||f.key==='date_debut')return new Date().toISOString().slice(0,10);if(f.key==='statut')return 'PAYE';if(f.key==='duree_minutes')return '60';if(f.key==='heure')return '09:00';return '';}
 help(f:Field){return helpFor(this.kind,f.key);}
 describedBy(f:Field){const ids=[this.help(f)?f.key+'-help':'',this.invalid(f)?f.key+'-error':''].filter(Boolean).join(' ');return ids||null;}
 fullName(c:Row){return [c['prenom'],c['nom']].filter(Boolean).join(' ');}
 /** Autocomplétion du navigateur : les données d'un client ne doivent jamais être remplies avec celles du coach. */
 ac(f:Field){if(this.kind==='profile')return ({prenom:'given-name',nom:'family-name',telephone:'tel'} as Record<string,string>)[f.key]??'off';return 'off';}
 mode(f:Field){if(f.type==='tel')return 'tel';if(f.type==='email')return 'email';if(f.type==='number')return this.step(f)==='1'?'numeric':'decimal';return null;}
 /** Suggestion en cours : l'enregistrement l'attend (4 s au plus) pour ne pas valider un formulaire qu'elle va remplir. */
 private suggesting:Promise<void>|null=null;
 pickClient(id:string){if(id)this.chooseClient(id);else this.form.controls['client_id'].setValue('');}
 chooseClient(id:string){const c=this.clients().find(x=>x.id===id);if(!c)return;this.clientText.set(this.fullName(c));this.form.controls['client_id'].setValue(id);this.suggest(id);}
 private suggest(id:string){const run=this.suggestFor(id).finally(()=>{if(this.suggesting===run)this.suggesting=null;});this.suggesting=run;}
 /** Suggestions tirées de l'historique du client. Elles ne remplacent jamais ce que le coach a déjà saisi. */
 private async suggestFor(clientId:string){
  if(this.id||this.voiceNote()||(this.kind!=='payments'&&this.kind!=='sessions'&&this.kind!=='recurrences'&&this.kind!=='progress'))return;
  try{
   const fill=(key:string,value:unknown)=>{const c=this.form.controls[key];if(c&&c.pristine&&value!=null&&value!=='')c.setValue(String(value));};
   // Une seule petite requête : dernier paiement, dernière séance et dernière mesure de ce client.
   const d=await this.defaults.forClient(clientId);
   if(this.form.controls['client_id']&&this.form.controls['client_id'].value!==clientId)return;
   if(this.kind==='progress'){
    const last=d.last_progress;
    if(last){for(const f of this.fields){if(f.key==='mesure_date'||f.key==='notes'||f.key==='client_id')continue;fill(f.key,last[f.key]);}this.hint.set('Repris de la dernière mesure ('+dateLabel(last['mesure_date'])+').');}else this.hint.set('');
   }else if(this.kind==='payments'){
    const last=d.last_payment;
    if(last){fill('montant',last.montant);fill('methode',last.methode);this.hint.set('Montant et mode repris du dernier paiement ('+dateLabel(last.date_paiement)+').');}else this.hint.set('');
   }else{
    const last=d.last_session;
    if(last){fill('titre',last.titre);fill('duree_minutes',last.duree_minutes);this.hint.set('Titre et durée repris de la dernière séance.');}else this.hint.set('');
   }
  }catch{/* la suggestion est un confort : le formulaire reste utilisable sans */}
 }
 /** Applique la dictée : seulement les champs reconnus, jamais par-dessus une saisie du coach, jamais d'enregistrement. */
 private applyVoice(){
  const intent=({clients:'client',payments:'payment',sessions:'session',progress:'measure'} as Record<string,VoiceIntent>)[this.kind];
  if(!intent||this.id)return;
  const v=this.voice.take(intent);if(!v)return;
  this.voiceNote.set(true);
  for(const f of this.fields){
   if(f.type==='client'||f.type==='days')continue;
   const c=this.form.controls[f.key];let raw=v.fields[f.key];
   if(!c||raw==null||raw===''||!c.pristine)continue;
   let text=String(raw);
   if(f.type==='number'){if(!Number.isFinite(Number(raw)))continue;}
   else if(f.type==='date'){if(!/^\d{4}-\d{2}-\d{2}/.test(text))continue;text=text.slice(0,10);}
   else if(f.type==='datetime-local'){const d=new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(text)?text:text+'Z');if(Number.isNaN(d.getTime()))continue;text=d.toISOString().slice(0,16);}
   else if(f.options){if(!f.options.includes(text)||text==='ANNULE')continue;}
   else if(f.max&&text.length>f.max)text=text.slice(0,f.max);
   c.setValue(text);c.markAsDirty();
  }
  const cc=this.form.controls['client_id'];
  if(cc&&cc.pristine&&v.clientId&&this.clients().some(c=>c.id===v.clientId)){this.chooseClient(v.clientId);cc.markAsDirty();}
 }
 step(f:Field){return f.key==='montant'||f.key==='duree_minutes'||f.key.includes('bpm')?'1':'0.1';}
 invalid(f:Field){return this.form.controls[f.key].invalid&&this.form.controls[f.key].touched;}
 toggleDay(day:number){this.selectedDays.update(a=>a.includes(day)?a.filter(x=>x!==day):[...a,day]);this.form.controls['jours'].setValue(this.selectedDays().join(','));}
 async load(){this.loading.set(true);this.loadError.set('');try{if(this.fields.some(f=>f.type==='client')){this.clients.set(await this.api.get<Row[]>('clients'));if(!this.id&&!this.route.snapshot.queryParamMap.get('clientId')&&this.clients().length===1)this.chooseClient(this.clients()[0].id);}if((this.kind==='sessions'||this.kind==='recurrences')&&!this.id){try{this.titles.set((await this.defaults.titles()).filter(t=>typeof t==='string'&&t.trim()));}catch{/* titres fréquents facultatifs */}}if(this.kind==='sessions'&&!this.id){const requested=this.route.snapshot.queryParamMap.get('clientId');if(requested&&this.clients().some(client=>client.id===requested))this.chooseClient(requested);const day=this.route.snapshot.queryParamMap.get('date');if(day&&/^\d{4}-\d{2}-\d{2}$/.test(day))this.form.controls['date_heure'].setValue(day+'T09:00');else if(!this.form.controls['date_heure'].value){const next=new Date(Date.now()+3600000);next.setUTCMinutes(0,0,0);this.form.controls['date_heure'].setValue(next.toISOString().slice(0,16));}}if(this.kind==='progress'&&!this.id&&this.clientId){let last:Record<string,unknown>|null=null;try{last=(await this.defaults.forClient(this.clientId)).last_progress;}catch{/* reprise facultative */}if(last){for(const f of this.fields){if(f.key==='mesure_date'||f.key==='notes')continue;const v=last[f.key];if(v!=null)this.form.controls[f.key].setValue(String(v));}this.hint.set('Repris de la dernière mesure ('+dateLabel(last['mesure_date'])+').');}}if(this.id||this.kind==='profile'){const row=await this.api.get<Row>(this.kind+(this.id?'/'+this.id:''));for(const f of this.fields){let value=row[f.key];if(f.key==='date_heure'&&value)value=String(value).slice(0,16);this.form.controls[f.key].setValue(value==null?'':String(value));}const cid=this.form.controls['client_id']?.value;const known=this.clients().find(c=>c.id===cid);if(known)this.clientText.set(this.fullName(known));}this.applyVoice();}catch(e){this.loadError.set(errorText(e));}finally{this.loading.set(false);}}
 async save(){if(this.busy())return;if(this.suggesting){this.busy.set(true);await Promise.race([this.suggesting,new Promise(r=>setTimeout(r,4000))]);this.busy.set(false);}this.form.markAllAsTouched();if(this.form.invalid){this.error.set('Veuillez corriger les champs signalés.');return;}const body:Record<string,unknown>={...this.form.getRawValue()};if(this.kind==='payments'&&!/^\d+$/.test(String(body['montant']))){this.error.set('Le montant FCFA doit être un entier positif.');return;}for(const f of this.fields){if((f.options||f.type==='client')&&!body[f.key]&&!f.required)delete body[f.key];}if(this.kind==='recurrences')body['jours']=this.selectedDays();if(this.kind==='progress'&&this.clientId)body['client_id']=this.clientId;this.busy.set(true);this.error.set('');try{await this.api.write(this.id||this.kind==='profile'?'PATCH':'POST',this.kind+(this.id?'/'+this.id:''),body);if(this.kind==='profile')this.toast.success('Profil enregistré','Vos informations sont à jour.');
   else{if(!this.id)this.rum.completeTask(this.kind+'_creation');await this.router.navigateByUrl(this.kind==='progress'&&!this.clientId?'/progress/'+String(body['client_id']):this.back);this.toast.success(this.doneTitle(),this.summary(body));}
  }catch(e){this.toast.fail(this.failTitle(),e,()=>void this.save());}finally{this.busy.set(false);}}
 /** Titre du toast de succès : même vocabulaire que le bouton (Enregistrer, Ajouter, Planifier). */
 private doneTitle(){
  const edit=!!this.id;
  return ({clients:edit?'Client modifié':'Client ajouté',sessions:edit?'Séance modifiée':'Séance planifiée',payments:edit?'Paiement modifié':'Paiement enregistré',recurrences:'Récurrence ajoutée',progress:'Mesure ajoutée'} as Record<string,string>)[this.kind]??'Enregistré';
 }
 private failTitle(){
  const edit=!!this.id;
  return ({clients:edit?'Client non modifié':'Client non ajouté',sessions:edit?'Séance non modifiée':'Séance non planifiée',payments:edit?'Paiement non modifié':'Paiement non enregistré',recurrences:'Récurrence non ajoutée',progress:'Mesure non ajoutée',profile:'Profil non enregistré'} as Record<string,string>)[this.kind]??'Enregistrement impossible';
 }
 /** Détail concret de ce qui a été enregistré, par exemple « 25 000 FCFA, Wave, Adam Carter ». */
 private summary(body:Record<string,unknown>){
  const client=this.clients().find(c=>c.id===body['client_id']);
  const who=client?[client['prenom'],client['nom']].join(' '):'';
  const date=(v:unknown)=>{const t=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(t)?new Intl.DateTimeFormat('fr-SN',{timeZone:'UTC',dateStyle:'medium'}).format(new Date(t.slice(0,10)+'T12:00:00Z')):'';};
  const parts:(string|undefined)[]=[];
  switch(this.kind){
   case 'clients':parts.push([body['prenom'],body['nom']].join(' '));break;
   case 'payments':parts.push(money(body['montant']),({ESPECES:'Espèces',WAVE:'Wave',ORANGE_MONEY:'Orange Money'} as Record<string,string>)[String(body['methode'])],who);break;
   case 'sessions':{const t=String(body['date_heure']||'');parts.push(String(body['titre']||''),who,[date(t),t.slice(11,16)].filter(Boolean).join(' à '));break;}
   case 'recurrences':parts.push(String(body['titre']||''),who,(body['jours'] as number[]).map(i=>this.days[i]).join(', ')+' à '+String(body['heure']||'').slice(0,5));break;
   case 'progress':parts.push(who||undefined,body['poids_kg']?body['poids_kg']+' kg':undefined,date(body['mesure_date']));break;
  }
  return parts.filter(Boolean).join(', ');
 }
}
