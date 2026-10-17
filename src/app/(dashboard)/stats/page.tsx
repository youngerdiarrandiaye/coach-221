import type { Metadata } from 'next'
import {
  BarChart3, TrendingUp, Users, CalendarDays,
  CreditCard, Clock, Award, Wallet,
} from 'lucide-react'
import lazyLoad from 'next/dynamic'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/session'
import { getCachedStatsData } from '@/lib/cache'
import { TopClients } from '@/features/stats/TopClients'
import { PaymentMethodBars } from '@/features/stats/PaymentMethodBars'
import { StatsAnimator } from '@/features/stats/StatsAnimator'
import { KpiCard } from '@/features/stats/KpiCard'
import { StatsHeroNumbers } from '@/features/stats/StatsHeroNumbers'

export const metadata: Metadata = { title: 'Statistiques' }

const RevenueChart  = lazyLoad(() => import('@/features/stats/RevenueChart').then(m => ({ default: m.RevenueChart })), { ssr: false })
const SessionsDonut = lazyLoad(() => import('@/features/stats/SessionsDonut').then(m => ({ default: m.SessionsDonut })), { ssr: false })

function formatCFA(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M FCFA`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k FCFA`
  return `${v.toLocaleString('fr-FR')} FCFA`
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="tc-card overflow-hidden"
      style={{
        background: 'linear-gradient(155deg,rgba(18,18,42,0.97) 0%,rgba(10,10,24,0.99) 100%)',
      }}
    >
      <div
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {icon}
        <h2 className="text-sm font-black text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default async function StatsPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const s = await getCachedStatsData(user.id)

  return (
    <StatsAnimator>

      {/* ── Hero Banner ────────────────────────────────────── */}
      <div
        data-animate="card"
        className="relative overflow-hidden rounded-2xl p-5 lg:p-6 animate-hero-glow"
        style={{
          background: 'linear-gradient(135deg,rgba(0,255,133,0.12) 0%,rgba(3,3,9,0.95) 60%)',
          border: '1px solid rgba(0,255,133,0.22)',
        }}
      >
        {/* Halos flottants */}
        <div
          className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full animate-float"
          style={{ background: 'radial-gradient(circle, #00FF85 0%, transparent 70%)', opacity: 0.18 }}
        />
        <div
          className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full animate-float-slow"
          style={{ background: 'radial-gradient(circle, #00CFFF 0%, transparent 70%)', opacity: 0.10 }}
        />

        {/* Titre */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(0,255,133,0.22)', border: '1px solid rgba(0,255,133,0.42)', backdropFilter: 'blur(8px)' }}
          >
            <BarChart3 size={20} style={{ color: '#00FF85' }} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Statistiques</h1>
            <p className="text-xs text-white/50 mt-0.5">Vue d&apos;ensemble de votre activité</p>
          </div>
        </div>

        {/* Hero KPIs animés */}
        <StatsHeroNumbers
          totalRevenue={s.totalRevenue}
          totalSessions={s.totalSessions}
          totalClients={s.totalClients}
        />
      </div>

      {/* ── KPI Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingUp size={18} style={{ color: '#00CFFF' }} />}
          label="Ce mois-ci"
          numValue={s.revenueThisMonth}
          counterType="currency"
          sub={s.revenuePrevMonth > 0 ? `vs ${formatCFA(s.revenuePrevMonth)}` : undefined}
          color="#00CFFF"
          trend={s.revenueGrowth}
        />
        <KpiCard
          icon={<Clock size={18} style={{ color: '#FFD600' }} />}
          label="En attente"
          numValue={s.pendingRevenue}
          counterType="currency"
          color="#FFD600"
        />
        <KpiCard
          icon={<Award size={18} style={{ color: '#00FF85' }} />}
          label="Taux de présence"
          numValue={s.tauxPresence}
          suffix="%"
          sub="séances effectuées"
          color="#00FF85"
        />
        <KpiCard
          icon={<Wallet size={18} style={{ color: '#7B6FFF' }} />}
          label="Moy. / client"
          numValue={s.revenueMoyenParClient}
          counterType="currency"
          color="#7B6FFF"
        />
        <KpiCard
          icon={<CalendarDays size={18} style={{ color: '#00FF85' }} />}
          label="Effectuées"
          numValue={s.effectuees}
          sub={`${s.planifiees} planifiées`}
          color="#00FF85"
        />
        <KpiCard
          icon={<CreditCard size={18} style={{ color: '#FF3B5C' }} />}
          label="Annulées"
          numValue={s.annulees}
          color="#FF3B5C"
        />
        <KpiCard
          icon={<Users size={18} style={{ color: '#FF6B35' }} />}
          label="Clients actifs"
          numValue={s.clientsActifsRecent}
          sub="30 derniers jours"
          color="#FF6B35"
        />
        <KpiCard
          icon={<TrendingUp size={18} style={{ color: '#00CFFF' }} />}
          label="Rétention"
          numValue={s.tauxRetention}
          suffix="%"
          sub={`sur ${s.totalClients} clients`}
          color="#00CFFF"
        />
      </div>

      {/* ── Graphiques ─────────────────────────────────────── */}
      <div data-scroll className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Évolution du CA (6 mois)"
            icon={<BarChart3 size={15} style={{ color: '#00FF85' }} />}
          >
            <RevenueChart data={s.monthlyRevenue} />
          </SectionCard>
        </div>
        <SectionCard
          title="Répartition séances"
          icon={<CalendarDays size={15} style={{ color: '#00CFFF' }} />}
        >
          <SessionsDonut
            effectuees={s.effectuees}
            planifiees={s.planifiees}
            annulees={s.annulees}
          />
        </SectionCard>
      </div>

      {/* ── Bas de page ────────────────────────────────────── */}
      <div data-scroll className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Top clients (par revenu)"
          icon={<Award size={15} style={{ color: '#FFD600' }} />}
        >
          <TopClients clients={s.topClients} />
        </SectionCard>
        <SectionCard
          title="Méthodes de paiement"
          icon={<CreditCard size={15} style={{ color: '#7B6FFF' }} />}
        >
          <PaymentMethodBars methods={s.paymentMethods} />
        </SectionCard>
      </div>
    </StatsAnimator>
  )
}
