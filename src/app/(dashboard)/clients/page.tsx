import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Search, Users } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { ExportButton } from '@/features/export/ExportButton'
import { exportClientsCSV } from '@/features/export/exportActions'
import { Pagination } from '@/components/ui/Pagination'
import { ClientsTable } from '@/features/clients/ClientsTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Clients' }

const PAGE_SIZE = 10

interface Props { searchParams: { q?: string; page?: string } }

function buildHref(base: { q?: string; page?: string }, override: Record<string, string>) {
  const params = new URLSearchParams()
  const merged = { ...base, ...override }
  if (merged.q) params.set('q', merged.q)
  if (merged.page && merged.page !== '1') params.set('page', merged.page)
  const qs = params.toString()
  return `/clients${qs ? `?${qs}` : ''}`
}

export default async function ClientsPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const q    = searchParams.q?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const clients    = await clientDao.findAll(user.id, q)
  const totalPages = Math.ceil(clients.length / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const paginated  = clients.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Clients</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{clients.length} athlète{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton action={exportClientsCSV} filename="teranga-clients.csv" label="CSV" color="#00FF85" />
          <Link
            href="/clients/new"
            className="flex items-center gap-1.5 rounded-2xl bg-primary px-3 sm:px-4 py-2.5 text-sm font-bold text-black transition-all duration-300 hover:scale-[1.03] hover:-translate-y-px"
            style={{ boxShadow: '0 0 20px rgba(0,255,133,0.28)' }}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span className="hidden xs:inline">Nouveau</span>
          </Link>
        </div>
      </div>

      {/* Recherche */}
      <form method="GET" action="/clients">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher par nom, prénom…"
            className="h-11 w-full rounded-2xl border border-border bg-card/80 pl-10 pr-4 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            style={{ backdropFilter: 'blur(8px)' }}
          />
        </div>
      </form>

      {/* Liste */}
      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Users size={28} style={{ color: '#3A3A6A' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">{q ? `Aucun résultat pour "${q}"` : 'Aucun client'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Commencez par ajouter votre premier athlète</p>
          </div>
          {!q && (
            <Link href="/clients/new"
              className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105"
              style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.28)', color: '#00FF85' }}
            >
              <Plus size={13} /> Ajouter un client
            </Link>
          )}
        </div>
      ) : (
        <>
          <ClientsTable clients={paginated} />
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={clients.length}
            hrefForPage={(p) => buildHref({ q }, { page: String(p) })}
          />
        </>
      )}
    </div>
  )
}
