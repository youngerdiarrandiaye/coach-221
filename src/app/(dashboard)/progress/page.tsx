import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Activity } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { progressDao } from '@/dao/progressDao'
import { Pagination } from '@/components/ui/Pagination'
import { ProgressTable, type TrackedClientData } from '@/features/progress/ProgressTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Progression' }

const PAGE_SIZE = 10

interface Props {
  searchParams: { page?: string }
}

function buildHref(base: { page?: string }, override: Record<string, string>) {
  const params = new URLSearchParams()
  const merged = { ...base, ...override }
  if (merged.page && merged.page !== '1') params.set('page', merged.page)
  const qs = params.toString()
  return `/progress${qs ? `?${qs}` : ''}`
}

export default async function ProgressPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const [clients, allEntries] = await Promise.all([
    clientDao.findAll(user.id),
    progressDao.findAll(user.id),
  ])

  const latestByClient = new Map<string, (typeof allEntries)[0]>()
  const prevByClient   = new Map<string, (typeof allEntries)[0]>()
  for (const e of allEntries) {
    if (!latestByClient.has(e.client_id)) {
      latestByClient.set(e.client_id, e)
    } else if (!prevByClient.has(e.client_id)) {
      prevByClient.set(e.client_id, e)
    }
  }

  const tracked: TrackedClientData[] = clients
    .filter((c) => latestByClient.has(c.id))
    .map((c) => ({
      client: c,
      latest: latestByClient.get(c.id)!,
      prev:   prevByClient.get(c.id),
    }))

  const untracked = clients.filter((c) => !latestByClient.has(c.id))

  // Pagination on all clients (tracked first, then untracked)
  const allItems = [...tracked.map((t) => ({ type: 'tracked' as const, data: t })),
                    ...untracked.map((c) => ({ type: 'untracked' as const, data: c }))]
  const totalPages  = Math.ceil(allItems.length / PAGE_SIZE)
  const safePage    = Math.min(page, Math.max(1, totalPages))
  const paginatedAll = allItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const paginatedTracked   = paginatedAll.filter((i) => i.type === 'tracked').map((i) => i.data as TrackedClientData)
  const paginatedUntracked = paginatedAll.filter((i) => i.type === 'untracked').map((i) => i.data as (typeof untracked)[0])

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-white">Progression</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tracked.length} client{tracked.length !== 1 ? 's' : ''} suivi{tracked.length !== 1 ? 's' : ''}
          {untracked.length > 0 && ` · ${untracked.length} sans mesures`}
        </p>
      </div>

      {/* Empty state */}
      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Activity size={28} style={{ color: '#3A3A6A' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">Aucun client</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ajoutez des clients pour suivre leur progression</p>
          </div>
          <Link
            href="/clients/new"
            className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105"
            style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.28)', color: '#00FF85' }}
          >
            <Plus size={13} /> Ajouter un client
          </Link>
        </div>
      ) : (
        <>
          <ProgressTable tracked={paginatedTracked} untracked={paginatedUntracked} />
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={allItems.length}
            hrefForPage={(p) => buildHref({}, { page: String(p) })}
          />
        </>
      )}
    </div>
  )
}
