import { retention } from '@/lib/statistics'
import { assertResults } from '@/lib/databaseResult'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/config/supabase.admin'
import {
  getStartOfWeek,
  getEndOfWeek,
  getDayLabel,
  getStartOfMonth,
  getEndOfMonth,
} from '@/utils/date'
import type { DashboardStats, WeeklyDay, DailyRevenue } from '@/services/dashboardService'
import type { SessionWithClient } from '@/dao/sessionDao'
import type {
  StatsData,
  MonthlyRevenue,
  TopClient,
  PaymentMethodStat,
} from '@/features/stats/statsService'

// ─── Dashboard ─────────────────────────────────────────────── TTL: 30s ───

async function fetchDashboardData(coachId: string): Promise<{
  stats: DashboardStats
  weeklyData: WeeklyDay[]
  upcomingSessions: SessionWithClient[]
  revenue30Days: DailyRevenue[]
  totalRevenue30: number
  totalRevenuePrev30: number
}> {
  const sb = createAdminSupabaseClient()
  const now        = new Date().toISOString()
  const weekStart  = getStartOfWeek().toISOString()
  const weekEnd    = getEndOfWeek().toISOString()
  const monthStart = getStartOfMonth().toISOString().split('T')[0]
  const monthEnd   = getEndOfMonth().toISOString().split('T')[0]

  const now30  = new Date(); now30.setUTCDate(now30.getUTCDate() - 29)
  const now60  = new Date(); now60.setUTCDate(now60.getUTCDate() - 59)
  const date30 = now30.toISOString().split('T')[0]
  const date60 = now60.toISOString().split('T')[0]
  const today  = new Date().toISOString().split('T')[0]

  const [
    { count: clientsActifs },
    { count: seancesCetteSemaine },
    { count: seancesAVenir },
    { data: paidThisMonth },
    { data: weekSessions },
    { data: upcoming },
    { data: paid60Days },
  ] = assertResults(await Promise.all([
    sb.from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId).eq('actif', true),
    sb.from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId)
      .gte('date_heure', weekStart).lte('date_heure', weekEnd),
    sb.from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coachId).eq('statut', 'PLANIFIEE').gte('date_heure', now),
    sb.from('payments')
      .select('montant')
      .eq('coach_id', coachId).eq('statut', 'PAYE')
      .gte('date_paiement', monthStart).lte('date_paiement', monthEnd),
    sb.from('sessions')
      .select('id, date_heure, client_id')
      .eq('coach_id', coachId)
      .gte('date_heure', weekStart).lte('date_heure', weekEnd),
    sb.from('sessions')
      .select('*, clients(nom, prenom, telephone, avatar_url)')
      .eq('coach_id', coachId).eq('statut', 'PLANIFIEE')
      .gte('date_heure', now)
      .order('date_heure', { ascending: true })
,
    sb.from('payments')
      .select('montant, date_paiement')
      .eq('coach_id', coachId).eq('statut', 'PAYE')
      .gte('date_paiement', date60).lte('date_paiement', today),
  ] as const))

  const stats: DashboardStats = {
    clientsActifs:      clientsActifs       ?? 0,
    seancesCetteSemaine: seancesCetteSemaine ?? 0,
    seancesAVenir:      seancesAVenir       ?? 0,
    revenusCeMois: (paidThisMonth ?? []).reduce((s, r) => s + Number(r.montant), 0),
  }

  const monday = getStartOfWeek()
  const weeklyData: WeeklyDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    const iso = d.toISOString().split('T')[0]
    return { label: getDayLabel(iso), date: iso, count: 0 }
  })
  for (const s of (weekSessions ?? [])) {
    const day = (s.date_heure as string).split('T')[0]
    const slot = weeklyData.find(d => d.date === day)
    if (slot) slot.count++
  }

  // ── Revenue 30-day rolling windows ─────────────────────────
  const paid60 = (paid60Days ?? []) as { montant: number; date_paiement: string }[]

  const dailyMap: Record<string, number> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - (29 - i))
    dailyMap[d.toISOString().split('T')[0]] = 0
  }
  let totalRevenue30   = 0
  let totalRevenuePrev30 = 0
  for (const p of paid60) {
    const d = p.date_paiement as string
    const amt = Number(p.montant)
    if (d >= date30) {
      dailyMap[d] = (dailyMap[d] ?? 0) + amt
      totalRevenue30 += amt
    } else {
      totalRevenuePrev30 += amt
    }
  }
  const revenue30Days: DailyRevenue[] = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }))

  return {
    stats,
    weeklyData,
    upcomingSessions: (upcoming ?? []) as unknown as SessionWithClient[],
    revenue30Days,
    totalRevenue30,
    totalRevenuePrev30,
  }
}

export const getCachedDashboard = (coachId: string) =>
  unstable_cache(
    () => fetchDashboardData(coachId),
    [`dashboard-${coachId}`],
    { revalidate: 30, tags: [`dashboard-${coachId}`] },
  )()

// ─── Stats ─────────────────────────────────────────────────── TTL: 300s ───

const AVATAR_PALETTES = ['#00FF85', '#00CFFF', '#FFD600', '#FF6B35', '#7B6FFF', '#FF3B5C']
const METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  WAVE:         { label: 'Wave',         color: '#00CFFF' },
  ORANGE_MONEY: { label: 'Orange Money', color: '#FF8C00' },
  ESPECES:      { label: 'Espèces',      color: '#00FF85' },
  CHEQUE:       { label: 'Chèque',       color: '#7B6FFF' },
  VIREMENT:     { label: 'Virement',     color: '#FF6B35' },
}

function hashColor(str: string) {
  const hash = str.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
}

function getLast6Months() {
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

async function fetchStatsData(coachId: string): Promise<StatsData> {
  const sb = createAdminSupabaseClient()

  const [
    { data: sessionsRaw },
    { data: paymentsRaw },
    { data: clientsRaw },
  ] = assertResults(await Promise.all([
    sb.from('sessions').select('id, statut, date_heure, client_id').eq('coach_id', coachId),
    sb.from('payments').select('id, montant, statut, methode, date_paiement, client_id').eq('coach_id', coachId),
    sb.from('clients').select('id, nom, prenom, actif').eq('coach_id', coachId),
  ] as const))

  const sessions = sessionsRaw  ?? []
  const payments = paymentsRaw  ?? []
  const clients  = clientsRaw   ?? []

  const effectuees   = sessions.filter(s => s.statut === 'EFFECTUEE').length
  const annulees     = sessions.filter(s => s.statut === 'ANNULEE').length
  const planifiees   = sessions.filter(s => s.statut === 'PLANIFIEE').length
  const done         = effectuees + annulees
  const tauxPresence = done > 0 ? Math.round((effectuees / done) * 100) : 0

  const { totalClients, clientsActifsRecent, tauxRetention } = retention(clients, sessions)

  const paidPayments   = payments.filter(p => p.statut === 'PAYE')
  const totalRevenue   = paidPayments.reduce((s, p) => s + Number(p.montant), 0)
  const pendingRevenue = payments.filter(p => p.statut === 'EN_ATTENTE').reduce((s, p) => s + Number(p.montant), 0)

  const now  = new Date()
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
  const revenueMoyenParClient = totalClients > 0 ? Math.round(totalRevenue / totalClients) : 0

  const months = getLast6Months()
  const monthlyRevenue: MonthlyRevenue[] = months.map(({ year, month, label, short }) => {
    const key   = `${year}-${String(month).padStart(2, '0')}`
    const slice = paidPayments.filter(p => (p.date_paiement as string).startsWith(key))
    return { month: label, shortMonth: short, revenue: slice.reduce((s, p) => s + Number(p.montant), 0), count: slice.length }
  })

  const revenueByClient: Record<string, number> = {}
  paidPayments.forEach(p => {
    const id = p.client_id as string
    revenueByClient[id] = (revenueByClient[id] ?? 0) + Number(p.montant)
  })
  const sessionsByClient: Record<string, number> = {}
  sessions.forEach(s => {
    const id = s.client_id as string
    sessionsByClient[id] = (sessionsByClient[id] ?? 0) + 1
  })
  const maxRevenue = Math.max(...Object.values(revenueByClient), 1)

  const topClients: TopClient[] = clients
    .filter(c => c.actif && revenueByClient[c.id as string])
    .sort((a, b) => (revenueByClient[b.id as string] ?? 0) - (revenueByClient[a.id as string] ?? 0))
    .slice(0, 5)
    .map(c => {
      const name = `${c.prenom} ${c.nom}`
      const id   = c.id as string
      return {
        id,
        name,
        initials: `${(c.prenom as string)[0]}${(c.nom as string)[0]}`.toUpperCase(),
        revenue:  revenueByClient[id] ?? 0,
        sessions: sessionsByClient[id] ?? 0,
        pct:      Math.round(((revenueByClient[id] ?? 0) / maxRevenue) * 100),
        color:    hashColor(id),
      }
    })

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
    totalRevenue, revenueThisMonth, revenuePrevMonth, revenueGrowth,
    totalSessions: sessions.length, effectuees, annulees, planifiees,
    tauxPresence, totalClients, clientsActifsRecent, tauxRetention,
    revenueMoyenParClient, pendingRevenue,
    monthlyRevenue, topClients, paymentMethods,
  }
}

export const getCachedStatsData = (coachId: string) =>
  unstable_cache(
    () => fetchStatsData(coachId),
    [`stats-${coachId}`],
    { revalidate: 300, tags: [`stats-${coachId}`] },
  )()
