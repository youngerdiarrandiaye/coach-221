'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  value: string // 'YYYY-MM'
}

function fmt(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function MonthPicker({ value }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const isNow    = value === currentYM()

  const go = (ym: string) => router.push(`${pathname}?mois=${ym}`)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => go(addMonths(value, -1))}
        className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-white/10"
        style={{ color: '#9090B8', border: '1px solid rgba(255,255,255,0.08)' }}
        aria-label="Mois précédent"
      >
        <ChevronLeft size={14} />
      </button>

      <span className="text-sm font-bold text-white min-w-[120px] text-center capitalize">
        {fmt(value)}
      </span>

      <button
        onClick={() => go(addMonths(value, 1))}
        disabled={isNow}
        className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ color: '#9090B8', border: '1px solid rgba(255,255,255,0.08)' }}
        aria-label="Mois suivant"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
