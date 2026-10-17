import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Plus, RotateCcw } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { sessionRecurrenceDao } from '@/dao/sessionRecurrenceDao'
import { Pagination } from '@/components/ui/Pagination'
import { RecurrencesTable } from '@/features/sessions/RecurrencesTable'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Séances récurrentes' }

const PAGE_SIZE = 10

interface Props {
  searchParams: { page?: string }
}

function buildHref(base: { page?: string }, override: Record<string, string>) {
  const params = new URLSearchParams()
  const merged = { ...base, ...override }
  if (merged.page && merged.page !== '1') params.set('page', merged.page)
  const qs = params.toString()
  return `/sessions/recurrences${qs ? `?${qs}` : ''}`
}

export default async function RecurrencesPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10))

  const recurrences = await sessionRecurrenceDao.findAll(user.id)

  const totalPages = Math.ceil(recurrences.length / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(1, totalPages))
  const paginated  = recurrences.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const upcomingCounts = await Promise.all(
    paginated.map((r) => sessionRecurrenceDao.countUpcomingSessions(r.id)),
  )

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Séances récurrentes</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {recurrences.length} série{recurrences.length !== 1 ? 's' : ''} configurée{recurrences.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="flex items-center gap-1.5 rounded-2xl px-3 sm:px-4 py-2.5 text-sm font-bold transition-all duration-300 hover:scale-[1.03] hover:-translate-y-px"
          style={{ background: 'rgba(123,111,255,0.18)', border: '1.5px solid rgba(123,111,255,0.40)', color: '#7B6FFF' }}
        >
          <Plus size={15} strokeWidth={2.5} />
          <span className="hidden xs:inline">Nouvelle</span>
        </Link>
      </div>

      {/* Liste */}
      {recurrences.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-3xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <RotateCcw size={28} style={{ color: '#3A3A6A' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">Aucune séance récurrente</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Planifiez des séances qui se répètent chaque semaine
            </p>
          </div>
          <Link
            href="/sessions/new"
            className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105"
            style={{ background: 'rgba(123,111,255,0.12)', border: '1px solid rgba(123,111,255,0.28)', color: '#7B6FFF' }}
          >
            <Plus size={13} /> Créer une récurrence
          </Link>
        </div>
      ) : (
        <>
          <RecurrencesTable recurrences={paginated} upcomingCounts={upcomingCounts} />
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={recurrences.length}
            hrefForPage={(p) => buildHref({}, { page: String(p) })}
          />
        </>
      )}
    </div>
  )
}
