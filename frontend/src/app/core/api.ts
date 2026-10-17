import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CanActivateFn, Router } from '@angular/router';
export type Row = Record<string, unknown> & { id: string };
export interface User { id: string; email?: string }
export interface Session { user: User | null; profile: Row | null }
@Injectable({providedIn:'root'})
export class Api {
 private http=inject(HttpClient);
 async get<T>(path:string):Promise<T>{return (await firstValueFrom(this.http.get<{data:T}>('/api/v1/'+path))).data;}
 /** `headers` : en-têtes supplémentaires (par exemple Idempotency-Key pour la saisie d'entraînement). */
 async write<T>(method:string,path:string,body:unknown={},headers:Record<string,string>={}):Promise<T>{return (await firstValueFrom(this.http.request<{data:T}>(method,'/api/v1/'+path,{body,headers:{...headers,'X-CoachSen-Client':'angular'}}))).data;}
 async download(path:string,name:string){const blob=await firstValueFrom(this.http.get('/api/v1/'+path,{responseType:'blob'}));const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export interface ErrorInfo { message: string; hint: string; retryable: boolean; /** Délai d'attente imposé par le serveur (429), en secondes. */ retryAfter?: number }
/** Délai (secondes) demandé par le serveur : corps `retry_after`, sinon en-tête Retry-After. */
export function retryAfterSeconds(error: unknown): number | undefined {
 if (!(error instanceof HttpErrorResponse) || error.status !== 429) return undefined;
 const fromBody = Number(error.error?.error?.retry_after);
 const fromHeader = Number(error.headers?.get('Retry-After'));
 const seconds = Number.isFinite(fromBody) && fromBody > 0 ? fromBody : Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 0;
 return seconds > 0 ? Math.ceil(seconds) : undefined;
}
/** « 42 secondes », « 1 seconde », « 5 minutes » : durée lisible d'une attente. */
export function waitLabel(seconds: number): string {
 const s = Math.max(1, Math.ceil(seconds));
 if (s >= 120) return Math.ceil(s / 60) + ' minutes';
 return s + (s > 1 ? ' secondes' : ' seconde');
}
const sentence = (text: string) => { const t = text.trim(); return /[.!?…]$/.test(t) ? t : t + '.'; };
/** Traduit une erreur technique en message lisible : ce qui a échoué et comment corriger. Aucun détail technique n'est exposé. */
export function describeError(error: unknown): ErrorInfo {
 if (!(error instanceof HttpErrorResponse)) return { message: 'Une erreur inattendue est survenue.', hint: 'Réessayez ; si elle persiste, rechargez la page.', retryable: true };
 const server = typeof error.error?.error?.message === 'string' ? error.error.error.message as string : '';
 switch (true) {
  case error.status === 0: return { message: 'Connexion impossible.', hint: 'Vérifiez votre connexion internet puis réessayez.', retryable: true };
  case error.status === 401: return { message: 'Votre session a expiré.', hint: 'Reconnectez-vous pour continuer.', retryable: false };
  case error.status === 403: return { message: 'Cette action n’est pas autorisée sur votre espace.', hint: 'Actualisez la page puis réessayez.', retryable: false };
  case error.status === 404: return { message: 'Cet élément est introuvable.', hint: 'Il a peut-être été supprimé. Actualisez la page.', retryable: false };
  case error.status === 409: return { message: server ? sentence(server) : 'Cet élément a changé entre-temps.', hint: 'Actualisez la page puis réessayez.', retryable: false };
  case error.status === 413: return { message: 'Le fichier est trop volumineux.', hint: 'Choisissez un fichier plus léger.', retryable: false };
  case error.status === 429: { const wait = retryAfterSeconds(error); return { message: 'Trop de tentatives.', hint: wait ? 'Réessayez dans ' + waitLabel(wait) + '.' : 'Patientez quelques instants puis réessayez.', retryable: true, retryAfter: wait }; }
  case error.status >= 500: return { message: 'Le serveur ne répond pas.', hint: 'Réessayez dans un instant.', retryable: true };
  default: return { message: server ? sentence(server) : 'La demande a été refusée.', hint: 'Corrigez les informations saisies puis réessayez.', retryable: false };
 }
}
/** Message d'erreur en une seule phrase, pour les états de chargement de page. */
export function errorText(error: unknown): string { const info = describeError(error); return `${info.message} ${info.hint}`; }
@Injectable({providedIn:'root'})
export class Auth {
 private api=inject(Api); user=signal<User|null>(null); profile=signal<Row|null>(null);
 async refresh(){const s=await this.api.get<Session>('auth/session');this.user.set(s.user);this.profile.set(s.profile);return !!s.user;}
 async logout(){await this.api.write('POST','auth/logout');this.user.set(null);this.profile.set(null);}
}
export const authenticated:CanActivateFn=async()=>{const auth=inject(Auth),router=inject(Router);try{return await auth.refresh() || router.createUrlTree(['/login']);}catch{return router.createUrlTree(['/login']);}};
export function money(value:unknown){return new Intl.NumberFormat('fr-SN',{maximumFractionDigits:0}).format(Number(value)||0).replace(/[  ]/g,' ')+' FCFA';}
/** Libellés lisibles des valeurs techniques (statuts, objectifs, modes de paiement) : accents et casse de phrase. */
const LABELS:Record<string,string>={PERTE_DE_POIDS:'Perte de poids',PRISE_DE_MASSE:'Prise de masse',CARDIO:'Cardio',TONIFICATION:'Tonification',REMISE_EN_FORME:'Remise en forme',REEDUCATION:'Rééducation légère',AUTRE:'Autre',ESPECES:'Espèces',WAVE:'Wave',ORANGE_MONEY:'Orange Money',PLANIFIEE:'Planifiée',EFFECTUEE:'Effectuée',ANNULEE:'Annulée',PAYE:'Payé',EN_ATTENTE:'En attente',ANNULE:'Annulé',HOMME:'Homme',FEMME:'Femme',QUOTIDIENNE:'Quotidienne',HEBDOMADAIRE:'Hebdomadaire',MENSUELLE:'Mensuelle'};
export function display(value:unknown):string {if(value==null||value==='')return '—'; if(typeof value==='object'){const v=value as Record<string,unknown>;return [v['prenom'],v['nom']].filter(Boolean).join(' ')||'—';}const text=String(value);if(LABELS[text])return LABELS[text];return /^[A-Z]+(_[A-Z]+)+$/.test(text)?text.charAt(0)+text.slice(1).toLowerCase().replaceAll('_',' '):text.replaceAll('_',' ');}
/** Teinte (0–359) stable d'un nom : un client garde la même couleur partout (liste, agenda). */
export function hueOf(text:unknown):number{const s=String(text??'').trim().toLowerCase();let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h;}
export function dateLabel(value:unknown){if(!value)return '—';const d=new Date(String(value));return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('fr-SN',{timeZone:'Africa/Dakar',dateStyle:'medium',...(String(value).includes('T')?{timeStyle:'short' as const}:{})}).format(d);}
