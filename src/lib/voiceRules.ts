// Compréhension de la voix : analyseur à règles (français) et assemblage commun avec le chemin IA.
// Fonctions pures, sans réseau, sans base : le serveur fournit la liste des clients du coach et la date du jour.
// Le texte reçu est une donnée non fiable : rien n'est exécuté, on n'en extrait que des champs.
import { addDays, dakarToday } from '@/lib/workoutMath'
import { isCalendarDate } from '@/lib/validation'

export type VoiceIntent = 'client' | 'payment' | 'workout' | 'measure' | 'session'
export type VoiceIntentOrUnknown = VoiceIntent | 'unknown'
export const VOICE_INTENTS: VoiceIntent[] = ['client', 'payment', 'workout', 'measure', 'session']

export interface VoiceClientRef { id: string; prenom: string; nom: string }
export interface VoiceContext { now: Date; clients: VoiceClientRef[]; exercises: string[] }
export interface VoiceResult {
  intent: VoiceIntentOrUnknown
  confidence: number
  source: 'ai' | 'rules'
  degraded: boolean
  fields: Record<string, unknown>
  missing: string[]
  client: { id: string; name: string } | null
  candidates: { id: string; name: string }[]
  warnings: string[]
}
export interface VoiceSet { reps: number; charge_kg: number; rpe: number | null }

export const OBJECTIFS = ['PERTE_DE_POIDS', 'PRISE_DE_MASSE', 'CARDIO', 'TONIFICATION', 'REMISE_EN_FORME', 'REEDUCATION', 'AUTRE'] as const
export const METHODES = ['ESPECES', 'WAVE', 'ORANGE_MONEY'] as const
export const STATUTS_PAIEMENT = ['PAYE', 'EN_ATTENTE'] as const

const REQUIRED: Record<VoiceIntent, string[]> = {
  client: ['prenom', 'nom', 'telephone'],
  payment: ['client_id', 'montant', 'methode'],
  workout: ['client_id', 'exercice', 'sets'],
  measure: ['client_id', 'poids_kg'],
  session: ['client_id', 'titre', 'date_heure'],
}

// ── Normalisation ──────────────────────────────────────────

/** Minuscules, sans accents, apostrophes unifiées, tirets entre lettres remplacés par des espaces. */
export function normalize(text: string): string {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/ | /g, ' ')
    .replace(/(?<=[a-z])[-–—](?=[a-z])/g, ' ').replace(/\s+/g, ' ').trim()
}
const plainOf = (norm: string) => ' ' + norm.replace(/[^a-z0-9]+/g, ' ').trim() + ' '
const num = (s: string) => Number(s.replace(',', '.'))
const title = (s: string) => s.split(/([-'])/).map(p => p.length > 1 || /[a-zà-ÿ]/i.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p).join('')

// ── Nombres en lettres ─────────────────────────────────────

type Kind = 'unit' | 'teen' | 'ten' | 'cent' | 'mille' | 'million'
const WORDS: Record<string, [number, Kind]> = {
  zero: [0, 'unit'], un: [1, 'unit'], une: [1, 'unit'], deux: [2, 'unit'], trois: [3, 'unit'], quatre: [4, 'unit'], cinq: [5, 'unit'], six: [6, 'unit'],
  sept: [7, 'unit'], huit: [8, 'unit'], neuf: [9, 'unit'], dix: [10, 'ten'], onze: [11, 'teen'], douze: [12, 'teen'], treize: [13, 'teen'],
  quatorze: [14, 'teen'], quinze: [15, 'teen'], seize: [16, 'teen'], vingt: [20, 'ten'], vingts: [20, 'ten'], trente: [30, 'ten'], quarante: [40, 'ten'],
  cinquante: [50, 'ten'], soixante: [60, 'ten'], cent: [100, 'cent'], cents: [100, 'cent'], mille: [1000, 'mille'], million: [1_000_000, 'million'], millions: [1_000_000, 'million'],
}
const BIG: Kind[] = ['cent', 'mille', 'million']
type Tok = { w: string; k: Kind }

function canFollow(prev: Tok, cur: Tok): boolean {
  switch (cur.k) {
    case 'unit': return prev.k === 'ten' || BIG.includes(prev.k)
    case 'teen': return BIG.includes(prev.k) || (prev.k === 'ten' && (prev.w === 'soixante' || prev.w.startsWith('vingt')))
    case 'ten':
      if (cur.w === 'dix') return BIG.includes(prev.k) || prev.w === 'soixante' || prev.w.startsWith('vingt')
      if (cur.w.startsWith('vingt')) return prev.w === 'quatre' || BIG.includes(prev.k)
      return BIG.includes(prev.k)
    case 'cent': return prev.k === 'unit' && prev.w !== 'un' && prev.w !== 'une'
    default: return true
  }
}

/** « vingt cinq mille » -> « 25000 », « soixante douze virgule cinq » -> « 72,5 », « 25 000 » -> « 25000 ». */
export function numbersToDigits(norm: string): string {
  let text = norm
    .replace(/\b(\d+(?:,\d+)?)\s*(?:mille|k)\b/g, (_, n) => String(Math.round(num(n) * 1000)))
    .replace(/\b(\d+(?:,\d+)?)\s*millions?\b/g, (_, n) => String(Math.round(num(n) * 1_000_000)))
  text = text.replace(/\b(\d{1,3})(?:[ .]\d{3})+\b/g, m => m.replace(/[ .]/g, ''))
  // la ponctuation après un mot devient un mot à part : elle interrompt un nombre
  text = text.replace(/([a-z])([,;:!?.])(?=\s|$)/g, '$1 $2')
  const tokens = text.split(' ')
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const first = WORDS[tokens[i].replace(/[^a-z]/g, '')]
    const raw = tokens[i]
    if (!first || raw !== raw.replace(/[^a-z]/g, '')) { out.push(raw); i++; continue }
    // « une heure » : le seul cas où « un/une » seul est un nombre
    if (first[0] === 1 && first[1] === 'unit' && !/^heures?$/.test(tokens[i + 1] ?? '')) {
      const next = tokens[i + 1] && WORDS[tokens[i + 1]]
      if (!(next && (next[1] === 'cent' || next[1] === 'mille' || next[1] === 'million') && raw === 'un')) { out.push(raw); i++; continue }
    }
    let total = 0, current = 0, prev: Tok | null = null, consumed = 0, j = i
    while (j < tokens.length) {
      let word = tokens[j]
      let skip = 0
      if (word === 'et' && prev && tokens[j + 1] && WORDS[tokens[j + 1]] && canFollow(prev, { w: tokens[j + 1], k: WORDS[tokens[j + 1]][1] })) { skip = 1; word = tokens[j + 1] }
      const def = WORDS[word]
      if (!def) break
      const tok: Tok = { w: word, k: def[1] }
      if (prev && !canFollow(prev, tok)) break
      if (def[1] === 'cent') current = (current || 1) * 100
      else if (def[1] === 'mille') { total += (current || 1) * 1000; current = 0 }
      else if (def[1] === 'million') { total += (current || 1) * 1_000_000; current = 0 }
      else if (word.startsWith('vingt') && prev?.w === 'quatre') current = current - 4 + 80
      else current += def[0]
      prev = tok; j += 1 + skip; consumed = j - i
    }
    if (consumed === 0) { out.push(raw); i++; continue }
    out.push(String(total + current))
    i += consumed
  }
  return out.join(' ')
    .replace(/\b(\d+)\s+virgule\s+(\d+)\b/g, '$1,$2')
    .replace(/\b(\d+)\s+(heures?\s+)?et\s+demie?\b/g, (_m, n: string, h?: string) => `${n},5${h ? ' ' + h.trim() : ''}`)
}

// ── Dates et heures (Africa/Dakar = UTC) ───────────────────

const MOIS: Record<string, number> = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 }
const JOURS: Record<string, number> = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6 }
const dow = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay()
const pad = (n: number) => String(n).padStart(2, '0')

interface Extracted { date: string | null; time: string | null; duration: number | null; rest: string }

/** Retire de `text` la date, l'heure et la durée annoncées ; `future` : « lundi » = prochain lundi (sinon le dernier). */
export function extractDateTime(text: string, today: string, future: boolean): Extracted {
  let rest = ' ' + text + ' '
  let date: string | null = null, time: string | null = null, duration: number | null = null
  const cut = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(rest)
    if (!m) return false
    fn(m)
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length)
    return true
  }
  const valid = (y: number, m: number, d: number) => { const s = `${y}-${pad(m)}-${pad(d)}`; return isCalendarDate(s) ? s : null }
  const year = Number(today.slice(0, 4))

  // Durée : « 45 minutes », « pendant 1,5 heure », « d'1 heure »
  cut(/(\d+(?:,\d+)?)\s*(?:minutes?|min)\b/, m => { duration = Math.round(num(m[1])) })
  if (duration === null) cut(/(?:\b(?:pendant|durant|duree(?: de)?|dure)\s+|\bd')\s*(\d(?:,\d+)?)\s*(?:heures?|h)\b(?!\s*\d)/, m => { duration = Math.round(num(m[1]) * 60) })

  // Heure : « 17 h », « 17h30 », « 17 heures 30 », « midi »
  if (!cut(/\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?\b/, m => {
    const h = Number(m[1]), mi = m[2] ? Number(m[2]) : 0
    if (h <= 23 && mi <= 59) time = `${pad(h)}:${pad(mi)}`
  })) cut(/\bmidi\b/, () => { time = '12:00' })

  // Date explicite
  cut(/\b(\d{4})-(\d{2})-(\d{2})\b/, m => { date = valid(+m[1], +m[2], +m[3]) })
  if (!date) cut(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => { date = valid(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year, +m[2], +m[1]) })
  if (!date) cut(new RegExp(`\\b(?:le\\s+)?(\\d{1,2})(?:er)?\\s+(${Object.keys(MOIS).join('|')})(?:\\s+(\\d{4}))?\\b`), m => { date = valid(m[3] ? +m[3] : year, MOIS[m[2]], +m[1]) })
  // Date relative
  if (!date) {
    if (cut(/\bapres demain\b/, () => { date = addDays(today, 2) })) { /* fait */ }
    else if (cut(/\bavant hier\b/, () => { date = addDays(today, -2) })) { /* fait */ }
    else if (cut(/\bdemain\b/, () => { date = addDays(today, 1) })) { /* fait */ }
    else if (cut(/\bhier\b/, () => { date = addDays(today, -1) })) { /* fait */ }
    else if (cut(/\b(?:aujourd'?\s?hui|ce soir|ce matin|cet apres midi)\b/, () => { date = today })) { /* fait */ }
    else if (cut(/\bdans (\d+) (jours?|semaines?|mois)\b/, m => { date = addDays(today, +m[1] * (m[2].startsWith('semaine') ? 7 : m[2] === 'mois' ? 30 : 1)) })) { /* fait */ }
    else if (cut(/\bla semaine prochaine\b/, () => { date = addDays(today, 7) })) { /* fait */ }
    else if (cut(new RegExp(`\\b(${Object.keys(JOURS).join('|')})(?:\\s+(prochain|dernier))?\\b`), m => {
      const target = JOURS[m[1]], now = dow(today)
      const goFuture = m[2] ? m[2] === 'prochain' : future
      let diff = goFuture ? (target - now + 7) % 7 : -((now - target + 7) % 7)
      if (diff === 0) diff = goFuture ? 7 : -7
      date = addDays(today, diff)
    })) { /* fait */ }
    else cut(/\ble (\d{1,2})\b/, m => {
      const d = +m[1], tDay = Number(today.slice(8)), tMonth = Number(today.slice(5, 7))
      let y = year, mo = tMonth
      if (future && d < tDay) { mo += 1; if (mo > 12) { mo = 1; y++ } }
      if (!future && d > tDay) { mo -= 1; if (mo < 1) { mo = 12; y-- } }
      date = valid(y, mo, d)
    })
  }
  return { date, time, duration, rest: rest.replace(/\s+/g, ' ').trim() }
}

// ── Détection d'intention ──────────────────────────────────

const INTENT_PRIORITY: VoiceIntent[] = ['client', 'workout', 'measure', 'payment', 'session']

export function scoreIntents(norm: string): Record<VoiceIntent, number> {
  const count = (re: RegExp, weight: number, text = norm) => (text.match(re)?.length ?? 0) * weight
  const noGoal = norm.replace(/\b(perte|prise|perdre|prendre|gagner)( de| du)? poids\b/g, ' ')
  return {
    client: count(/\b(nouveau|nouvelle) (client|cliente|adherent|adherente|eleve)\b/g, 6)
      + count(/\b(ajoute|ajouter|creer|cree|inscrire|inscris|enregistre|enregistrer)\b[^.]*\b(client|cliente|adherent|adherente)\b/g, 6)
      + count(/\bs appelle\b/g, 3) + count(/\bobjectif\b/g, 1),
    payment: count(/\b(paye|payee|payer|paiement|regle|reglement|verse|encaisse|encaisser|recu|abonnement|forfait|mensualite|montant)\b/g, 2)
      + count(/\b(wave|orange money|especes|fcfa|cfa|francs?)\b/g, 2),
    workout: count(/\b(series?|repetitions?|reps?|squat|developpe|souleve|tractions?|pompes?|curl|rowing|fentes?|gainage|tirage|dips|presse|exercice|charge|rpe|entrainement|musculation)\b/g, 2)
      + count(/\b(kilos?|kg)\b/g, 1),
    measure: count(/\b(pese|pesee|poids|mensurations?|hanches?|bras|cuisse|masse grasse|graisse|imc|frequence cardiaque|pouls|cardiaque|tour de (?:taille|hanches?|bras|cuisse))\b/g, 2, noGoal),
    session: count(/\b(seance|rendez vous|rdv|planifie|planifier|programme|programmer|reserve|reserver|agenda)\b/g, 3),
  }
}

export function detectIntent(norm: string): { intent: VoiceIntentOrUnknown; score: number } {
  const scores = scoreIntents(norm)
  let best: VoiceIntent | null = null
  for (const i of INTENT_PRIORITY) if (scores[i] > 0 && (best === null || scores[i] > scores[best])) best = i
  return best ? { intent: best, score: scores[best] } : { intent: 'unknown', score: 0 }
}

// ── Rapprochement des clients (liste du coach uniquement) ──

export function matchClients(norm: string, clients: VoiceClientRef[]): { client: { id: string; name: string } | null; candidates: { id: string; name: string }[] } {
  const plain = plainOf(norm)
  const has = (p: string) => p.length >= 3 && plain.includes(' ' + p + ' ')
  const scored = clients.map(c => {
    const p = plainOf(normalize(c.prenom)).trim(), n = plainOf(normalize(c.nom)).trim()
    let score = 0
    if (p && n && (plain.includes(` ${p} ${n} `) || plain.includes(` ${n} ${p} `))) score = 3
    else if (has(p) && has(n)) score = 2
    else if (has(p) || has(n)) score = 1
    return { c, score }
  }).filter(s => s.score > 0)
  if (!scored.length) return { client: null, candidates: [] }
  const top = Math.max(...scored.map(s => s.score))
  const winners = scored.filter(s => s.score === top).map(s => ({ id: s.c.id, name: `${s.c.prenom} ${s.c.nom}`.trim() }))
  if (winners.length === 1) return { client: winners[0], candidates: [] }
  return { client: null, candidates: winners.slice(0, 5) }
}

// ── Champs par intention ───────────────────────────────────

const NAME_STOP = new Set(['telephone', 'tel', 'numero', 'objectif', 'email', 'mail', 'qui', 'veut', 'voudrait', 'pour', 'de', 'du', 'des', 'avec', 'son', 'sa', 'il', 'elle', 'a', 'est', 'et', 'au', 'le', 'la', 'les', 'un', 'une', 'cherche', 'souhaite', 'dont', 'nom', 'prenom', 'appelle', 'client', 'cliente', 'adherent', 'adherente', 'nouveau', 'nouvelle', 'ajoute', 'ajouter', 'creer', 'cree', 'inscrire', 'inscris', 'enregistre', 'enregistrer', 'madame', 'monsieur', 'mon', 'ma', 'mes', 'ce', 'cette', 'sur', 'dans', 'en', 'eleve'])

function newClientName(original: string): { prenom: string | null; nom: string | null } {
  const tokens = original.split(/\s+/).filter(Boolean)
  const norms = tokens.map(t => normalize(t).replace(/[^a-z']/g, ''))
  let start = -1
  norms.forEach((t, i) => { if (/^(client|cliente|adherent|adherente|eleve|appelle)$/.test(t) || t === "s'appelle") start = i })
  if (start === -1) return { prenom: null, nom: null }
  const names: string[] = []
  for (let i = start + 1; i < tokens.length && names.length < 2; i++) {
    const clean = tokens[i].replace(/[.,;:!?]+$/g, '')
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*$/.test(clean)) break
    if (NAME_STOP.has(norms[i])) { if (names.length) break; else continue }
    names.push(title(clean))
  }
  return { prenom: names[0] ?? null, nom: names[1] ?? null }
}

function extractPhone(norm: string): { phone: string | null; rest: string } {
  const re = /(?:\+?\s?221[ .-]?)?\b(7[0-8])(?:[ .-]?\d){7}\b/
  const m = re.exec(norm)
  if (!m) return { phone: null, rest: norm }
  let digits = m[0].replace(/\D/g, '')
  if (digits.startsWith('221')) digits = digits.slice(3)
  return { phone: digits.length === 9 ? digits : null, rest: (norm.slice(0, m.index) + ' ' + norm.slice(m.index + m[0].length)).replace(/\s+/g, ' ') }
}

function extractEmail(norm: string): { email: string | null; rest: string } {
  const literal = /\b([a-z0-9._+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/.exec(norm)
  if (literal) return { email: literal[1], rest: norm.replace(literal[0], ' ') }
  const spoken = /\b([a-z0-9._+-]+(?: (?:point|tiret|underscore) [a-z0-9]+)*)\s+(?:arobase|arobas)\s+([a-z0-9-]+)\s+point\s+([a-z]{2,6})\b/.exec(norm)
  if (!spoken) return { email: null, rest: norm }
  const local = spoken[1].replace(/ point /g, '.').replace(/ tiret /g, '-').replace(/ underscore /g, '_').replace(/\s/g, '')
  return { email: `${local}@${spoken[2]}.${spoken[3]}`, rest: norm.replace(spoken[0], ' ') }
}

function objectifOf(norm: string): string | null {
  if (/\b(perte de poids|maigrir|mincir|perdre du poids|perdre (?:des )?kilos|minceur)\b/.test(norm)) return 'PERTE_DE_POIDS'
  if (/\b(prise de masse|masse musculaire|grossir|prendre du poids|prendre de la masse|muscler)\b/.test(norm)) return 'PRISE_DE_MASSE'
  if (/\b(remise en forme|reprise|retrouver la forme)\b/.test(norm)) return 'REMISE_EN_FORME'
  if (/\b(reeducation|reeduquer|kine)\b/.test(norm)) return 'REEDUCATION'
  if (/\btonifi\w*\b|\btonus\b/.test(norm)) return 'TONIFICATION'
  if (/\b(cardio|endurance|courir|course)\b/.test(norm)) return 'CARDIO'
  return null
}

function methodeOf(norm: string): string | null {
  if (/\bwave\b/.test(norm)) return 'WAVE'
  if (/\b(orange money|orange|om)\b/.test(norm)) return 'ORANGE_MONEY'
  if (/\b(especes|espece|cash|liquide|en main)\b/.test(norm)) return 'ESPECES'
  return null
}

function amountOf(rest: string, warnings: string[]): number | null {
  const unit = /(\d+(?:,\d+)?)\s*(?:fcfa|f cfa|cfa|francs?|f)\b/.exec(rest)
  let value: number | null = unit ? num(unit[1]) : null
  if (value === null) {
    const all = Array.from(rest.matchAll(/\b(\d+(?:,\d+)?)\b/g)).map(m => num(m[1])).filter(n => n >= 100)
    if (all.length > 1) warnings.push('Plusieurs montants entendus : le premier est retenu, vérifiez-le.')
    value = all[0] ?? null
  }
  if (value === null) return null
  const rounded = Math.round(value)
  if (rounded < 1 || rounded > 9_999_999_999) { warnings.push('Montant hors limites ignoré.'); return null }
  return rounded
}

const BUILT_IN_EXERCISES: [RegExp, string][] = [
  [/\bdeveloppe incline\b/, 'Développé incliné'], [/\bdeveloppe couche\b|\bbench\b/, 'Développé couché'], [/\bdeveloppe militaire\b|\bmilitary\b/, 'Développé militaire'],
  [/\bsouleve de terre\b|\bdeadlift\b/, 'Soulevé de terre'], [/\bsquats?\b/, 'Squat'], [/\btractions?\b/, 'Tractions'], [/\bpompes?\b/, 'Pompes'],
  [/\bcurls?\b/, 'Curl biceps'], [/\browing\b/, 'Rowing'], [/\bfentes?\b/, 'Fentes'], [/\bpresse\b/, 'Presse à cuisses'], [/\bgainage\b|\bplanche\b/, 'Gainage'],
  [/\bdips\b/, 'Dips'], [/\btirage\b/, 'Tirage'], [/\bhip thrust\b/, 'Hip thrust'], [/\babdos\b|\babdominaux\b/, 'Abdominaux'], [/\bburpees?\b/, 'Burpees'],
]

function exerciseOf(norm: string, names: string[]): string | null {
  const plain = plainOf(norm)
  const own = names.map(n => ({ n, p: plainOf(normalize(n)).trim() })).filter(e => e.p.length >= 3 && plain.includes(' ' + e.p + ' ')).sort((a, b) => b.p.length - a.p.length)
  if (own.length) return own[0].n
  for (const [re, name] of BUILT_IN_EXERCISES) if (re.test(norm)) return name
  return null
}

function setsOf(rest: string, warnings: string[]): { sets: VoiceSet[]; rpe: number | null } {
  const rpeM = /\b(?:rpe|effort|difficulte)\s*(?:de|a|:)?\s*(\d+(?:,\d+)?)\b/.exec(rest)
  let rpe = rpeM ? num(rpeM[1]) : null
  if (rpe !== null && (rpe < 1 || rpe > 10)) { warnings.push('RPE hors limites (1 à 10) ignoré.'); rpe = null }
  const body = rpeM ? rest.replace(rpeM[0], ' ') : rest
  const sets: VoiceSet[] = []
  for (const seg of body.split(/\b(?:puis|ensuite|apres ca|apres)\b|;/)) {
    const kg = /(\d+(?:,\d+)?)\s*(?:kg|kilos?|kilogrammes?)\b/.exec(seg)
    let count = 1, reps: number | null = null
    const nx = /\b(\d+)\s*x\s*(\d+)\b/.exec(seg), fois = /\b(\d+)\s*fois\s*(?:de\s*)?(\d+)\b(?!\s*(?:kg|kilo))/.exec(seg)
    const ser = /\b(\d+)\s*series?\b(?:\s*(?:de|x|:)?\s*(\d+)\b(?!\s*(?:kg|kilo)))?/.exec(seg)
    const rm = /\b(\d+)\s*(?:fois|reps?|repetitions?)\b/.exec(seg)
    if (nx) { count = +nx[1]; reps = +nx[2] }
    else if (ser) { count = +ser[1]; reps = ser[2] ? +ser[2] : null; if (reps === null && rm) reps = +rm[1] }
    else if (fois) { count = +fois[1]; reps = +fois[2] }
    else if (rm) reps = +rm[1]
    else { const bw = /\b(\d+)\s+(?:pompes?|tractions?|abdos|abdominaux|burpees?|dips|fentes?|squats?)\b/.exec(seg); if (bw) reps = +bw[1] }
    if (reps === null) continue
    let charge = kg ? num(kg[1]) : null
    if (charge === null) { charge = 0; warnings.push('Charge non précisée : 0 kg (poids du corps) proposé.') }
    if (reps < 1 || reps > 100 || charge < 0 || charge > 1000 || count < 1) { warnings.push('Série hors limites ignorée.'); continue }
    for (let i = 0; i < count && sets.length < 20; i++) sets.push({ reps, charge_kg: Math.round(charge * 100) / 100, rpe })
    if (count > 20) warnings.push('Limité à 20 séries.')
  }
  return { sets, rpe }
}

const MESURES: { field: string; re: RegExp; min: number; max: number; int?: boolean; label: string }[] = [
  { field: 'tour_taille_cm', re: /\btour de taille\D{0,14}?(\d+(?:,\d+)?)/, min: 30, max: 250, label: 'Tour de taille' },
  { field: 'hanches_cm', re: /\b(?:tour de )?hanches?\D{0,14}?(\d+(?:,\d+)?)/, min: 30, max: 250, label: 'Hanches' },
  { field: 'bras_cm', re: /\b(?:tour de )?bras\D{0,14}?(\d+(?:,\d+)?)/, min: 5, max: 100, label: 'Bras' },
  { field: 'cuisse_cm', re: /\b(?:tour de )?cuisses?\D{0,14}?(\d+(?:,\d+)?)/, min: 15, max: 150, label: 'Cuisse' },
  { field: 'masse_grasse_pct', re: /\b(?:masse grasse|taux de graisse|graisse)\D{0,16}?(\d+(?:,\d+)?)/, min: 1, max: 70, label: 'Masse grasse' },
  { field: 'frequence_cardiaque_repos_bpm', re: /\b(?:frequence cardiaque|fc|pouls|cardiaque)\s*(?:au |de )?repos\D{0,14}?(\d+)/, min: 20, max: 220, int: true, label: 'Fréquence cardiaque au repos' },
  { field: 'frequence_cardiaque_effort_bpm', re: /\b(?:frequence cardiaque|fc|pouls|cardiaque)\s*(?:a l |a |en |de )?effort\D{0,14}?(\d+)/, min: 40, max: 300, int: true, label: 'Fréquence cardiaque à l’effort' },
]

function measuresOf(rest: string, warnings: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let text = rest
  for (const m of MESURES) {
    const hit = m.re.exec(text)
    if (!hit) continue
    text = text.replace(hit[0], ' ')
    const v = num(hit[1])
    if (v < m.min || v > m.max || (m.int && !Number.isInteger(v))) { warnings.push(`${m.label} hors plage (${m.min} à ${m.max}) ignorée.`); continue }
    out[m.field] = v
  }
  const p = /\b(?:pese|pesee|poids)\s*(?:de|a|est|environ|:)?\s*(\d+(?:,\d+)?)/.exec(text) ?? /(\d+(?:,\d+)?)\s*(?:kg|kilos?|kilogrammes?)\b/.exec(text)
  if (p) {
    const v = num(p[1])
    if (v < 20 || v > 500) warnings.push('Poids hors plage (20 à 500 kg) ignoré.')
    else out.poids_kg = v
  }
  return out
}

function sessionTitle(original: string, matchedNames: string[]): string | null {
  const tokens = original.split(/\s+/).filter(Boolean)
  const norms = tokens.map(t => normalize(t).replace(/[^a-z0-9']/g, ''))
  const idx = norms.findIndex(t => t === 'seance' || t === 'seances')
  if (idx === -1) return null
  const stop = new Set(['avec', 'pour', 'demain', "aujourd'hui", 'aujourdhui', 'hier', 'a', 'le', 'la', 'ce', 'cet', 'dans', 'apres', 'pendant', 'durant', 'chez', 'et', 'ajoute', 'ajouter', 'prevue', 'prevoir', 'planifier', 'planifie', 'programme', 'programmer', 'ce', 'soir', 'matin', 'midi', 'prochain', 'prochaine', 'heure', 'heures', 'minutes', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'une', 'un', 'sur', 'pour', 'avec', 'en', 'au', 'aux', 'sa', 'son', 'de', 'du', 'des', "d'"])
  const names = new Set(matchedNames)
  const words: string[] = []
  let i = idx + 1
  if (i < tokens.length && /^(de|du|des|d')/.test(norms[i])) { words.push(tokens[i]); i++ }
  for (; i < tokens.length && words.length < 5; i++) {
    const t = norms[i]
    if (!t || /\d/.test(t) || stop.has(t) || names.has(t)) break
    words.push(tokens[i].replace(/[.,;:!?]+$/g, ''))
  }
  if (!words.length || (words.length === 1 && /^(de|du|des|d')/.test(normalize(words[0])))) return null
  const body = words.join(' ').replace(/^d['’]\s*/i, "d'")
  return ('Séance ' + body).slice(0, 100)
}

// ── Assemblage commun (règles et IA) ───────────────────────

function pickDate(today: string, ...cands: unknown[]): string | null {
  for (const c of cands) if (typeof c === 'string' && isCalendarDate(c)) return c
  return null
}

/** Valide et complète les champs d'une intention ; ne garde que les champs de l'intention. */
export function finalizeFields(intent: VoiceIntent, raw: Record<string, unknown>, ctx: { today: string; clientId: string | null }): { fields: Record<string, unknown>; missing: string[] } {
  const f: Record<string, unknown> = {}
  const str = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  if (intent === 'client') {
    f.prenom = str(raw.prenom, 50); f.nom = str(raw.nom, 50)
    const tel = typeof raw.telephone === 'string' ? raw.telephone.replace(/[^\d+]/g, '') : ''
    f.telephone = tel.length >= 8 && tel.length <= 20 ? tel : null
    f.email = typeof raw.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email) ? raw.email.slice(0, 120) : null
    f.objectif = (OBJECTIFS as readonly string[]).includes(String(raw.objectif)) ? raw.objectif : null
    f.sexe = raw.sexe === 'HOMME' || raw.sexe === 'FEMME' ? raw.sexe : null
  } else if (intent === 'payment') {
    f.client_id = ctx.clientId
    const m = typeof raw.montant === 'number' ? Math.round(raw.montant) : null
    f.montant = m !== null && m >= 1 && m <= 9_999_999_999 ? m : null
    f.methode = (METHODES as readonly string[]).includes(String(raw.methode)) ? raw.methode : null
    f.statut = (STATUTS_PAIEMENT as readonly string[]).includes(String(raw.statut)) ? raw.statut : null
    f.date_paiement = pickDate(ctx.today, raw.date_paiement)
  } else if (intent === 'workout') {
    f.client_id = ctx.clientId
    f.exercice = str(raw.exercice, 80)
    const sets = Array.isArray(raw.sets) ? raw.sets.slice(0, 20).flatMap(s => {
      const o = s as Record<string, unknown>
      const reps = Number(o?.reps), charge = Number(o?.charge_kg), rpe = o?.rpe == null ? null : Number(o.rpe)
      if (!Number.isInteger(reps) || reps < 1 || reps > 100 || !Number.isFinite(charge) || charge < 0 || charge > 1000) return []
      return [{ reps, charge_kg: Math.round(charge * 100) / 100, rpe: rpe !== null && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? Math.round(rpe * 10) / 10 : null }]
    }) : []
    f.sets = sets
    f.log_date = pickDate(ctx.today, raw.log_date) ?? ctx.today
  } else if (intent === 'measure') {
    f.client_id = ctx.clientId
    const inRange = (v: unknown, min: number, max: number, int = false) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v)) ? v : null
    f.poids_kg = inRange(raw.poids_kg, 20, 500)
    for (const m of MESURES) f[m.field] = inRange(raw[m.field], m.min, m.max, m.int)
    f.mesure_date = pickDate(ctx.today, raw.mesure_date) ?? ctx.today
  } else {
    f.client_id = ctx.clientId
    f.titre = str(raw.titre, 100)
    const dh = typeof raw.date_heure === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(raw.date_heure) && isCalendarDate(raw.date_heure.slice(0, 10)) ? raw.date_heure : null
    f.date_heure = dh
    const d = pickDate(ctx.today, raw.date)
    if (!dh && d) f.date = d
    const dur = typeof raw.duree_minutes === 'number' ? Math.round(raw.duree_minutes) : null
    f.duree_minutes = dur !== null && dur >= 5 && dur <= 480 ? dur : 60
  }
  const missing = REQUIRED[intent].filter(k => {
    const v = f[k]
    return v === null || v === undefined || (Array.isArray(v) && v.length === 0)
  })
  return { fields: f, missing }
}

export function confidenceOf(intentScore: number, missing: number, required: number): number {
  const filled = required ? (required - missing) / required : 1
  return Math.round(Math.min(0.95, 0.3 + Math.min(intentScore, 8) * 0.04 + filled * 0.4) * 100) / 100
}

/** Champs bruts (avant validation) extraits par les règles pour une intention donnée. */
export function extractRaw(intent: VoiceIntent, transcript: string, ctx: VoiceContext, matched: string[]): { raw: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = []
  const today = dakarToday(ctx.now)
  let norm = normalize(transcript)
  const { phone, rest: afterPhone } = extractPhone(norm)
  const { email, rest: afterEmail } = extractEmail(afterPhone)
  norm = afterEmail
  const digits = numbersToDigits(norm)
  const future = intent === 'session'
  const dt = extractDateTime(digits, today, future)
  const raw: Record<string, unknown> = {}
  if (intent === 'client') {
    Object.assign(raw, newClientName(transcript), { telephone: phone, email, objectif: objectifOf(norm) })
    if (/\b(cliente|madame|elle|femme|nouvelle)\b/.test(norm)) raw.sexe = 'FEMME'
    else if (/\b(monsieur|homme|garcon|il)\b/.test(norm)) raw.sexe = 'HOMME'
  } else if (intent === 'payment') {
    raw.montant = amountOf(dt.rest, warnings)
    raw.methode = methodeOf(norm)
    if (/\b(en attente|pas encore|doit|reste a payer|n a pas paye|impaye|promis|devra)\b/.test(norm.replace(/'/g, ' '))) raw.statut = 'EN_ATTENTE'
    else if (/\b(paye|payee|regle|verse|recu|encaisse|donne)\b/.test(norm)) raw.statut = 'PAYE'
    raw.date_paiement = dt.date
  } else if (intent === 'workout') {
    raw.exercice = exerciseOf(norm, ctx.exercises)
    raw.sets = setsOf(dt.rest, warnings).sets
    raw.log_date = dt.date
  } else if (intent === 'measure') {
    Object.assign(raw, measuresOf(dt.rest, warnings))
    raw.mesure_date = dt.date
  } else {
    raw.titre = sessionTitle(transcript, matched)
    raw.duree_minutes = dt.duration
    if (dt.date && dt.time) raw.date_heure = `${dt.date}T${dt.time}`
    else if (dt.date) { raw.date = dt.date; warnings.push('Heure non précisée : indiquez-la dans le formulaire.') }
  }
  return { raw, warnings }
}

/** Mots du client reconnu (pour ne pas les confondre avec un titre). */
function nameWords(refs: { name: string }[]): string[] {
  return refs.flatMap(r => normalize(r.name).split(/\s+/)).map(w => w.replace(/[^a-z0-9']/g, ''))
}

/** Analyse complète à règles : intention (imposée ou détectée), champs, client, manquants. */
export function parseWithRules(transcript: string, hint: VoiceIntentOrUnknown | 'auto' | undefined, ctx: VoiceContext): VoiceResult {
  const norm = normalize(transcript)
  const detected = detectIntent(norm)
  const intent: VoiceIntentOrUnknown = hint && hint !== 'auto' ? hint : detected.intent
  if (intent === 'unknown') {
    return { intent, confidence: 0, source: 'rules', degraded: false, fields: {}, missing: [], client: null, candidates: [], warnings: ['Je n’ai pas compris la demande. Précisez : client, paiement, entraînement, mesure ou séance.'] }
  }
  const match = intent === 'client' ? { client: null, candidates: [] } : matchClients(norm, ctx.clients)
  const { raw, warnings } = extractRaw(intent, transcript, ctx, nameWords(match.client ? [match.client] : match.candidates))
  const shaped = shapeResult(intent, raw, match, warnings, { today: dakarToday(ctx.now), clients: ctx.clients })
  const required = REQUIRED[intent].length
  return { ...shaped, intent, source: 'rules', degraded: false, confidence: confidenceOf(Math.max(detected.score, hint && hint !== 'auto' ? 4 : 0), shaped.missing.length, required) }
}

/** Valide les champs bruts, complète les avertissements (ambiguïté, doublon) et prépare la réponse. */
export function shapeResult(intent: VoiceIntent, raw: Record<string, unknown>, match: { client: { id: string; name: string } | null; candidates: { id: string; name: string }[] },
  warnings: string[], ctx: { today: string; clients: VoiceClientRef[] }): Pick<VoiceResult, 'fields' | 'missing' | 'client' | 'candidates' | 'warnings'> {
  const { fields, missing } = finalizeFields(intent, raw, { today: ctx.today, clientId: match.client?.id ?? null })
  const out = [...warnings]
  if (intent !== 'client' && !match.client && match.candidates.length > 1) out.push('Plusieurs clients correspondent : choisissez le bon.')
  if (intent !== 'client' && !match.client && !match.candidates.length) out.push('Aucun client de votre liste ne correspond au nom entendu.')
  if (intent === 'client' && fields.prenom && fields.nom) {
    const a = normalize(`${fields.prenom} ${fields.nom}`)
    if (ctx.clients.some(c => normalize(`${c.prenom} ${c.nom}`) === a)) out.push('Un client portant ce nom existe déjà.')
  }
  return { fields, missing, client: intent === 'client' ? null : match.client, candidates: intent === 'client' ? [] : match.candidates, warnings: Array.from(new Set(out)) }
}
