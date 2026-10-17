// Source unique des données du rapport mensuel (aperçu à l'écran et PDF). Fonction pure, sans réseau.
// Dakar est en UTC toute l'année : les jours métier se calculent en UTC (voir workoutMath).
import { addDays, estimate1RM, isoWeek, mondayOf } from '@/lib/workoutMath'

export type ReportRecordType = '1RM' | 'CHARGE' | 'REPS'

export interface ReportProgressLike {
  mesure_date: string
  poids_kg?: number | null
  tour_taille_cm?: number | null
  hanches_cm?: number | null
  bras_cm?: number | null
  cuisse_cm?: number | null
  masse_grasse_pct?: number | null
}

export interface ReportInput {
  client: { id: string; prenom: string; nom: string; objectif: string | null }
  month: string
  coach: string | null
  sessions: { date_heure: string; statut: string }[]
  /** Séries du client, de l'origine jusqu'à la fin du mois (l'avant-mois sert de référence aux records). */
  logs: { log_date: string; exercice_id: string; reps: number; charge_kg: number }[]
  exercises: { id: string; nom: string }[]
  /** Mesures du client, toutes dates. */
  progress: ReportProgressLike[]
}

export interface ReportData {
  client: { id: string; prenom: string; nom: string; objectif: string | null }
  month: string
  coach: string | null
  kpis: {
    seances_effectuees: number; seances_planifiees: number; seances_annulees: number; taux_presence: number | null
    volume_kg: number; series: number; records: number
    poids_debut: number | null; poids_fin: number | null; delta_poids: number | null
  }
  weeks: { label: string; start: string; volume_kg: number; seances_effectuees: number }[]
  poids: { label: string; value: number }[]
  mensurations: { key: string; label: string; unit: string; debut: number | null; fin: number | null; delta: number | null }[]
  records: { exercice: string; type: ReportRecordType; value: number; date: string }[]
}

export const REPORT_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const MAX_RECORDS = 60
const round1 = (n: number) => Math.round(n * 10) / 10
const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const dayOf = (iso: string) => String(iso).slice(0, 10)

export function monthBounds(month: string): { start: string; end: string } {
  if (!REPORT_MONTH_PATTERN.test(month)) throw new Error('Mois invalide.')
  const [y, m] = month.split('-').map(Number)
  return { start: `${month}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
}

/** « octobre 2026 » : libellé français indépendant du fuseau et des données de la machine. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MOIS_LONGS[m - 1]} ${y}`
}

/** Les 6 mois se terminant par `month` (anciens d'abord). */
function lastSixMonths(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  return Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(y, m - 1 - (5 - i), 1)).toISOString().slice(0, 7))
}

const MESURES: { key: string; field: keyof ReportProgressLike; label: string; unit: string }[] = [
  { key: 'tour_taille', field: 'tour_taille_cm', label: 'Tour de taille', unit: 'cm' },
  { key: 'hanches', field: 'hanches_cm', label: 'Hanches', unit: 'cm' },
  { key: 'bras', field: 'bras_cm', label: 'Bras', unit: 'cm' },
  { key: 'cuisse', field: 'cuisse_cm', label: 'Cuisse', unit: 'cm' },
  { key: 'masse_grasse', field: 'masse_grasse_pct', label: 'Masse grasse', unit: '%' },
]

/** Valeur de début (dernière mesure avant le mois, sinon la première du mois) et de fin (dernière du mois). */
function evolution(entries: ReportProgressLike[], field: keyof ReportProgressLike, start: string, end: string) {
  const values = entries
    .map(e => ({ day: dayOf(e.mesure_date), v: finite(e[field]) }))
    .filter((e): e is { day: string; v: number } => e.v !== null)
    .sort((a, b) => a.day.localeCompare(b.day))
  const inMonth = values.filter(e => e.day >= start && e.day <= end)
  if (!inMonth.length) return null
  const before = values.filter(e => e.day < start)
  const debut = before.length ? before[before.length - 1].v : inMonth[0].v
  const fin = inMonth[inMonth.length - 1].v
  const hasReference = before.length > 0 || inMonth.length > 1
  return { debut, fin, delta: hasReference ? round1(fin - debut) : null }
}

function monthlyRecords(input: ReportInput, start: string, end: string): ReportData['records'] {
  const names = new Map(input.exercises.map(e => [e.id, e.nom]))
  const byExercise = new Map<string, { prior: typeof input.logs; month: typeof input.logs }>()
  for (const l of input.logs) {
    const day = dayOf(l.log_date)
    const reps = finite(l.reps), charge = finite(l.charge_kg)
    if (reps === null || charge === null || day > end) continue
    const slot = byExercise.get(l.exercice_id) ?? { prior: [], month: [] }
    if (day < start) slot.prior.push(l)
    else slot.month.push(l)
    byExercise.set(l.exercice_id, slot)
  }
  const types: ReportRecordType[] = ['1RM', 'CHARGE', 'REPS']
  const measure = (l: { reps: number; charge_kg: number }, type: ReportRecordType) =>
    type === '1RM' ? estimate1RM(Number(l.charge_kg), Number(l.reps)) : type === 'CHARGE' ? Number(l.charge_kg) : Number(l.reps)
  const out: ReportData['records'] = []
  for (const [id, slot] of Array.from(byExercise.entries())) {
    if (!slot.month.length) continue
    for (const type of types) {
      const priorBest = slot.prior.length ? Math.max(...slot.prior.map(l => measure(l, type))) : null
      let best = -Infinity, date = ''
      for (const l of slot.month) {
        const v = measure(l, type), day = dayOf(l.log_date)
        if (v > best || (v === best && day < date)) { best = v; date = day }
      }
      if (priorBest === null || best > priorBest) out.push({ exercice: names.get(id) ?? 'Exercice', type, value: round1(best), date })
    }
  }
  const order = (t: ReportRecordType) => types.indexOf(t)
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.exercice.localeCompare(b.exercice, 'fr') || order(a.type) - order(b.type)).slice(0, MAX_RECORDS)
}

export function buildReportData(input: ReportInput): ReportData {
  const { start, end } = monthBounds(input.month)
  const inMonth = (day: string) => day >= start && day <= end

  const sessions = input.sessions.map(s => ({ day: dayOf(new Date(s.date_heure).toISOString()), statut: s.statut })).filter(s => inMonth(s.day))
  const done = sessions.filter(s => s.statut === 'EFFECTUEE')
  const cancelled = sessions.filter(s => s.statut === 'ANNULEE').length
  const planned = sessions.filter(s => s.statut === 'PLANIFIEE').length

  const logs = input.logs
    .map(l => ({ day: dayOf(l.log_date), reps: finite(l.reps), charge: finite(l.charge_kg) }))
    .filter((l): l is { day: string; reps: number; charge: number } => l.reps !== null && l.charge !== null && inMonth(l.day))
  const volumeOf = (list: typeof logs) => list.reduce((s, l) => s + l.reps * l.charge, 0)

  const weeks: ReportData['weeks'] = []
  for (let monday = mondayOf(start); monday <= end; monday = addDays(monday, 7)) {
    const from = monday < start ? start : monday
    const sunday = addDays(monday, 6)
    const to = sunday > end ? end : sunday
    weeks.push({
      label: `S${String(isoWeek(monday)).padStart(2, '0')}`, start: from,
      volume_kg: round1(volumeOf(logs.filter(l => l.day >= from && l.day <= to))),
      seances_effectuees: done.filter(s => s.day >= from && s.day <= to).length,
    })
  }

  const poids = lastSixMonths(input.month).flatMap(m => {
    const values = input.progress.filter(e => dayOf(e.mesure_date).slice(0, 7) === m).map(e => finite(e.poids_kg)).filter((v): v is number => v !== null)
    if (!values.length) return []
    const [y, mm] = m.split('-').map(Number)
    return [{ label: `${MOIS_COURTS[mm - 1]} ${String(y).slice(2)}`, value: round1(values.reduce((s, v) => s + v, 0) / values.length) }]
  })

  const weight = evolution(input.progress, 'poids_kg', start, end)
  const records = monthlyRecords(input, start, end)
  const finished = done.length + cancelled

  return {
    client: { id: input.client.id, prenom: input.client.prenom, nom: input.client.nom, objectif: input.client.objectif },
    month: input.month,
    coach: input.coach,
    kpis: {
      seances_effectuees: done.length, seances_planifiees: planned, seances_annulees: cancelled,
      taux_presence: finished > 0 ? Math.round((done.length / finished) * 100) : null,
      volume_kg: round1(volumeOf(logs)), series: logs.length, records: records.length,
      poids_debut: weight ? weight.debut : null, poids_fin: weight ? weight.fin : null, delta_poids: weight ? weight.delta : null,
    },
    weeks,
    poids,
    mensurations: MESURES.flatMap(m => {
      const e = evolution(input.progress, m.field, start, end)
      return e ? [{ key: m.key, label: m.label, unit: m.unit, debut: e.debut, fin: e.fin, delta: e.delta }] : []
    }),
    records,
  }
}

// ── Message du coach ───────────────────────────────────────

export const MESSAGE_MAX = 600

/** Caractères que la police standard du PDF sait écrire (Latin-1 et ponctuation courante) ; le reste est retiré. */
const UNSUPPORTED = /[^\n\x20-\x7E -ÿ‘’“”–—…€Œœ]/g

/** Texte sûr pour le PDF : jamais interprété comme du balisage, retours à la ligne conservés. */
export function pdfSafe(value: unknown): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/ | /g, ' ').replace(UNSUPPORTED, '')
}

/** Message du coach nettoyé (texte brut). Retourne null s'il est vide ; lève une erreur française au-delà de 600 caractères. */
export function sanitizeMessage(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const normalized = String(raw).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim()
  if (Array.from(normalized).length > MESSAGE_MAX) throw new RangeError(`Le message ne doit pas dépasser ${MESSAGE_MAX} caractères.`)
  const safe = pdfSafe(normalized).replace(/\n{3,}/g, '\n\n').trim()
  return safe || null
}
