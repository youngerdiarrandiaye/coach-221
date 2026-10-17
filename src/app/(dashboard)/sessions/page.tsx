import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, CalendarDays, Search, UserRound, RotateCcw } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { sessionDao } from '@/dao/sessionDao'
import { clientDao } from '@/dao/clientDao'
import { ExportButton } from '@/features/export/ExportButton'
import { exportSessionsCSV } from '@/features/export/exportActions'
import { Pagination } from '@/components/ui/Pagination'
import { SessionsTable } from '@/features/sessions/SessionsTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Séances' }

const PAGE_SIZE = 10

interface Props {
  searchParams: { q?: string; statut?: string; clientId?: string; sort?: string; page?: string }
}

const FILTER_OPTIONS = [
  { label: 'Toutes',      value: '' },
  { label: 'À venir',    value: 'PLANIFIEE' },
  { label: 'Effectuées', value: 'EFFECTUEE' },
  { label: 'Annulées',   value: 'ANNULEE' },
]

function buildHref(
  base: { q?: string; statut?: string; clientId?: string; sort?: string; page?: string },
  override: Record<string, string>,
) {
  const params = new URLSearchParams()
  const merged = { ...base, ...override }
  if (merged.q)        params.set('q', merged.q)
  if (merged.statut)   params.set('statut', merged.statut)
  if (merged.clientId) params.set('clientId', merged.clientId)
  if (merged.sort && merged.sort !== 'newest') params.set('sort', merged.sort)
  if (merged.page && merged.page !== '1')      params.set('page', merged.page)
  const qs = params.toString()
  return `/sessions${qs ? `?${qs}` : ''}`
}

export default async function SessionsPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const q        = searchParams.q?.trim() ?? ''
  const statut   = searchParams.statut ?? ''
  const clientId = searchParams.clientId ?? ''
  const sort     = (searchParams.sort as 'newest' | 'oldest') ?? 'newest'
  const page     = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const filterHref = (override: Record<string, string>) =>
    buildHref({ q, statut, clientId, sort }, { ...override, page: '1' })

  const [sessions, clients] = await Promise.all([
    sessionDao.findAll(user.id, { search: q || undefined, clientId: clientId || undefined, sort }),
    clientDao.findAll(user.id),
  ])

  const filtered   = statut ? sessions.filter((s) => s.statut === statut) : sessions
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const todayStr = new Date().toISOString().slice(0, 10)
  const selectedClient = clients.find((c) => c.id === clientId)

  const sortDateHref = buildHref(
    { q, statut, clientId, sort },
    { sort: sort === 'newest' ? 'oldest' : 'newest', page: '1' },
  )

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Séances</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} séance{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton action={exportSessionsCSV} filename="teranga-seances.csv" label="CSV" color="#00CFFF" />
          <Link
            href="/sessions/recurrences"
            className="flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all duration-300 hover:scale-[1.03] hover:-translate-y-px"
            style={{ background: 'rgba(123,111,255,0.14)', border: '1.5px solid rgba(123,111,255,0.35)', color: '#7B6FFF' }}
          >
            <RotateCcw size={15} strokeWidth={2.5} />
            <span className="hidden sm:inline">Récurrentes</span>
          </Link>
          <Link
            href="/sessions/new"
            className="flex items-center gap-1.5 rounded-2xl bg-primary px-3 sm:px-4 py-2.5 text-sm font-bold text-black transition-all duration-300 hover:scale-[1.03] hover:-translate-y-px"
            style={{ boxShadow: '0 0 20px rgba(0,255,133,0.28)' }}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span className="hidden xs:inline">Planifier</span>
          </Link>
        </div>
      </div>

      {/* Recherche */}
      <form method="GET" action="/sessions">
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        {statut   && <input type="hidden" name="statut"   value={statut} />}
        {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par titre, client…"
            className="h-11 w-full rounded-2xl border border-border bg-card/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            style={{ backdropFilter: 'blur(8px)' }}
          />
        </div>
      </form>

      {/* Filtre client */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Link
          href={filterHref({ clientId: '' })}
          className="shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105"
          style={!clientId
            ? { background: 'rgba(0,207,255,0.18)', borderColor: 'rgba(0,207,255,0.55)', color: '#00CFFF' }
            : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#9090B8' }
          }
        >
          <UserRound size={11} /> Tous
        </Link>
        {clients.map((c) => (
          <Link
            key={c.id}
            href={filterHref({ clientId: c.id })}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105 whitespace-nowrap"
            style={clientId === c.id
              ? { background: 'rgba(0,207,255,0.18)', borderColor: 'rgba(0,207,255,0.55)', color: '#00CFFF' }
              : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#9090B8' }
            }
          >
            {c.prenom} {c.nom}
          </Link>
        ))}
      </div>

      {/* Filtre statut */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FILTER_OPTIONS.map((f) => (
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

      {/* Badge client actif */}
      {selectedClient && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtré par :</span>
          <Link
            href={filterHref({ clientId: '' })}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all hover:scale-105"
            style={{ background: 'rgba(0,207,255,0.12)', border: '1px solid rgba(0,207,255,0.35)', color: '#00CFFF' }}
          >
            {selectedClient.prenom} {selectedClient.nom}
            <span style={{ opacity: 0.7 }}>×</span>
          </Link>
        </div>
      )}

      {/* Table / état vide */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-3xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <CalendarDays size={28} style={{ color: '#3A3A6A' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">
              {q ? `Aucune séance pour "${q}"` : 'Aucune séance'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Organisez votre planning de coaching</p>
          </div>
          {!q && !clientId && (
            <Link
              href="/sessions/new"
              className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105"
              style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.28)', color: '#00FF85' }}
            >
              <Plus size={13} /> Planifier une séance
            </Link>
          )}
        </div>
      ) : (
        <>
          <SessionsTable
            sessions={paginated}
            sort={sort}
            sortDateHref={sortDateHref}
            todayStr={todayStr}
          />
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            hrefForPage={(p) => buildHref({ q, statut, clientId, sort }, { page: String(p) })}
          />
        </>
      )}
    </div>
  )
}
