import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Auth, describeError, retryAfterSeconds, waitLabel } from '../core/api';
import { Toast } from '../core/toast';
import { Photo } from '../shared/photo';
@Component({standalone:true,imports:[ReactiveFormsModule,RouterLink,Photo],template:`<div class="auth-wrap"><section class="auth-story"><app-photo class="auth-photo" name="login-hero" /><a class="brand" routerLink="/"><span class="brand-icon" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>coach<span>sen.</span></a><p class="eyebrow">LE MOUVEMENT COMMENCE ICI</p><h1>Vous coachez.<br><em>On simplifie.</em></h1><p>Votre énergie appartient au terrain.<br>Vos clients, vos séances et vos paiements sont ici.</p><div class="auth-art" aria-hidden="true"><svg viewBox="0 0 620 300" fill="none"><defs><pattern id="auth-pattern" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M24 2 46 24 24 46 2 24Z M24 12 36 24 24 36 12 24Z" stroke="#d5f548" stroke-opacity=".12"/></pattern></defs><path fill="url(#auth-pattern)" d="M330-70h300v430H330z"/><g transform="rotate(-24 310 150)" stroke="#d5f548"><rect x="50" y="25" width="500" height="240" rx="120" stroke-opacity=".25"/><rect x="63" y="38" width="474" height="214" rx="107" stroke-opacity=".4"/><rect x="76" y="51" width="448" height="188" rx="94" stroke-opacity=".6"/><rect x="89" y="64" width="422" height="162" rx="81"/><rect x="102" y="77" width="396" height="136" rx="68" stroke-width="2"/><rect x="115" y="90" width="370" height="110" rx="55" stroke-opacity=".7"/><path d="M360 25v65 M370 25v65" stroke-opacity=".7"/><circle cx="215" cy="214" r="9" fill="#d5f548" stroke="#123c30" stroke-width="4"/></g><path d="M477 105v58 M448 134h58 M457 114l40 40 M457 154l40-40" stroke="#d5f548" stroke-width="6"/></svg><span class="auth-art-caption">DU PREMIER PAS. AU PROCHAIN NIVEAU.</span></div><div class="auth-story-footer"><span><i class="senegal-flag" aria-hidden="true"></i> Pensé pour les coachs du Sénégal</span><span>DAKAR · SN</span></div></section><section class="auth-card"><div class="auth-index"><span></span> VOTRE ESPACE. VOTRE ÉLAN.</div><h2>{{title}}</h2>@if(mode==='check-email'){<p>Consultez votre boîte de réception et suivez le lien reçu pour continuer.</p><a routerLink="/login">Retour à la connexion</a>}@else{<p class="muted">{{subtitle}}</p><form [formGroup]="form" (ngSubmit)="submit()">@if(mode==='register'){<label>Prénom<input formControlName="prenom" autocomplete="given-name" required></label><label>Nom<input formControlName="nom" autocomplete="family-name" required></label>}@if(mode!=='update-password'){<label>Adresse e-mail<input type="email" formControlName="email" [attr.autocomplete]="mode==='login'?'username':'email'" inputmode="email" autocapitalize="none" spellcheck="false" required></label>}@if(mode!=='reset-password'){<label>Mot de passe<input type="password" formControlName="password" [attr.autocomplete]="mode==='login'?'current-password':'new-password'" required [attr.minlength]="mode==='login'?1:10"></label>@if(mode!=='login'){<small>Au moins 10 caractères. Évitez les mots de passe courants et ceux bâtis sur votre nom.</small><label>Confirmer le mot de passe<input type="password" formControlName="confirm" autocomplete="new-password" required></label>}}@if(error()){<p class="error" role="alert">{{error()}}</p>}<button class="primary" [disabled]="busy()">{{busy()?'Veuillez patienter…':button}}</button></form><div class="auth-links">@if(mode==='login'){<a routerLink="/reset-password">Mot de passe oublié ?</a><p>Pas encore de compte ? <a routerLink="/register">Créer mon compte</a></p><p><a routerLink="/installer">Installer l’application sur mon téléphone</a></p>}@else{<a routerLink="/login">Retour à la connexion</a>}</div>}</section></div>`})
export class AuthPage {
 private route=inject(ActivatedRoute);private router=inject(Router);private api=inject(Api);private auth=inject(Auth);private toast=inject(Toast);private blockedUntil=0;
 mode=this.route.snapshot.data['mode'] as string;busy=signal(false);/** Erreurs de validation du formulaire uniquement : les résultats d'action passent par les toasts. */error=signal('');
 form=new FormGroup({confirm:new FormControl('',{nonNullable:true}),email:new FormControl('',{nonNullable:true}),password:new FormControl('',{nonNullable:true}),nom:new FormControl('',{nonNullable:true}),prenom:new FormControl('',{nonNullable:true})});
 get title(){return ({login:'Heureux de vous retrouver',register:'Créez votre espace coach','reset-password':'Réinitialiser le mot de passe','update-password':'Choisissez un nouveau mot de passe','check-email':'Vérifiez votre e-mail'} as Record<string,string>)[this.mode];}
 get subtitle(){return this.mode==='login'?'Connectez-vous à votre espace personnel.':'Prenez le contrôle de votre activité.';}
 get button(){return ({login:'Se connecter',register:'Créer mon compte','reset-password':'Envoyer le lien','update-password':'Enregistrer le mot de passe'} as Record<string,string>)[this.mode];}
 constructor(){if(this.mode==='register'||this.mode==='update-password')this.form.controls.confirm.setValidators([Validators.required]);if(this.mode!=='update-password')this.form.controls.email.setValidators([Validators.required,Validators.email]);if(this.mode!=='reset-password')this.form.controls.password.setValidators([Validators.required,Validators.minLength(this.mode==='login'?1:10)]);if(this.mode==='register'){this.form.controls.nom.setValidators([Validators.required,Validators.minLength(2)]);this.form.controls.prenom.setValidators([Validators.required,Validators.minLength(2)]);}}
 async submit(){
  if(this.busy())return;
  // Délai imposé par le serveur (429) : inutile de renvoyer la demande avant la fin.
  const left=Math.ceil((this.blockedUntil-Date.now())/1000);
  if(left>0){this.error.set('Trop de tentatives. Réessayez dans '+waitLabel(left)+'.');return;}
  if(this.form.invalid){this.form.markAllAsTouched();this.error.set('Vérifiez les champs : e-mail valide, nom et prénom de 2 caractères'+(this.mode==='login'?', mot de passe requis.':', mot de passe de 10 caractères minimum.'));return;}
  if((this.mode==='register'||this.mode==='update-password')&&this.form.controls.password.value!==this.form.controls.confirm.value){this.error.set('Les mots de passe ne correspondent pas.');return;}
  this.busy.set(true);this.error.set('');
  try{
   const result=await this.api.write<{needsConfirmation?:boolean}>('POST','auth/'+this.mode,this.form.getRawValue());
   if(this.mode==='login'){
    // Pas de toast : la redirection vers le tableau de bord confirme déjà la connexion.
    await this.auth.refresh();await this.router.navigateByUrl('/dashboard');
   }else if(this.mode==='register'&&result.needsConfirmation===false){
    await this.auth.refresh();await this.router.navigateByUrl('/dashboard');
    this.toast.success('Compte créé','Bienvenue sur CoachSen.');
   }else if(this.mode==='register'){
    await this.router.navigateByUrl('/check-email');
    this.toast.success('Compte créé','Confirmez votre adresse e-mail pour vous connecter.');
   }else if(this.mode==='update-password'){
    this.toast.success('Mot de passe enregistré','Vous pouvez vous connecter.');
   }else{
    await this.router.navigateByUrl('/check-email');
    this.toast.success('Lien envoyé','Consultez la boîte de réception de '+this.form.controls.email.value+'.');
   }
  }catch(e){
   const wait=retryAfterSeconds(e);
   if(wait){this.blockedUntil=Date.now()+wait*1000;const info=describeError(e);this.error.set(info.message+' '+info.hint);}
   this.toast.fail(this.failure,e,()=>void this.submit());
  }
  finally{this.busy.set(false);}
 }
 private get failure(){return ({login:'Connexion échouée',register:'Compte non créé','reset-password':'Lien non envoyé','update-password':'Mot de passe non enregistré'} as Record<string,string>)[this.mode];}
}
