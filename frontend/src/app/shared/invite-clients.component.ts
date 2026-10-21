import { Component, inject, signal } from '@angular/core';
import { Api, errorText } from '../core/api';
import { Confirm } from '../core/confirm';
import { Toast } from '../core/toast';

interface Pending { pending: number; withoutEmail: number }
interface BatchResult { invited: number; mailFailed: number; emailInUse: number; invalid: number; failed: number; remaining: number }

/** Bandeau de la liste des clients : invite d'un coup les clients qui ont une adresse e-mail mais pas encore d'espace. */
@Component({
  selector: 'app-invite-clients',
  standalone: true,
  template: `
    @if (info(); as i) {
      @if (i.pending > 0) {
        <section class="panel invite-all" aria-label="Espace client">
          <div class="invite-text"><strong><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> {{ i.pending }} client{{ i.pending > 1 ? 's' : '' }} sans espace</strong>
            <span class="muted">Ils ont une adresse e-mail mais n’ont pas encore reçu leur lien pour suivre leurs performances et leurs rapports.</span></div>
          <button type="button" class="primary" [disabled]="busy()" (click)="send(i.pending)">{{ busy() ? 'Envoi…' : 'Envoyer les liens' }}</button>
        </section>
      }
    }
  `,
  styles: [`
    :host{display:block}
    .invite-all{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .invite-text{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 260px}.invite-text i{margin-right:8px;color:var(--accent)}.invite-text .muted{font-size:13px}
  `],
})
export class InviteClientsComponent {
  private api = inject(Api);
  private toast = inject(Toast);
  private confirm = inject(Confirm);
  info = signal<Pending | null>(null);
  busy = signal(false);

  constructor() { void this.load(); }

  private async load() { try { this.info.set(await this.api.get<Pending>('clients/invite-missing')); } catch { this.info.set(null); } }

  async send(count: number) {
    if (this.busy()) return;
    const ok = await this.confirm.ask({ title: `Envoyer ${count > 25 ? '25 liens maintenant' : count > 1 ? 'les ' + count + ' liens' : 'le lien'} d’accès ?`, detail: 'Chaque client reçoit un e-mail pour choisir son mot de passe et accéder à son espace (lecture seule).', confirmLabel: 'Envoyer', tone: 'normal' });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.write<BatchResult>('POST', 'clients/invite-missing');
      const notes = [r.mailFailed ? `${r.mailFailed} e-mail(s) à renvoyer depuis la fiche` : '', r.emailInUse ? `${r.emailInUse} adresse(s) déjà utilisée(s)` : '', r.invalid ? `${r.invalid} adresse(s) invalide(s)` : '', r.failed ? `${r.failed} échec(s)` : '', r.remaining ? `${r.remaining} restant(s) : relancez dans une heure` : ''].filter(Boolean);
      (r.invited > 0 && !r.failed ? this.toast.success : this.toast.info).call(this.toast, r.invited ? `${r.invited} lien${r.invited > 1 ? 's' : ''} envoyé${r.invited > 1 ? 's' : ''}` : 'Aucun lien envoyé', notes.join(' · ') || 'Vos clients vont recevoir leur e-mail.');
      await this.load();
    } catch (e) { this.toast.error('Liens non envoyés', errorText(e)); }
    finally { this.busy.set(false); }
  }
}
