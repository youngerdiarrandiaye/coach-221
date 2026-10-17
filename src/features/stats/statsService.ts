import { fetchAll } from '@/server/pagination'
import { retention } from '@/lib/statistics'
import { assertResults } from '@/lib/databaseResult'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { SessionRow, PaymentRow, ClientRow } from '@/entities'

export interface MonthlyRevenue {
  month: string
  shortMonth: string
  revenue: number
  count: number
}

export interface TopClient {
  id: string
  name: string
  initials: string
  revenue: number
  sessions: number
  pct: number
  color: string
}

export interface PaymentMethodStat {
  method: string
  label: string
  total: number
  count: number
  color: string
  pct: number
}

export interface StatsData {
  // KPIs
  totalRevenue: number
  revenueThisMonth: number
  revenuePrevMonth: number
  revenueGrowth: number
  totalSessions: number
  effectuees: number
  annulees: number
  planifiees: number
  tauxPresence: number
  totalClients: number
  clientsActifsRecent: number
  tauxRetention: number
  revenueMoyenParClient: number
  pendingRevenue: number
  // Charts
  monthlyRevenue: MonthlyRevenue[]
  topClients: TopClient[]
  paymentMethods: PaymentMethodStat[]
}

const AVATAR_PALETTES = [
  '#00FF85', '#00CFFF', '#FFD600', '#FF6B35', '#7B6FFF', '#FF3B5C',
]

const METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  WAVE:         { label: 'Wave',          color: '#00CFFF' },
  ORANGE_MONEY: { label: 'Orange Money',  color: '#FF8C00' },
  ESPECES:      { label: 'Espèces',       color: '#00FF85' },
  CHEQUE:       { label: 'Chèque',        color: '#7B6FFF' },
  VIREMENT:     { label: 'Virement',      color: '#FF6B35' },
}

function hashColor(str: string) {
  const hash = str.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
}

function getLast6Months(): { year: number; month: number; label: string; short: string }[] {
  const result = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    result.push({
      year:  d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      label: d.toLocaleDateString('fr-FR', { timeZone: 'Africa/Dakar', month: 'long', year: 'numeric' }),
      short: d.toLocaleDateString('fr-FR', { timeZone: 'Africa/Dakar', month: 'short' }),
    })
  }
  return result
}

export async function getStatsData(coachId: string): Promise<StatsData> {
  const supabase = createServerSupabaseClient()

  const [
    { data: sessionsRaw },
    { data: paymentsRaw },
    { data: clientsRaw },
  ] = assertResults(await Promise.all([
    fetchAll(supabase
      .from('sessions')
      .select('id, statut, date_heure, client_id')
      .eq('coach_id', coachId)),
    fetchAll(supabase
      .from('payments')
      .select('id, montant, statut, methode, date_paiement, client_id')
      .eq('coach_id', coachId)),
    fetchAll(supabase
      .from('clients')
      .select('id, nom, prenom, actif')
      .eq('coach_id', coachId)),
  ] as const))

  const sessions  = (sessionsRaw  ?? []) as Pick<SessionRow, 'id' | 'statut' | 'date_heure' | 'client_id'>[]
  const payments  = (paymentsRaw  ?? []) as Pick<PaymentRow, 'id' | 'montant' | 'statut' | 'methode' | 'date_paiement' | 'client_id'>[]
  const clients   = (clientsRaw   ?? []) as Pick<ClientRow, 'id' | 'nom' | 'prenom' | 'actif'>[]

  // ── Session stats ───────────────────────────────────────────────
  const effectuees = sessions.filter(s => s.statut === 'EFFECTUEE').length
  const annulees   = sessions.filter(s => s.statut === 'ANNULEE').length
  const planifiees = sessions.filter(s => s.statut === 'PLANIFIEE').length
  const done       = effectuees + annulees
  const tauxPresence = done > 0 ? Math.round((effectuees / done) * 100) : 0

  // ── Client retention (active in last 30 days) ───────────────────
  const { totalClients, clientsActifsRecent, tauxRetention } = retention(clients, sessions)

  // ── Revenue ─────────────────────────────────────────────────────
  const paidPayments    = payments.filter(p => p.statut === 'PAYE')
  const totalRevenue    = paidPayments.reduce((s, p) => s + Number(p.montant), 0)
  const pendingRevenue  = payments
    .filter(p => p.statut === 'EN_ATTENTE')
    .reduce((s, p) => s + Number(p.montant), 0)

  const now   = new Date()
  const thisM = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const prevD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const prevM = `${prevD.getUTCFullYear()}-${String(prevD.getUTCMonth() + 1).padStart(2, '0')}`

  const revenueThisMonth = paidPayments
    .filter(p => (p.date_paiement as string).startsWith(thisM))
    .reduce((s, p) => s + Number(p.montant), 0)

  const revenuePrevMonth = paidPayments
    .filter(p => (p.date_paiement as string).startsWith(prevM))
    .reduce((s, p) => s + Number(p.montant), 0)

  const revenueGrowth = revenuePrevMonth > 0
    ? Math.round(((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100)
    : revenueThisMonth > 0 ? 100 : 0

  const revenueMoyenParClient = totalClients > 0
    ? Math.round(totalRevenue / totalClients)
    : 0

  // ── Monthly revenue chart (6 months) ────────────────────────────
  const months = getLast6Months()
  const monthlyRevenue: MonthlyRevenue[] = months.map(({ year, month, label, short }) => {
    const key = `${year}-${String(month).padStart(2, '0')}`
    const slice = paidPayments.filter(p => (p.date_paiement as string).startsWith(key))
    return {
      month:      label,
      shortMonth: short,
      revenue:    slice.reduce((s, p) => s + Number(p.montant), 0),
      count:      slice.length,
    }
  })

  // ── Top 5 clients by revenue ─────────────────────────────────────
  const revenueByClient: Record<string, number> = {}
  paidPayments.forEach(p => {
    revenueByClient[p.client_id as string] = (revenueByClient[p.client_id as string] ?? 0) + Number(p.montant)
  })
  const sessionsByClient: Record<string, number> = {}
  sessions.forEach(s => {
    sessionsByClient[s.client_id as string] = (sessionsByClient[s.client_id as string] ?? 0) + 1
  })
  const maxRevenue = Math.max(...Object.values(revenueByClient), 1)

  const topClients: TopClient[] = clients
    .filter(c => c.actif && revenueByClient[c.id])
    .sort((a, b) => (revenueByClient[b.id] ?? 0) - (revenueByClient[a.id] ?? 0))
    .slice(0, 5)
    .map(c => {
      const name = `${c.prenom} ${c.nom}`
      return {
        id:       c.id,
        name,
        initials: `${c.prenom[0]}${c.nom[0]}`.toUpperCase(),
        revenue:  revenueByClient[c.id] ?? 0,
        sessions: sessionsByClient[c.id] ?? 0,
        pct:      Math.round(((revenueByClient[c.id] ?? 0) / maxRevenue) * 100),
        color:    hashColor(c.id),
      }
    })

  // ── Payment methods breakdown ────────────────────────────────────
  const methodMap: Record<string, { total: number; count: number }> = {}
  paidPayments.forEach(p => {
    const m = p.methode as string
    if (!methodMap[m]) methodMap[m] = { total: 0, count: 0 }
    methodMap[m].total += Number(p.montant)
    methodMap[m].count += 1
  })
  const totalForMethods = Object.values(methodMap).reduce((s, v) => s + v.total, 0)
  const paymentMethods: PaymentMethodStat[] = Object.entries(methodMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([method, { total, count }]) => ({
      method,
      label: METHOD_CONFIG[method]?.label ?? method,
      total,
      count,
      color: METHOD_CONFIG[method]?.color ?? '#9090B8',
      pct:   totalForMethods > 0 ? Math.round((total / totalForMethods) * 100) : 0,
    }))

  return {
    totalRevenue,
    revenueThisMonth,
    revenuePrevMonth,
    revenueGrowth,
    totalSessions: sessions.length,
    effectuees,
    annulees,
    planifiees,
    tauxPresence,
    totalClients,
    clientsActifsRecent,
    tauxRetention,
    revenueMoyenParClient,
    pendingRevenue,
    monthlyRevenue,
    topClients,
    paymentMethods,
  }
}
