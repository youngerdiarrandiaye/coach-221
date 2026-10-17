import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  currentPage: number
  totalPages:  number
  totalItems:  number
  hrefForPage: (page: number) => string
}

function pages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const list: (number | '...')[] = [1]
  if (current > 3) list.push('...')
  const lo = Math.max(2, current - 1)
  const hi = Math.min(total - 1, current + 1)
  for (let i = lo; i <= hi; i++) list.push(i)
  if (current < total - 2) list.push('...')
  list.push(total)
  return list
}

export function Pagination({ currentPage, totalPages, totalItems, hrefForPage }: Props) {
  if (totalPages <= 1) return null

  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages
  const btnBase = 'flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition-all hover:scale-105'

  return (
    <div className="flex flex-col items-center gap-2 pt-3">
      <p className="text-xs" style={{ color: '#9090B8' }}>
        Page <span className="font-bold text-white">{currentPage}</span> / {totalPages}
        <span className="ml-2 opacity-60">({totalItems} au total)</span>
      </p>
      <div className="flex items-center gap-1.5">
        {/* Prev */}
        {hasPrev ? (
          <Link href={hrefForPage(currentPage - 1)} className={btnBase}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#9090B8' }}>
            <ChevronLeft size={16} />
          </Link>
        ) : (
          <span className={btnBase} style={{ opacity: 0.25, color: '#9090B8', cursor: 'default' }}>
            <ChevronLeft size={16} />
          </span>
        )}

        {/* Numéros */}
        {pages(currentPage, totalPages).map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="flex h-9 w-6 items-center justify-center text-xs" style={{ color: '#9090B8' }}>…</span>
          ) : (
            <Link key={p} href={hrefForPage(p)} className={btnBase}
              style={p === currentPage
                ? { background: 'rgba(0,255,133,0.18)', border: '1.5px solid rgba(0,255,133,0.45)', color: '#00FF85' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#9090B8' }
              }>
              {p}
            </Link>
          )
        )}

        {/* Next */}
        {hasNext ? (
          <Link href={hrefForPage(currentPage + 1)} className={btnBase}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#9090B8' }}>
            <ChevronRight size={16} />
          </Link>
        ) : (
          <span className={btnBase} style={{ opacity: 0.25, color: '#9090B8', cursor: 'default' }}>
            <ChevronRight size={16} />
          </span>
        )}
      </div>
    </div>
  )
}
