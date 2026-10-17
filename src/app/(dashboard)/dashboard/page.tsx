import { redirect } from 'next/navigation'
import lazyLoad from 'next/dynamic'
import {
  Users, CalendarDays, Clock, TrendingUp,
  CheckCircle2, AlertCircle,
  CreditCard, Target, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { getServerUser } from '@/lib/session'
import { getCachedDashboard } from '@/lib/cache'
import { profileDao } from '@/dao/profileDao'
import { QuickActions } from '@/features/dashboard/QuickActions'
import { UpcomingSessions } from '@/features/dashboard/UpcomingSessions'
import { DashboardAnimator } from '@/features/dashboard/DashboardAnimator'
import { formatCFA, formatTime } from '@/utils/format'
import { relativeDay, isToday } from '@/utils/date'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'
import { LivePulse } from '@/components/ui/LivePulse'
import { Pagination } from '@/components/ui/Pagination'

const WeeklyChart = lazyLoad(
  () => import('@/features/dashboard/WeeklyChart').then((m) => ({ default: m.WeeklyChart })),
  {
    ssr: false,
    loading: () => (
      <div className="tc-card p-4 space-y-3">
        <Skeleton className="h-4 w-44 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    ),
  }
)

const RevenueWidget = lazyLoad(
  () => import('@/features/dashboard/RevenueWidget').then((m) => ({ default: m.RevenueWidget })),
  {
    ssr: false,
    loading: () => (
      <div className="tc-card p-4 space-y-3">
        <Skeleton className="h-4 w-52 rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    ),
  }
)

const PAGE_SIZE = 10

const HERO_STATS = (clientsActifs: number, seancesCetteSemaine: number, seancesAVenir: number, revenusCeMois: number) => [
  { label: 'Clients actifs',    numValue: clientsActifs,       isCurrency: false, color: '#00FF85', rgb: '0,255,133',   icon: Users },
  { label: 'Séances / semaine', numValue: seancesCetteSemaine, isCurrency: false, color: '#00CFFF', rgb: '0,207,255',   icon: CalendarDays },
  { label: 'À venir',           numValue: seancesAVenir,       isCurrency: false, color: '#7B6FFF', rgb: '123,111,255', icon: Clock },
  { label: 'Ce mois',           numValue: revenusCeMois,       isCurrency: true,  color: '#FFD600', rgb: '255,214,0',   icon: TrendingUp },
]

interface Props {
  searchParams: { page?: string }
}

export default async function DashboardPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const [dashboard, profile] = await Promise.all([
    getCachedDashboard(user.id),
    profileDao.findById(user.id),
  ])
  const { stats, weeklyData, upcomingSessions, revenue30Days, totalRevenue30, totalRevenuePrev30 } = dashboard

  const totalPages      = Math.ceil(upcomingSessions.length / PAGE_SIZE)
  const safePage        = Math.min(page, Math.max(1, totalPages))
  const paginatedSessions = upcomingSessions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const coachNom    = profile?.prenom ?? 'Coach'
  const nextSession = upcomingSessions[0] ?? null

  return (
    <>
    <DashboardAnimator>

      {/* ── HERO ──────────────────────────────────────────── */}
      <div
        data-animate="card"
        className="relative overflow-hidden rounded-3xl px-5 py-6 lg:px-8 lg:py-8 animate-hero-glow"
        style={{
          background: 'linear-gradient(140deg, rgba(0,255,133,0.10) 0%, rgba(5,5,20,0.97) 50%, rgba(0,207,255,0.06) 100%)',
          border:     '1.5px solid rgba(0,255,133,0.20)',
        }}
      >
        {/* Halos décoratifs qui flottent */}
        <div className="pointer-events-none absolute -top-12 -left-12 h-48 w-48 rounded-full animate-float"
          style={{ background: 'radial-gradient(circle, #00FF85 0%, transparent 70%)', opacity: 0.22 }} />
        <div className="pointer-events-none absolute -bottom-12 -right-12 h-40 w-40 rounded-full animate-float-slow"
          style={{ background: 'radial-gradient(circle, #00CFFF 0%, transparent 70%)', opacity: 0.12 }} />

        {/* Greeting */}
        <div data-animate="text">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] mb-2" style={{ color: '#00FF85' }}>
            Tableau de bord
          </p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black leading-tight">
            <span className="text-white">Bienvenue, </span>
            <span className="animate-glow-breathe" style={{ color: '#00FF85' }}>Coach {coachNom}</span>
            <span className="text-white"> 👋</span>
          </h1>
          <p className="mt-2 text-sm text-white/50 max-w-sm">
            Gérez vos clients, séances et revenus — tout en un seul endroit.
          </p>
        </div>

        {/* Mini-stats inline */}
        <div data-animate="card" className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {HERO_STATS(stats.clientsActifs, stats.seancesCetteSemaine, stats.seancesAVenir, stats.revenusCeMois).map(
            ({ label, numValue, isCurrency, color, rgb, icon: Icon }) => (
              <div
                key={label}
                className="flex flex-col gap-1.5 rounded-2xl p-3"
                style={{
                  background: `rgba(${rgb},0.10)`,
                  border:     `1px solid rgba(${rgb},0.22)`,
                }}
              >
                <Icon size={14} style={{ color }} />
                <p
                  className="text-base sm:text-lg font-black leading-none tabular-nums truncate"
                  style={{ color, textShadow: `0 0 14px ${color}80` }}
                >
                  <AnimatedCounter
                    value={numValue}
                    type={isCurrency ? 'currency' : 'number'}
                    duration={1400}
                  />
                </p>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50 leading-none truncate">
                  {label}
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── DEUX COLONNES — style "C'est pour toi si" ── */}
      <div data-animate="card" className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* GAUCHE — Tes atouts (bordure verte) */}
        <div
          className="rounded-3xl p-5"
          style={{
            background: 'linear-gradient(155deg, rgba(0,255,133,0.10) 0%, rgba(5,5,20,0.96) 100%)',
            border:     '1.5px solid rgba(0,255,133,0.38)',
            boxShadow:  '0 0 30px rgba(0,255,133,0.08)',
          }}
        >
          <h2 className="flex items-center gap-2.5 text-base font-black text-white mb-4">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,255,133,0.18)', border: '1px solid rgba(0,255,133,0.42)' }}
            >
              <CheckCircle2 size={14} style={{ color: '#00FF85' }} />
            </span>
            Tes atouts
          </h2>
          <ul className="space-y-3">
            {([
              { num: stats.clientsActifs,           label: 'clients actifs' },
              { num: stats.seancesCetteSemaine,      label: 'séances cette semaine' },
              { num: formatCFA(stats.revenusCeMois), label: 'encaissés ce mois' },
              { num: upcomingSessions.length,        label: 'séances planifiées' },
            ] as { num: number | string; label: string }[]).map(({ num, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: '#00FF85', boxShadow: '0 0 6px rgba(0,255,133,0.60)' }}
                />
                <span className="text-sm">
                  <span className="font-black text-white">{num} </span>
                  <span className="text-white/55">{label}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/stats"
            className="mt-5 flex items-center gap-1.5 text-xs font-bold transition-all duration-200 hover:gap-2.5"
            style={{ color: '#00FF85' }}
          >
            Voir toutes les statistiques <ChevronRight size={13} />
          </Link>
        </div>

        {/* DROITE — Prochaine séance (dark) */}
        <div
          className="rounded-3xl p-5"
          style={{
            background: 'linear-gradient(155deg, rgba(0,207,255,0.07) 0%, rgba(5,5,20,0.96) 100%)',
            border:     '1.5px solid rgba(255,255,255,0.10)',
            boxShadow:  '0 4px 24px rgba(0,0,0,0.35)',
          }}
        >
          <h2 className="flex items-center gap-2.5 text-base font-black text-white mb-4">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,207,255,0.16)', border: '1px solid rgba(0,207,255,0.38)' }}
            >
              <AlertCircle size={14} style={{ color: '#00CFFF' }} />
            </span>
            Prochaine séance
            {nextSession && (() => {
              const diff = new Date(nextSession.date_heure).getTime() - Date.now()
              if (diff > 0 && diff < 3_600_000)   return <LivePulse color="red"   label="IMMINENT" />
              if (isToday(nextSession.date_heure)) return <LivePulse color="green" label="AUJOURD'HUI" />
              return null
            })()}
          </h2>

          {nextSession ? (
            <div className="space-y-3">
              {/* Séance */}
              <div
                className="rounded-2xl p-3.5"
                style={{ background: 'rgba(0,207,255,0.07)', border: '1px solid rgba(0,207,255,0.18)' }}
              >
                <p className="font-black text-white text-sm truncate">{nextSession.titre}</p>
                <p className="text-xs text-white/55 mt-0.5 truncate">
                  {nextSession.clients.prenom} {nextSession.clients.nom}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,207,255,0.15)', color: '#00CFFF' }}
                  >
                    {relativeDay(nextSession.date_heure)}
                  </span>
                  <span className="text-xs text-white/55">{formatTime(nextSession.date_heure)}</span>
                  <span className="text-xs text-white/35">· {nextSession.duree_minutes} min</span>
                </div>
              </div>

              {/* Autres séances */}
              {upcomingSessions.length > 1 && (
                <p className="text-xs text-white/40 text-center">
                  + {upcomingSessions.length - 1} autre{upcomingSessions.length > 2 ? 's' : ''} à venir
                </p>
              )}

              <Link
                href="/sessions"
                className="flex items-center gap-1.5 text-xs font-bold transition-all duration-200 hover:gap-2.5"
                style={{ color: '#00CFFF' }}
              >
                Voir toutes les séances <ChevronRight size={13} />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white/40">Aucune séance planifiée pour le moment.</p>
              <Link
                href="/sessions/new"
                className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105"
                style={{ background: 'rgba(0,207,255,0.12)', border: '1px solid rgba(0,207,255,0.30)', color: '#00CFFF' }}
              >
                + Planifier une séance <ChevronRight size={12} />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── GRILLE FEATURES — style izimentor checkmarks ── */}
      <div data-animate="card" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          {
            icon:  Users,
            color: '#00FF85',
            rgb:   '0,255,133',
            title: 'Suivi client complet',
            sub:   'Fiches, objectifs, historique de séances et paiements',
            href:  '/clients',
          },
          {
            icon:  CalendarDays,
            color: '#00CFFF',
            rgb:   '0,207,255',
            title: 'Planning intelligent',
            sub:   'Séances planifiées, statuts et alertes WhatsApp automatiques',
            href:  '/sessions',
          },
          {
            icon:  CreditCard,
            color: '#FFD600',
            rgb:   '255,214,0',
            title: 'Revenus tracés',
            sub:   'Wave, Orange Money, espèces — chaque paiement enregistré',
            href:  '/payments',
          },
          {
            icon:  Target,
            color: '#7B6FFF',
            rgb:   '123,111,255',
            title: 'Statistiques avancées',
            sub:   'Taux de présence, rétention clients, évolution du CA',
            href:  '/stats',
          },
        ] as const).map(({ icon: Icon, color, rgb, title, sub, href }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-2xl p-4 transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: `linear-gradient(155deg, rgba(${rgb},0.08) 0%, rgba(5,5,20,0.96) 100%)`,
              border:     `1px solid rgba(${rgb},0.22)`,
              boxShadow:  `0 2px 20px rgba(${rgb},0.07)`,
            }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: `rgba(${rgb},0.16)`,
                border:     `1px solid rgba(${rgb},0.38)`,
                boxShadow:  `0 0 14px rgba(${rgb},0.20)`,
              }}
            >
              <Icon size={18} style={{ color }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-white leading-tight">{title}</p>
                <ChevronRight
                  size={13}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color }}
                />
              </div>
              <p className="mt-0.5 text-xs text-white/45 leading-relaxed">{sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── ACTIONS RAPIDES ── */}
      <QuickActions />

      {/* ── REVENUS 30 JOURS + OBJECTIF ── */}
      <div data-scroll>
        <RevenueWidget
          revenue30Days={revenue30Days}
          totalRevenue30={totalRevenue30}
          totalRevenuePrev30={totalRevenuePrev30}
          revenueCeMois={stats.revenusCeMois}
        />
      </div>

      {/* ── GRAPHIQUE HEBDO ── */}
      <div data-scroll>
        <WeeklyChart data={weeklyData} />
      </div>

      {/* ── SÉANCES À VENIR ── */}
      <div data-scroll>
        <UpcomingSessions sessions={paginatedSessions} />
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={upcomingSessions.length}
          hrefForPage={(p) => `/dashboard${p === 1 ? '' : `?page=${p}`}`}
        />
      </div>

    </DashboardAnimator>
    </>
  )
}
