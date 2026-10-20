import { Component, effect, inject, input, signal } from '@angular/core';
import { Api, dateLabel, errorText } from '../core/api';
import { Confirm } from '../core/confirm';
import { Toast } from '../core/toast';

interface Access { state: 'NONE' | 'INVITED' | 'ACTIVE'; invited_at: string | null; last_invite_sent_at: string | null; last_sign_in_at: string | null }
interface InviteResult { state: string; mailSent: boolean; message: string | null }

/** Espace client, vu du coach : état de l'accès du client, envoi ou renvoi du lien, retrait de l'accès. */
@Component({
  selector: 'app-client-access',
  standalone: true,
  template: `
    <section class="panel access" aria-labelledby="access-title">
      <div class="access-head"><h2 id="access-title"><i class="fa-solid fa-user-lock" aria-hidden="true"></i> Espace client</h2>
        @if (access(); as a) { <span class="pill" [attr.data-tone]="a.state === 'NONE' ? 'warn' : 'ok'">{{ a.state === 'ACTIVE' ? 'Actif' : a.state === 'INVITED' ? 'Invité' : 'Pas d’accès' }}</span> }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (access(); as a) {
        @if (a.state === 'NONE') {
          @if (!email()) { <p class="muted">Ajoutez l’adresse e-mail du client (Modifier la fiche) : il recevra automatiquement un lien pour voir ses performances et ses rapports.</p> }
          @else { <p class="muted">{{ email() }} n’a pas encore d’accès. Le client verra seulement ses performances, ses statistiques et ses rapports.</p>
            <div class="actions"><button type="button" class="primary" [disabled]="busy()" (click)="send()"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer le lien d’accès</button></div> }
        } @else {
          <p class="muted">
            @if (a.state === 'ACTIVE') { Dernière connexion : {{ date(a.last_sign_in_at) }}. }
            @else { Lien envoyé le {{ date(a.last_invite_sent_at) }} à {{ email() }}. Le client ne s’est pas encore connecté. }
          </p>
          <div class="actions">
            @if (a.state === 'INVITED') { <button type="button" class="secondary" [disabled]="busy()" (click)="send()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Renvoyer le lien</button> }
            <button type="button" class="secondary" [disabled]="busy()" (click)="revoke()"><i class="fa-solid fa-user-slash" aria-hidden="true"></i> Retirer l’accès</button>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host{display:block}
    .access-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.access-head h2{margin:0;font-size:18px}
    .access-head i{margin-right:8px;color:var(--accent)}
  `],
})
export class ClientAccessComponent {
  clientId = input.required<string>();
  /** Adresse e-mail enregistrée sur la fiche (peut être vide). */
  email = input<string>('');

  private api = inject(Api);
  private toast = inject(Toast);
  private confirm = inject(Confirm);
  access = signal<Access | null>(null);
  error = signal('');
  busy = signal(false);
  date = (v: string | null) => dateLabel(v);

  constructor() { effect(() => { this.clientId(); void this.load(); }); }

  async load() {
    this.error.set('');
    try { this.access.set(await this.api.get<Access>(`clients/${this.clientId()}/invite`)); }
    catch (e) { this.error.set(errorText(e)); }
  }

  async send() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await this.api.write<InviteResult>('POST', `clients/${this.clientId()}/invite`);
      const ok = r.state === 'INVITED' || r.state === 'RESENT';
      if (r.message) (ok && r.mailSent ? this.toast.success : this.toast.error).call(this.toast, ok ? 'Lien envoyé' : 'Lien non envoyé', r.message);
      await this.load();
    } catch (e) { this.toast.error('Lien non envoyé', errorText(e)); }
    finally { this.busy.set(false); }
  }

  async revoke() {
    if (this.busy()) return;
    const ok = await this.confirm.ask({ title: 'Retirer l’accès de ce client ?', detail: 'Il ne pourra plus se connecter à son espace. Vous pourrez lui renvoyer un lien plus tard.', confirmLabel: 'Retirer l’accès', tone: 'sensitive' });
    if (!ok) return;
    this.busy.set(true);
    try { await this.api.write('DELETE', `clients/${this.clientId()}/invite`); this.toast.success('Accès retiré', 'Le client ne peut plus se connecter.'); await this.load(); }
    catch (e) { this.toast.error('Accès non retiré', errorText(e)); }
    finally { this.busy.set(false); }
  }
}
