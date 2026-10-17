import { Component, computed, inject, signal } from '@angular/core';
import { Confirm } from '../core/confirm';
import { Toast } from '../core/toast';
import { OfflineQueue } from '../core/offline-queue';
import { dateLabel } from '../core/api';
import { FocusTrap } from './focus-trap';

/** Pastille « en attente de synchronisation » de la barre du haut. Le panneau (SyncDialog) est monté à la racine de l'écran. */
@Component({
  selector: 'app-sync-pill',
  standalone: true,
  template: `
    @if (queue.count() > 0) {
      <button type="button" class="pill sync-pill" (click)="queue.panelOpen.set(true)" [attr.aria-label]="label()" aria-haspopup="dialog" data-testid="sync-pill">
        <i class="fa-solid" [class.fa-rotate]="queue.syncing()" [class.fa-spin]="queue.syncing()" [class.fa-cloud-arrow-up]="!queue.syncing()" aria-hidden="true"></i>
        <span class="sync-count">{{ queue.count() }}</span>
      </button>
    }
  `,
  styles: [`
    :host{display:contents}
    :root:root:root .sync-pill{display:inline-flex;align-items:center;gap:8px;min-height:40px;min-width:44px;padding:6px 16px;justify-content:center;cursor:pointer;font-size:14px;font-weight:800}
    :root:root .sync-pill .sync-count{font-variant-numeric:tabular-nums}
  `],
})
export class SyncPill {
  protected queue = inject(OfflineQueue);
  protected label = computed(() => {
    const n = this.queue.count();
    return `${n} ${n > 1 ? 'saisies en attente' : 'saisie en attente'} de synchronisation. Ouvrir le détail.`;
  });
}

/** Panneau pour réessayer ou supprimer une saisie en attente ou refusée. */
@Component({
  selector: 'app-sync-dialog',
  standalone: true,
  imports: [FocusTrap],
  template: `
    @if (queue.panelOpen() && queue.count() > 0) {
      <div class="modal-backdrop sync-backdrop" (click)="queue.panelOpen.set(false)">
        <section class="modal sync-modal" role="dialog" aria-modal="true" aria-labelledby="sync-title" appFocusTrap (escape)="queue.panelOpen.set(false)" (click)="$event.stopPropagation()" data-testid="sync-panel">
          <h2 id="sync-title">En attente de synchronisation</h2>
          <p class="sync-intro">Ces saisies sont enregistrées sur cet appareil. Elles partent dès que le serveur les confirme.</p>
          <ul class="sync-list">
            @for (item of queue.items(); track item.id) {
              <li class="sync-item" [attr.data-state]="item.state">
                <div class="sync-main">
                  <strong>{{ item.exercise }}</strong>
                  <span>{{ item.client }}, {{ item.sets }} {{ item.sets > 1 ? 'séries' : 'série' }}, {{ date(item.logDate) }}</span>
                  @if (item.state === 'rejected') {
                    <span class="sync-reason" role="status"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Refusée par le serveur. {{ item.reason }}</span>
                  } @else {
                    <span class="sync-wait"><i class="fa-solid fa-clock" aria-hidden="true"></i> En attente d’envoi</span>
                  }
                </div>
                <div class="sync-actions">
                  <button type="button" class="secondary" (click)="queue.retry(item.id)" [disabled]="queue.syncing()">Réessayer</button>
                  <button type="button" class="quiet" (click)="remove(item.id)">Supprimer</button>
                </div>
              </li>
            }
          </ul>
          <div class="actions"><button type="button" class="primary" data-autofocus (click)="queue.panelOpen.set(false)">Fermer</button></div>
        </section>
      </div>
    }
  `,
  styles: [`
    :root:root .sync-modal{max-width:520px;width:100%;max-height:min(86vh,720px);overflow:auto}
    .sync-intro{margin:6px 0 16px;color:var(--soft);font-size:14px}
    .sync-list{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:10px}
    .sync-item{display:grid;gap:12px;padding:14px;border:1px solid var(--edge);border-radius:18px;background:var(--surface-2)}
    .sync-item[data-state=rejected]{border-color:var(--text)}
    .sync-main{display:grid;gap:4px;min-width:0}
    .sync-main span{font-size:13px;color:var(--soft);overflow-wrap:anywhere}
    .sync-main .sync-reason{color:var(--text)}
    .sync-actions{display:flex;gap:8px;flex-wrap:wrap}
    .sync-actions button{min-height:44px}
  `],
})
export class SyncDialog {
  protected queue = inject(OfflineQueue);
  protected date = (value: string) => dateLabel(value);
  private confirm = inject(Confirm);
  private toast = inject(Toast);
  protected async remove(id: string) {
    const item = this.queue.items().find(i => i.id === id);
    const what = item ? `${item.exercise} de ${item.client}` : 'cette saisie';
    if (!(await this.confirm.ask({ title: 'Supprimer cette saisie ?', detail: `La saisie ${what} n’a pas été envoyée au serveur : elle sera définitivement perdue.`, confirmLabel: 'Supprimer la saisie', tone: 'sensitive' }))) return;
    try { await this.queue.discard(id); } catch (e) { this.toast.fail('Saisie non supprimée', e, () => void this.remove(id)); return; }
    this.toast.success('Saisie supprimée', 'Elle ne sera pas envoyée.');
    if (this.queue.count() === 0) this.queue.panelOpen.set(false);
  }
}
