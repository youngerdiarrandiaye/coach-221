import { Component, inject, signal } from '@angular/core';
import { Api, Auth } from '../core/api';
import { Confirm } from '../core/confirm';
import { Toast } from '../core/toast';

@Component({
 selector: 'app-avatar', standalone: true,
 template: `<section class="panel" aria-labelledby="avatar-title">
  <h2 id="avatar-title">Photo de profil</h2>
  @if(auth.profile()?.['avatar_url']; as url){<img [src]="url" alt="Photo de profil" width="80" height="80">}
  <label for="avatar">Changer la photo de profil</label>
  <p id="avatar-help">JPEG, PNG ou WebP, 5 Mo maximum.</p>
  <input id="avatar" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="avatar-help" [disabled]="busy()" (change)="upload($event)">
  @if(busy()){<p role="status">Envoi de la photo…</p>}
  @if(error()){<p class="error" role="alert">{{error()}}</p>}
 </section>`,
 styles: [`img{display:block;object-fit:cover;border-radius:50%;margin-bottom:16px}input{max-width:420px}`],
})
export class AvatarComponent {
 auth=inject(Auth);private api=inject(Api);private toast=inject(Toast);private confirm=inject(Confirm);busy=signal(false);/** Erreur de validation du fichier choisi, affichée à côté du champ. */error=signal('');
 async upload(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0];
  if(!file||this.busy())return;
  this.error.set('');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024){
   this.error.set('Choisissez une image JPEG, PNG ou WebP de 5 Mo maximum.');input.value='';return;
  }
  if(!(await this.confirm.ask({title:'Changer la photo de profil ?',detail:'La photo « '+file.name+' » remplacera votre photo actuelle.',confirmLabel:'Changer la photo'}))){input.value='';return;}
  this.busy.set(true);
  try{
   const form=new FormData();form.set('avatar',file);
   const result=await this.api.write<{url:string}>('POST','profile/avatar',form);
   this.auth.profile.update(profile=>profile?{...profile,avatar_url:result.url}:profile);
   this.toast.success('Photo de profil modifiée',file.name);
  }catch(error){this.toast.fail('Photo non enregistrée',error);}
  finally{this.busy.set(false);input.value='';}
 }
}
