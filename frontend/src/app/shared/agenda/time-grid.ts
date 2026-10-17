import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { hueOf } from '../../core/api';
import {
  AgendaSession, Placed, STATUS_ICON, STATUS_LABEL, describeSession, sessionClient, dayLong, endTimeOf, hourLabel, layoutDay, minutesOf, timeOf, todayDay, weekdayShort,
} from './agenda.model';

const HOUR_PX = 56;

export interface SlotPick { day: string; time: string }

/** Grille horaire d'un ou plusieurs jours (vues Jour et Semaine sur écran large). Un clic sur un créneau vide propose de planifier. */
@Component({
  selector: 'app-time-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ag-tg" role="group" [attr.aria-label]="label()">
      <div class="ag-tg-scroll" #scroller>
        <div class="ag-tg-head" [style.--cols]="days().length">
          <span class="ag-tg-corner" aria-hidden="true"></span>
          @for (c of columns(); track c.day) {
            @if (headsOpenDay()) {
              <button type="button" class="ag-tg-dayhead" [class.is-today]="c.isToday" [attr.aria-label]="'Ouvrir ' + c.long" (click)="openDay.emit(c.day)">
                <span>{{ c.dow }}</span><strong>{{ c.num }}</strong>
              </button>
            } @else {
              <div class="ag-tg-dayhead is-static" [class.is-today]="c.isToday"><span>{{ c.dow }}</span><strong>{{ c.num }}</strong></div>
            }
          }
        </div>
        <div class="ag-tg-body" [style.--cols]="days().length" [style.height.px]="height()">
          <div class="ag-tg-hours" aria-hidden="true">
            @for (h of hours(); track h) { <span [style.top.px]="(h - startHour()) * hourPx">{{ hour(h) }}</span> }
          </div>
          @for (c of columns(); track c.day) {
            <div class="ag-tg-col" role="group" [attr.aria-label]="c.long" [class.is-today]="c.isToday">
              @for (h of hours(); track h) {
                <button type="button" tabindex="-1" class="ag-tg-slot" [style.height.px]="hourPx"
                        [attr.aria-label]="'Planifier une séance le ' + c.long + ' à ' + hour(h)" (click)="pickSlot(c.day, h, $event)"></button>
              }
              @for (p of c.placed; track p.session.id) {
                <button type="button" class="ag-tg-event" [attr.data-status]="p.session.statut" [style.--hue]="hue(p.session)" [class.is-selected]="p.session.id === selectedId()" [class.is-short]="p.height < 44" [class.is-narrow]="p.lanes > 1"
                        [style.top.px]="p.top" [style.height.px]="p.height" [style.left]="'calc(' + (p.lane / p.lanes * 100) + '% + 2px)'" [style.width]="'calc(' + (100 / p.lanes) + '% - 4px)'"
                        [attr.aria-label]="describe(p.session)" [attr.title]="describe(p.session)" (click)="open.emit(p.session)">
                  <span class="ag-ev-line"><i class="fa-solid" [class]="icon[p.session.statut]" aria-hidden="true"></i> {{ p.lanes > 1 ? start(p.session) : time(p.session) }} <span class="ag-sr">{{ statusLabel[p.session.statut] }}</span></span>
                  <strong>{{ p.session.titre }}</strong>
                  @if (p.height >= 56) { <span class="ag-ev-client">{{ clientOf(p.session) }}</span> }
                </button>
              }
              @if (c.isToday && nowTop() !== null) { <span class="ag-tg-now" aria-hidden="true" [style.top.px]="nowTop()"></span> }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class TimeGrid {
  days = input.required<string[]>();
  byDay = input.required<Map<string, AgendaSession[]>>();
  selectedId = input('');
  /** En vue semaine, l'en-tête d'un jour ouvre la vue Jour. */
  headsOpenDay = input(false);
  label = input('Grille horaire');
  pick = output<SlotPick>();
  open = output<AgendaSession>();
  openDay = output<string>();

  hourPx = HOUR_PX;
  icon = STATUS_ICON;
  statusLabel = STATUS_LABEL;
  describe = describeSession;
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private now = signal(new Date());

  /** Plage affichée : 6 h – 22 h au minimum, élargie si une séance sort de cette plage. */
  private range = computed(() => {
    let start = 6 * 60, end = 22 * 60;
    for (const day of this.days()) for (const s of this.byDay().get(day) ?? []) {
      const from = minutesOf(s.date_heure);
      start = Math.min(start, Math.floor(from / 60) * 60);
      end = Math.max(end, Math.min(1440, Math.ceil((from + s.duree_minutes) / 60) * 60));
    }
    return { start, end };
  });
  startHour = computed(() => this.range().start / 60);
  hours = computed(() => Array.from({ length: (this.range().end - this.range().start) / 60 }, (_, i) => this.startHour() + i));
  height = computed(() => this.hours().length * HOUR_PX);

  columns = computed(() => {
    const today = todayDay();
    return this.days().map(day => ({
      day,
      isToday: day === today,
      dow: weekdayShort(day),
      num: Number(day.slice(8)),
      long: dayLong(day),
      placed: layoutDay(this.byDay().get(day) ?? [], this.range().start, HOUR_PX / 60) as Placed[],
    }));
  });

  nowTop = computed(() => {
    const minutes = minutesOf(this.now().toISOString());
    const { start, end } = this.range();
    return minutes >= start && minutes <= end ? ((minutes - start) * HOUR_PX) / 60 : null;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // Après chaque changement de période, la grille se place sur la première séance (ou 7 h) pour éviter de défiler.
    effect(() => {
      const first = this.firstMinute();
      const start = this.range().start;
      setTimeout(() => {
        const el = this.scroller()?.nativeElement;
        if (el) el.scrollTop = Math.max(0, ((first - start) * HOUR_PX) / 60 - 40);
      });
    });
  }

  private firstMinute = computed(() => {
    let first = 7 * 60;
    let found = false;
    for (const day of this.days()) for (const s of this.byDay().get(day) ?? []) {
      const m = minutesOf(s.date_heure);
      if (!found || m < first) { first = m; found = true; }
    }
    return first;
  });

  hour = (h: number) => hourLabel(h * 60);
  start = (s: AgendaSession) => timeOf(s.date_heure);
  time = (s: AgendaSession) => `${timeOf(s.date_heure)} – ${endTimeOf(s)}`;
  clientOf = (s: AgendaSession) => [s.clients?.prenom, s.clients?.nom].filter(Boolean).join(' ');
  hue = (s: AgendaSession) => hueOf(sessionClient(s));

  pickSlot(day: string, hour: number, event: MouseEvent) {
    // Moitié haute du créneau : heure pile ; moitié basse : et demie. Un activation au clavier (offset 0) donne l'heure pile.
    const half = event.detail > 0 && event.offsetY > HOUR_PX / 2 ? 30 : 0;
    this.pick.emit({ day, time: hourLabel(hour * 60 + half) });
  }
}
