// Synthèse pour l'espace client : semaines récentes, journal des derniers jours. Fonctions pures (sans accès base).
// Les jours sont des dates calendaires « AAAA-MM-JJ » à l'heure de Dakar (UTC+0, sans changement d'heure).

export interface DigestSession { date_heure: string; statut: 'PLANIFIEE' | 'EFFECTUEE' | 'ANNULEE'; titre: string; duree_minutes: number }
export interface DigestLog { log_date: string; exercice_id: string; reps: number; charge_kg: number }
export interface DigestMeasure { mesure_date: string; poids_kg: number | null }

export interface WeekDigest {
  /** Lundi de la semaine (AAAA-MM-JJ). */
  start: string
  /** Dimanche de la semaine. */
  end: string
  sessionsDone: number
  sessionsPlanned: number
  sets: number
  /** Volume soulevé : somme des répétitions × charge, en kg. */
  volumeKg: number
  /** Poids moyen des mesures de la semaine, ou null s'il n'y en a pas. */
  weightKg: number | null
}

export interface JournalEntry { date: string; kind: 'seance' | 'entrainement' | 'mesure'; label: string }

const DAY = 86_400_000
const dayOf = (iso: string) => iso.slice(0, 10)
const toMs = (day: string) => Date.parse(day + 'T00:00:00Z')
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Lundi de la semaine qui contient `day`. */
export function weekStart(day: string): string {
  const ms = toMs(day)
  const weekday = (new Date(ms).getUTCDay() + 6) % 7   // lundi = 0
  return toDay(ms - weekday * DAY)
}

/** Les `count` dernières semaines (la plus récente d'abord), la semaine en cours comprise. */
export function buildWeeks(input: { today: string; sessions: DigestSession[]; logs: DigestLog[]; measures: DigestMeasure[]; count?: number }): WeekDigest[] {
  const count = input.count ?? 8
  const first = toMs(weekStart(input.today))
  const weeks: WeekDigest[] = []
  for (let i = 0; i < count; i++) {
    const start = toDay(first - i * 7 * DAY)
    const end = toDay(toMs(start) + 6 * DAY)
    const inWeek = (day: string) => day >= start && day <= end
    const sessions = input.sessions.filter(s => inWeek(dayOf(s.date_heure)))
    const logs = input.logs.filter(l => inWeek(l.log_date))
    const weights = input.measures.filter(m => m.poids_kg != null && inWeek(m.mesure_date)).map(m => Number(m.poids_kg))
    weeks.push({
      start, end,
      sessionsDone: sessions.filter(s => s.statut === 'EFFECTUEE').length,
      sessionsPlanned: sessions.filter(s => s.statut !== 'ANNULEE').length,
      sets: logs.length,
      volumeKg: Math.round(logs.reduce((total, l) => total + l.reps * l.charge_kg, 0)),
      weightKg: weights.length ? Math.round(weights.reduce((a, b) => a + b, 0) / weights.length * 10) / 10 : null,
    })
  }
  return weeks
}

/** Journal des `days` derniers jours : séances effectuées, jours d'entraînement et pesées, du plus récent au plus ancien. */
export function buildJournal(input: { today: string; days?: number; sessions: DigestSession[]; logs: DigestLog[]; measures: DigestMeasure[] }): JournalEntry[] {
  const from = toDay(toMs(input.today) - ((input.days ?? 14) - 1) * DAY)
  const within = (day: string) => day >= from && day <= input.today
  const entries: JournalEntry[] = []
  for (const s of input.sessions) {
    const date = dayOf(s.date_heure)
    if (s.statut === 'EFFECTUEE' && within(date)) entries.push({ date, kind: 'seance', label: `${s.titre} · ${s.duree_minutes} min` })
  }
  const byDay = new Map<string, { sets: number; exercises: Set<string> }>()
  for (const l of input.logs) {
    if (!within(l.log_date)) continue
    const day = byDay.get(l.log_date) ?? { sets: 0, exercises: new Set<string>() }
    day.sets++; day.exercises.add(l.exercice_id); byDay.set(l.log_date, day)
  }
  byDay.forEach((d, date) => entries.push({ date, kind: 'entrainement', label: `${d.exercises.size} exercice${d.exercises.size > 1 ? 's' : ''}, ${d.sets} série${d.sets > 1 ? 's' : ''}` }))
  for (const m of input.measures) {
    if (m.poids_kg != null && within(m.mesure_date)) entries.push({ date: m.mesure_date, kind: 'mesure', label: `Pesée : ${Number(m.poids_kg).toString().replace('.', ',')} kg` })
  }
  const order = { seance: 0, entrainement: 1, mesure: 2 }
  return entries.sort((a, b) => b.date.localeCompare(a.date) || order[a.kind] - order[b.kind])
}
