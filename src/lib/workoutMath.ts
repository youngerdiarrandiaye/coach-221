// Calculs purs (sans réseau) du carnet d'entraînement : records, buckets d'analyse, RUM.
// Dakar est en UTC toute l'année : les dates métier se calculent donc en UTC, sans dépendre du fuseau du serveur.

export type Period = 'week' | 'month' | 'year'
export type RecordType = '1RM' | 'CHARGE' | 'REPS'

export interface SetLike { reps: number; charge_kg: number }
export interface LogLike extends SetLike { log_date: string; client_id?: string; exercice_id?: string }
export interface NewRecord { type: RecordType; value: number; previous: number | null }

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

/** 1RM estimé (Epley) arrondi à 0,1 kg. */
export const estimate1RM = (charge_kg: number, reps: number) => round1(Number(charge_kg) * (1 + Number(reps) / 30))

function bests(sets: SetLike[]) {
  return {
    '1RM': Math.max(...sets.map(s => estimate1RM(s.charge_kg, s.reps))),
    CHARGE: Math.max(...sets.map(s => Number(s.charge_kg))),
    REPS: Math.max(...sets.map(s => Number(s.reps))),
  } as Record<RecordType, number>
}

/** Records battus par une saisie, calculés par rapport à l'historique (avant insertion). */
export function detectNewRecords(history: SetLike[], sets: SetLike[]): NewRecord[] {
  if (!sets.length) return []
  const next = bests(sets)
  const prev = history.length ? bests(history) : null
  const out: NewRecord[] = []
  for (const type of ['1RM', 'CHARGE', 'REPS'] as RecordType[])
    if (!prev || next[type] > prev[type]) out.push({ type, value: next[type], previous: prev ? prev[type] : null })
  return out
}

export interface ExerciseRecord {
  exercice_id: string; best_1rm: number; max_charge: number; max_reps: number; record_date: string
}

/** Meilleurs résultats par exercice ; record_date = date du meilleur 1RM (la plus ancienne en cas d'égalité). */
export function aggregateRecords(logs: Required<Pick<LogLike, 'exercice_id' | 'log_date' | 'reps' | 'charge_kg'>>[]): ExerciseRecord[] {
  const map = new Map<string, ExerciseRecord>()
  for (const l of logs) {
    const orm = estimate1RM(l.charge_kg, l.reps)
    const cur = map.get(l.exercice_id)
    if (!cur) { map.set(l.exercice_id, { exercice_id: l.exercice_id, best_1rm: orm, max_charge: Number(l.charge_kg), max_reps: Number(l.reps), record_date: l.log_date }); continue }
    if (orm > cur.best_1rm || (orm === cur.best_1rm && l.log_date < cur.record_date)) { cur.best_1rm = orm; cur.record_date = l.log_date }
    cur.max_charge = Math.max(cur.max_charge, Number(l.charge_kg))
    cur.max_reps = Math.max(cur.max_reps, Number(l.reps))
  }
  return Array.from(map.values()).sort((a, b) => b.best_1rm - a.best_1rm)
}

/**
 * Nombre de records battus dans [from, to] : un record = un (client, exercice, jour)
 * où au moins un des trois maxima (1RM, charge, reps) dépasse l'historique antérieur.
 */
export function countRecordsInRange(logs: Required<Pick<LogLike, 'client_id' | 'exercice_id' | 'log_date' | 'reps' | 'charge_kg'>>[], from: string, to: string): number {
  const groups = new Map<string, typeof logs>()
  for (const l of logs) {
    const key = l.client_id + '|' + l.exercice_id
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  let count = 0
  for (const list of Array.from(groups.values())) {
    const days = Array.from(new Set(list.map(l => l.log_date))).sort()
    const seen: SetLike[] = []
    for (const day of days) {
      const today = list.filter(l => l.log_date === day)
      if (day >= from && day <= to && detectNewRecords(seen, today).length) count++
      seen.push(...today)
    }
  }
  return count
}

// ── Dates ───────────────────────────────────────────────
const MS_DAY = 86_400_000
const toDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => iso(new Date(toDate(day).getTime() + n * MS_DAY))
const diffDays = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_DAY)
/** Date du jour à Dakar (UTC+0 toute l'année). */
export const dakarToday = (now = new Date()) => iso(now)
export const mondayOf = (day: string) => addDays(day, -((toDate(day).getUTCDay() + 6) % 7))
const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

export function isoWeek(day: string): number {
  const d = toDate(day)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  return Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / MS_DAY + 1) / 7)
}

export interface Bucket { label: string; start: string; end: string }
export interface PeriodRange { from: string; to: string; prevFrom: string; prevTo: string; buckets: Bucket[] }

/** week = 7 jours glissants ; month = 30 jours par semaine ISO ; year = 12 mois calendaires. */
export function periodRange(period: Period, today: string): PeriodRange {
  let from: string
  const buckets: Bucket[] = []
  if (period === 'week') {
    from = addDays(today, -6)
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i)
      buckets.push({ label: `${JOURS[toDate(d).getUTCDay()]} ${d.slice(8)}`, start: d, end: d })
    }
  } else if (period === 'month') {
    from = addDays(today, -29)
    for (let s = from; s <= today; s = addDays(mondayOf(s), 7)) {
      const end = addDays(mondayOf(s), 6)
      buckets.push({ label: `S${String(isoWeek(s)).padStart(2, '0')}`, start: s, end: end < today ? end : today })
    }
  } else {
    const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1
    const first = new Date(Date.UTC(y, m - 11, 1))
    from = iso(first)
    for (let i = 0; i < 12; i++) {
      const s = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1))
      const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0))
      buckets.push({ label: `${MOIS[s.getUTCMonth()]} ${String(s.getUTCFullYear()).slice(2)}`, start: iso(s), end: iso(e) < today ? iso(e) : today })
    }
  }
  const length = diffDays(from, today) + 1
  return { from, to: today, prevFrom: addDays(from, -length), prevTo: addDays(from, -1), buckets }
}

export interface AnalyticsBucket { label: string; start: string; volume_kg: number; series: number; seances: number; poids_moyen_kg: number | null }
export interface AnalyticsResult {
  period: Period; from: string; to: string; buckets: AnalyticsBucket[]
  totals: { volume_kg: number; series: number; seances: number; records: number; delta_volume_pct: number | null }
}

export function computeAnalytics(input: {
  period: Period
  today: string
  logs: { log_date: string; reps: number; charge_kg: number }[]           // from de la période précédente à to
  sessionDates: string[]                                                   // jours Dakar des séances EFFECTUEE
  weights: { mesure_date: string; poids_kg: number | null }[]
  records: number
}): AnalyticsResult {
  const range = periodRange(input.period, input.today)
  const volume = (l: { reps: number; charge_kg: number }) => Number(l.reps) * Number(l.charge_kg)
  const inRange = (day: string, a: string, b: string) => day >= a && day <= b
  const buckets = range.buckets.map(b => {
    const logs = input.logs.filter(l => inRange(l.log_date, b.start, b.end))
    const w = input.weights.filter(x => x.poids_kg != null && inRange(x.mesure_date, b.start, b.end))
    return {
      label: b.label, start: b.start,
      volume_kg: round2(logs.reduce((s, l) => s + volume(l), 0)),
      series: logs.length,
      seances: input.sessionDates.filter(d => inRange(d, b.start, b.end)).length,
      poids_moyen_kg: w.length ? round1(w.reduce((s, x) => s + Number(x.poids_kg), 0) / w.length) : null,
    }
  })
  const current = round2(buckets.reduce((s, b) => s + b.volume_kg, 0))
  const previous = input.logs.filter(l => inRange(l.log_date, range.prevFrom, range.prevTo)).reduce((s, l) => s + volume(l), 0)
  return {
    period: input.period, from: range.from, to: range.to, buckets,
    totals: {
      volume_kg: current,
      series: buckets.reduce((s, b) => s + b.series, 0),
      seances: buckets.reduce((s, b) => s + b.seances, 0),
      records: input.records,
      delta_volume_pct: previous > 0 ? round1(((current - previous) / previous) * 100) : null,
    },
  }
}

// ── RUM ─────────────────────────────────────────────────
/** Percentile « nearest rank ». */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
}

export interface RumEventLike { name: string; task: string | null; clicks: number | null; duration_ms: number | null; value: number | null }

export function summarizeRum(events: RumEventLike[]) {
  const tasks = new Map<string, RumEventLike[]>()
  const vitals = new Map<string, number[]>()
  for (const e of events) {
    if (e.name === 'task' && e.task) tasks.set(e.task, [...(tasks.get(e.task) ?? []), e])
    if (e.name === 'vital' && e.task && ['LCP', 'INP', 'CLS'].includes(e.task) && e.value != null) vitals.set(e.task, [...(vitals.get(e.task) ?? []), Number(e.value)])
  }
  return {
    tasks: Array.from(tasks.entries()).map(([task, list]) => {
      const clicks = list.filter(e => e.clicks != null).map(e => Number(e.clicks))
      const durations = list.filter(e => e.duration_ms != null).map(e => Number(e.duration_ms))
      return {
        task, count: list.length,
        avg_clicks: clicks.length ? round1(clicks.reduce((s, c) => s + c, 0) / clicks.length) : null,
        p75_duration_ms: percentile(durations, 0.75),
        within_3_clicks_pct: clicks.length ? round1((clicks.filter(c => c <= 3).length / clicks.length) * 100) : null,
      }
    }).sort((a, b) => b.count - a.count),
    vitals: ['LCP', 'INP', 'CLS'].filter(v => vitals.has(v)).map(v => ({ value_name: v, p75: percentile(vitals.get(v)!, 0.75) })),
  }
}
