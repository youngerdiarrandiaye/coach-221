import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, CreditCard, Search, TrendingUp, Clock } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { paymentDao } from '@/dao/paymentDao'
import { formatCFA } from '@/utils/format'
import { ExportButton } from '@/features/export/ExportButton'
import { exportPaymentsCSV } from '@/features/export/exportActions'
import { Pagination } from '@/components/ui/Pagination'
import { PaymentsTable } from '@/features/payments/PaymentsTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Paiements' }

const PAGE_SIZE = 10

interface Props {
  searchParams: { q?: string; statut?: string; methode?: string; sort?: string; page?: string }
}

const METHODE_FILTERS = [
  { label: 'Wave',         value: 'WAVE',        color: '#00CFFF' },
  { label: 'Orange Money', value: 'ORANGE_MONEY', color: '#FF8C00' },
  { label: 'Espèces',      value: 'ESPECES',      color: '#00FF85' },
  { label: 'Chèque',       value: 'CHEQUE',       color: '#7B6FFF' },
  { label: 'Virement',     value: 'VIREMENT',     color: '#FF6B35' },
]

const STATUT_FILTERS = [
  { label: 'Tous',       value: '' },
  { label: 'Payés',      value: 'PAYE' },
  { label: 'En attente', value: 'EN_ATTENTE' },
  { label: 'Annulés',    value: 'ANNULE' },
]

const SORT_MAP: Record<string, 'newest' | 'oldest' | 'highest' | 'lowest'> = {
  newest: 'newest', oldest: 'oldest',
  date_asc: 'oldest', date_desc: 'newest',
  amount_asc: 'lowest', amount_desc: 'highest',
}

function buildHref(
  base: { q?: string; statut?: string; methode?: string; sort?: string; page?: string },
  override: Record<string, string>,
) {
  const params = new URLSearchParams()
  const merged = { ...base, ...override }
  if (merged.q)       params.set('q', merged.q)
  if (merged.statut)  params.set('statut', merged.statut)
  if (merged.methode) params.set('methode', merged.methode)
  if (merged.sort && merged.sort !== 'newest') params.set('sort', merged.sort)
  if (merged.page && merged.page !== '1')      params.set('page', merged.page)
  const qs = params.toString()
  return `/payments${qs ? `?${qs}` : ''}`
}

export default async function PaymentsPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const q       = searchParams.q?.trim() ?? ''
  const statut  = searchParams.statut ?? ''
  const methode = searchParams.methode ?? ''
  const page    = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const rawSort = searchParams.sort ?? 'newest'
  const daoSort = SORT_MAP[rawSort] ?? 'newest'

  const filterHref = (override: Record<string, string>) =>
    buildHref({ q, statut, methode, sort: rawSort }, { ...override, page: '1' })

  const [payments, totalMois, totalEnAttente] = await Promise.all([
    paymentDao.findAll(user.id, { search: q || undefined, methode: methode || undefined, sort: daoSort }),
    paymentDao.sumThisMonth(user.id),
    paymentDao.sumPending(user.id),
  ])

  const filtered   = statut ? payments.filter((p) => p.statut === statut) : payments
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Paiements</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton action={exportPaymentsCSV} filename="teranga-paiements.csv" label="CSV" color="#FFD600" />
          <Link
            href="/payments/new"
            className="flex items-center gap-1.5 rounded-2xl bg-primary px-3 sm:px-4 py-2.5 text-sm font-bold text-black transition-all duration-300 hover:scale-[1.03] hover:-translate-y-px"
            style={{ boxShadow: '0 0 20px rgba(0,255,133,0.28)' }}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span className="hidden xs:inline">Nouveau</span>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="tc-card p-4" style={{ borderColor: 'rgba(0,255,133,0.25)', boxShadow: '0 0 24px rgba(0,255,133,0.08)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl" style={{ background: 'rgba(0,255,133,0.15)' }}>
              <TrendingUp size={13} style={{ color: '#00FF85' }} />
            </div>
            <span className="text-xs text-muted-foreground">Ce mois</span>
          </div>
          <p className="text-lg font-black text-white">{formatCFA(totalMois)}</p>
        </div>
        <div className="tc-card p-4" style={{ borderColor: 'rgba(255,214,0,0.25)', boxShadow: '0 0 24px rgba(255,214,0,0.08)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl" style={{ background: 'rgba(255,214,0,0.15)' }}>
              <Clock size={13} style={{ color: '#FFD600' }} />
            </div>
            <span className="text-xs text-muted-foreground">En attente</span>
          </div>
          <p className="text-lg font-black text-white">{formatCFA(totalEnAttente)}</p>
        </div>
      </div>

      {/* Recherche */}
      <form method="GET" action="/payments">
        {statut  && <input type="hidden" name="statut"  value={statut} />}
        {methode && <input type="hidden" name="methode" value={methode} />}
        {rawSort !== 'newest' && <input type="hidden" name="sort" value={rawSort} />}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par client, description…"
            className="h-11 w-full rounded-2xl border border-border bg-card/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            style={{ backdropFilter: 'blur(8px)' }}
          />
        </div>
      </form>

      {/* Filtres méthode */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Link
          href={filterHref({ methode: '' })}
          className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105"
          style={!methode
            ? { background: 'rgba(0,255,133,0.18)', borderColor: 'rgba(0,255,133,0.55)', color: '#00FF85' }
            : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#9090B8' }
          }
        >
          Toutes
        </Link>
        {METHODE_FILTERS.map((m) => (
          <Link
            key={m.value}
            href={filterHref({ methode: methode === m.value ? '' : m.value })}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105 whitespace-nowrap"
            style={methode === m.value
              ? { background: `${m.color}20`, borderColor: `${m.color}55`, color: m.color }
              : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#9090B8' }
            }
          >
            {m.label}
          </Link>
        ))}
      </div>

      {/* Filtres statut */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {STATUT_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={filterHref({ statut: f.value })}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105"
            style={statut === f.value
              ? { background: 'rgba(0,255,133,0.18)', borderColor: 'rgba(0,255,133,0.55)', color: '#00FF85' }
              : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#9090B8' }
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <CreditCard size={28} style={{ color: '#3A3A6A' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">
              {q ? `Aucun résultat pour "${q}"` : 'Aucun paiement enregistré'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Suivez vos revenus de coaching</p>
          </div>
          {!q && !methode && (
            <Link
              href="/payments/new"
              className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105"
              style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.28)', color: '#00FF85' }}
            >
              <Plus size={13} /> Enregistrer un paiement
            </Link>
          )}
        </div>
      ) : (
        <>
          <PaymentsTable payments={paginated} rawSort={rawSort} q={q} statut={statut} methode={methode} />
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            hrefForPage={(p) => buildHref({ q, statut, methode, sort: rawSort }, { page: String(p) })}
          />
        </>
      )}
    </div>
  )
}
