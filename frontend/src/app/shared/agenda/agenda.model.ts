/** Types, libellés et calculs de dates de l'agenda. Toutes les dates métier sont en jours Africa/Dakar (AAAA-MM-JJ). */

export type AgendaView = 'day' | 'week' | 'month' | 'list';
export type SessionStatus = 'PLANIFIEE' | 'EFFECTUEE' | 'ANNULEE';
export type Scope = 'ONE' | 'FOLLOWING' | 'ALL';

export interface AgendaSession {
  id: string;
  client_id: string;
  titre: string;
  description?: string | null;
  notes?: string | null;
  date_heure: string;
  duree_minutes: number;
  statut: SessionStatus;
  recurrence_id?: string | null;
  occurrence_date?: string | null;
  updated_at?: string;
  clients?: { prenom?: string; nom?: string } | null;
}

export interface ClientOption { id: string; prenom: string; nom: string }

export interface Conflict { id: string; titre: string; client?: unknown; date_heure: string; duree_minutes: number }

export interface Period { from: string; to: string }

export const VIEWS: { key: AgendaView; label: string; icon: string }[] = [
  { key: 'day', label: 'Jour', icon: 'fa-calendar-day' },
  { key: 'week', label: 'Semaine', icon: 'fa-calendar-week' },
  { key: 'month', label: 'Mois', icon: 'fa-calendar' },
  { key: 'list', label: 'Liste', icon: 'fa-list' },
];

export const STATUS_LABEL: Record<SessionStatus, string> = { PLANIFIEE: 'Planifiée', EFFECTUEE: 'Effectuée', ANNULEE: 'Annulée' };
export const STATUS_TONE: Record<SessionStatus, string> = { PLANIFIEE: 'warn', EFFECTUEE: 'ok', ANNULEE: 'bad' };
export const STATUS_ICON: Record<SessionStatus, string> = { PLANIFIEE: 'fa-clock', EFFECTUEE: 'fa-check', ANNULEE: 'fa-ban' };
export const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export const clientName = (c?: { prenom?: string; nom?: string } | null) => [c?.prenom, c?.nom].filter(Boolean).join(' ');
export const sessionClient = (s: AgendaSession) => clientName(s.clients) || 'Client';

const DAKAR = 'Africa/Dakar';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: DAKAR });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: DAKAR, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const isDay = (value: string | null | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Jour Dakar (AAAA-MM-JJ) d'un instant ISO. */
export const dayOf = (iso: string | Date) => dayFmt.format(new Date(iso));
/** Heure Dakar (HH:mm) d'un instant ISO. */
export const timeOf = (iso: string | Date) => timeFmt.format(new Date(iso));
export const todayDay = () => dayOf(new Date());
export const minutesOf = (iso: string) => { const [h, m] = timeOf(iso).split(':').map(Number); return h * 60 + m; };
export const endTimeOf = (s: Pick<AgendaSession, 'date_heure' | 'duree_minutes'>) => timeOf(new Date(new Date(s.date_heure).getTime() + s.duree_minutes * 60000));
export const hourLabel = (minutes: number) => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');

const utc = (day: string) => new Date(day + 'T12:00:00Z');
export const addDays = (day: string, n: number) => { const d = utc(day); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekday = (day: string) => utc(day).getUTCDay();
export const mondayOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7));
export const monthStart = (day: string) => day.slice(0, 8) + '01';
export const monthEnd = (day: string) => { const d = utc(monthStart(day)); d.setUTCMonth(d.getUTCMonth() + 1, 0); return d.toISOString().slice(0, 10); };
export const addMonths = (day: string, n: number) => { const d = utc(monthStart(day)); d.setUTCMonth(d.getUTCMonth() + n, 1); return d.toISOString().slice(0, 10); };
export const daysFrom = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i));
export const daysBetween = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000);

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts });
const fDayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fDayLongYear = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fWeekdayShort = fmt({ weekday: 'short' });
const fDayMonth = fmt({ day: 'numeric', month: 'short' });
const fMonthYear = fmt({ month: 'long', year: 'numeric' });
const fMonth = fmt({ month: 'long' });
export const dayLong = (day: string) => cap(fDayLong.format(utc(day)));
export const dayLongYear = (day: string) => cap(fDayLongYear.format(utc(day)));
export const weekdayShort = (day: string) => cap(fWeekdayShort.format(utc(day)).replace('.', ''));
export const dayMonth = (day: string) => fDayMonth.format(utc(day));
export const monthYear = (day: string) => cap(fMonthYear.format(utc(day)));

/** Jours couverts par la vue : la période demandée au serveur pour jour, semaine et mois (grille de 5 ou 6 semaines). */
export function periodOf(view: AgendaView, anchor: string): Period | null {
  switch (view) {
    case 'day': return { from: anchor, to: anchor };
    case 'week': { const from = mondayOf(anchor); return { from, to: addDays(from, 6) }; }
    case 'month': return { from: mondayOf(monthStart(anchor)), to: addDays(mondayOf(monthEnd(anchor)), 6) };
    default: return null;
  }
}

export function shiftAnchor(view: AgendaView, anchor: string, direction: 1 | -1): string {
  switch (view) {
    case 'day': return addDays(anchor, direction);
    case 'week': return addDays(anchor, 7 * direction);
    case 'month': return addMonths(anchor, direction);
    default: return anchor;
  }
}

export function periodTitle(view: AgendaView, anchor: string): string {
  switch (view) {
    case 'day': return dayLongYear(anchor);
    case 'week': {
      const from = mondayOf(anchor), to = addDays(from, 6);
      return from.slice(0, 7) === to.slice(0, 7)
        ? `${Number(from.slice(8))} – ${Number(to.slice(8))} ${fMonth.format(utc(to))} ${to.slice(0, 4)}`
        : `${dayMonth(from)} – ${dayMonth(to)} ${to.slice(0, 4)}`;
    }
    case 'month': return monthYear(anchor);
    default: return 'Toutes les séances';
  }
}

/** Valeur envoyée au serveur : date et heure de Dakar, sans conversion côté navigateur. */
export const toApiDateTime = (day: string, time: string) => `${day}T${time}`;

export function groupByDay(rows: AgendaSession[]): Map<string, AgendaSession[]> {
  const map = new Map<string, AgendaSession[]>();
  for (const row of [...rows].sort((a, b) => a.date_heure.localeCompare(b.date_heure))) {
    const day = dayOf(row.date_heure);
    map.set(day, [...(map.get(day) ?? []), row]);
  }
  return map;
}

export interface Placed { session: AgendaSession; top: number; height: number; lane: number; lanes: number }

/** Positionne les séances d'une journée dans la grille horaire ; les séances qui se chevauchent se partagent la largeur. */
export function layoutDay(sessions: AgendaSession[], gridStart: number, pxPerMinute: number): Placed[] {
  const items = sessions.map(session => {
    const start = minutesOf(session.date_heure);
    return { session, start, end: Math.min(1440, start + Math.max(session.duree_minutes, 15)), lane: 0, lanes: 1 };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const close = () => { const lanes = Math.max(1, ...cluster.map(i => i.lane + 1)); cluster.forEach(i => (i.lanes = lanes)); cluster = []; };
  const laneEnds: number[] = [];
  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) { close(); laneEnds.length = 0; }
    let lane = laneEnds.findIndex(end => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    item.lane = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) close();
  return items.map(i => ({ session: i.session, lane: i.lane, lanes: i.lanes, top: (i.start - gridStart) * pxPerMinute, height: Math.max((i.end - i.start) * pxPerMinute, 26) }));
}

export function describeSession(s: AgendaSession): string {
  return `${s.titre}, ${sessionClient(s)}, ${dayLong(dayOf(s.date_heure))} de ${timeOf(s.date_heure)} à ${endTimeOf(s)}, ${STATUS_LABEL[s.statut].toLowerCase()}`;
}
