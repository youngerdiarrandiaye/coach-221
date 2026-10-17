import { Component, inject, signal } from '@angular/core';
import { Reminders, formatOffset } from '../core/reminders';
import { Confirm } from '../core/confirm';
import { Toast } from '../core/toast';

const quick = [10, 20, 30, 45, 60, 120];

/** Réglages des rappels de séance : le coach choisit combien de minutes avant il veut être prévenu. */
@Component({
  selector: 'app-reminder-settings',
  standalone: true,
  template: `
    <section id="rappels" class="panel reminders" aria-labelledby="rem-title">
      <div class="rem-head">
        <div>
          <h2 id="rem-title"><i class="fa-solid fa-bell" aria-hidden="true"></i> Rappels de séance</h2>
          <p class="muted">Soyez prévenu avant chaque séance.</p>
        </div>
        <label class="switch">
          <input type="checkbox" role="switch" [checked]="r.settings().enabled" (change)="r.setEnabled($any($event.target).checked)" aria-label="Activer les rappels de séance">
          <span class="track" aria-hidden="true"></span>
        </label>
      </div>

      @if (r.settings().enabled) {
        <p class="label">Me prévenir avant la séance</p>
        <div class="filter-tabs" role="group" aria-label="Délais d’alerte">
          @for (m of quick; track m) {
            <button type="button" [attr.aria-pressed]="has(m)" (click)="toggle(m)">{{ format(m) }}</button>
          }
          @for (m of custom(); track m) {
            <button type="button" aria-pressed="true" (click)="r.removeOffset(m)" [attr.aria-label]="'Retirer le rappel ' + format(m)">{{ format(m) }} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          }
        </div>

        <form class="custom" (submit)="addCustom($event, minutesInput)">
          <label for="rem-custom">Autre délai (en minutes)</label>
          <div class="custom-row">
            <input #minutesInput id="rem-custom" type="number" inputmode="numeric" min="1" max="1440" step="1" placeholder="Ex. 15">
            <button type="submit" class="secondary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter</button>
          </div>
        </form>

        @if (!r.settings().offsets.length) { <p class="auto-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Aucun délai choisi : vous ne serez prévenu pour aucune séance.</p> }
        @else { <p class="muted summary">Alerte {{ summary() }} avant chaque séance planifiée.</p> }

        <div class="system">
          @if (r.permission() === 'unsupported') {
            <p class="muted">Ce navigateur n’affiche pas de notifications du système. Les alertes apparaissent dans l’application.</p>
          } @else if (r.permission() === 'granted') {
            <label class="check"><input type="checkbox" [checked]="r.settings().system" (change)="r.setSystem($any($event.target).checked)"> Aussi par notification du système</label>
            @if (r.pushSupported) {
              @if (r.pushActive()) {
                <p class="push-state"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Rappels actifs même application fermée sur cet appareil.</p>
                <button type="button" class="secondary" [disabled]="r.pushBusy()" (click)="disablePush()">Désactiver sur cet appareil</button>
              } @else {
                <button type="button" class="primary" [disabled]="r.pushBusy()" (click)="activatePush()"><i class="fa-solid fa-bell" aria-hidden="true"></i> Recevoir les rappels application fermée</button>
              }
            }
            <button type="button" class="secondary" (click)="test()"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer un essai</button>
          } @else if (r.permission() === 'denied') {
            <p class="auto-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis revenez ici.</p>
          } @else {
            <button type="button" class="primary" (click)="allow()"><i class="fa-solid fa-bell" aria-hidden="true"></i> Autoriser les notifications</button>
          }
        </div>
        <p class="muted limit">@if (r.pushActive()) { Les rappels arrivent même quand CoachSen est fermé. } @else { Sans cette option, les alertes partent seulement quand CoachSen est ouvert. }</p>
      }
    </section>
  `,
  styles: [`
    :host{display:block}
    .rem-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
    .rem-head h2{margin:0 0 4px;display:flex;gap:10px;align-items:center;font-size:18px}
    .rem-head p{margin:0}
    .label{margin:20px 0 10px;font-weight:700;font-size:14px}
    .custom{margin-top:6px}
    .custom label{font-size:13px;color:var(--soft);font-weight:600}
    .custom-row{display:flex;gap:10px;max-width:360px}
    .custom-row input{margin:0}
    .summary{margin:14px 0 0}
    .system{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:18px}
    .check{display:flex;gap:10px;align-items:center;margin:0;font-weight:600;font-size:14px;flex:1 1 280px}
    .check input{margin:0;width:18px;height:18px}
    .limit{font-size:12px;margin:16px 0 0}
    .push-state{display:flex;gap:8px;align-items:center;margin:0;font-weight:600;font-size:14px;color:var(--accent);flex:1 1 280px}
    .switch{position:relative;flex:none;margin:0;display:inline-block;width:56px;height:32px}
    .switch input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1}
    .track{position:absolute;inset:0;border-radius:999px;background:var(--surface-3);border:1px solid var(--edge);transition:background .15s}
    .track::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:var(--soft);transition:transform .15s,background .15s}
    .switch input:checked + .track{background:var(--accent);border-color:var(--accent)}
    .switch input:checked + .track::after{transform:translateX(24px);background:var(--on-accent)}
    .switch input:focus-visible + .track{outline:3px solid var(--accent);outline-offset:3px}
  `],
})
export class ReminderSettingsComponent {
  r = inject(Reminders);
  private toast = inject(Toast);
  private confirm = inject(Confirm);
  quick = quick;
  format = formatOffset;
  error = signal('');

  has(minutes: number) { return this.r.settings().offsets.includes(minutes); }
  custom() { return this.r.settings().offsets.filter(m => !quick.includes(m)); }
  summary() { return this.r.settings().offsets.map(formatOffset).join(', '); }

  toggle(minutes: number) {
    if (this.has(minutes)) this.r.removeOffset(minutes); else this.r.addOffset(minutes);
  }

  addCustom(event: Event, input: HTMLInputElement) {
    event.preventDefault();
    const minutes = Number(input.value);
    if (!this.r.addOffset(minutes)) {
      this.toast.error('Délai refusé', 'Saisissez un nombre entier de minutes entre 1 et 1440.');
      return;
    }
    this.toast.success('Rappel ajouté', `Vous serez prévenu ${formatOffset(minutes)} avant chaque séance.`);
    input.value = '';
  }

  async allow() {
    await this.r.requestPermission();
    if (this.r.permission() === 'granted') {
      this.toast.success('Notifications autorisées', 'Vous recevrez les rappels quand CoachSen est en arrière-plan.');
      await this.activatePush(true);
    } else if (this.r.permission() === 'denied') this.toast.info('Notifications refusées', 'Les rappels resteront affichés dans l’application.');
  }

  async activatePush(quiet = false) {
    const result = await this.r.enablePush();
    if (result === 'ok') { if (!quiet) this.toast.success('Rappels application fermée activés', 'Cet appareil recevra les alertes même quand CoachSen est fermé.'); return; }
    const messages: Record<string, [string, string]> = {
      denied: ['Notifications refusées', 'Autorisez les notifications dans les réglages du navigateur, puis réessayez.'],
      unsupported: ['Option indisponible', 'Ce navigateur ne gère pas les notifications push. Les alertes restent affichées dans l’application.'],
      'not-configured': ['Option indisponible pour le moment', 'Le serveur n’est pas encore configuré pour les notifications push. Les alertes restent affichées dans l’application.'],
      error: ['Activation impossible', 'Vérifiez votre connexion internet puis réessayez.'],
    };
    const [title, detail] = messages[result];
    this.toast.error(title, detail);
  }

  async disablePush() {
    if (!(await this.confirm.ask({ title: 'Désactiver les rappels ?', detail: 'Cet appareil ne recevra plus d’alertes quand CoachSen est fermé.', confirmLabel: 'Désactiver' }))) return;
    await this.r.disablePush();
    this.toast.info('Rappels application fermée désactivés', 'Cet appareil ne recevra plus d’alertes quand CoachSen est fermé.');
  }

  async test() {
    if (this.r.pushActive()) {
      const sent = await this.r.testPush();
      if (sent) this.toast.info('Essai envoyé', 'La notification arrive par le serveur, comme un vrai rappel.');
      else this.toast.error('Essai non envoyé', 'Le serveur n’a pas pu envoyer la notification. Réessayez dans un instant.');
      return;
    }
    await this.r.test();
    this.toast.info('Essai envoyé', 'Si rien n’apparaît, vérifiez les réglages de notification de votre appareil.');
  }
}
