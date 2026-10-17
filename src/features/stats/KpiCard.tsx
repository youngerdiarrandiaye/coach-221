'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'

const COLOR_RGBA: Record<string, string> = {
  '#00FF85': '0,255,133',
  '#00CFFF': '0,207,255',
  '#FFD600': '255,214,0',
  '#7B6FFF': '123,111,255',
  '#FF6B35': '255,107,53',
  '#FF3B5C': '255,59,92',
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  numValue: number
  counterType?: 'number' | 'currency'
  suffix?: string
  sub?: string
  color?: string
  trend?: number
}

export function KpiCard({ icon, label, numValue, counterType = 'number', suffix = '', sub, color = '#00FF85', trend }: KpiCardProps) {
  const rgb = COLOR_RGBA[color] ?? '0,255,133'
  return (
    <div
      data-animate="card"
      className="relative overflow-hidden rounded-2xl flex flex-col gap-3 p-4"
      style={{
        minHeight: '128px',
        background: `linear-gradient(155deg,rgba(${rgb},0.14) 0%,rgba(3,3,9,0.80) 100%)`,
        border: `1px solid rgba(${rgb},0.30)`,
        boxShadow: `0 4px 28px rgba(${rgb},0.12)`,
        transition: 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.3s cubic-bezier(0.25,0.46,0.45,0.94)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.transform = 'translateY(-3px)'
        el.style.boxShadow = `0 12px 48px rgba(${rgb},0.28), 0 0 0 1px rgba(${rgb},0.18)`
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.transform = ''
        el.style.boxShadow = `0 4px 28px rgba(${rgb},0.12)`
      }}
    >
      {/* Icon + trend */}
      <div className="flex items-start justify-between">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `rgba(${rgb},0.20)`, border: `1px solid rgba(${rgb},0.35)` }}
        >
          {icon}
        </div>
        {trend !== undefined && (
          <div
            className="flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold"
            style={
              trend >= 0
                ? { background: 'rgba(0,255,133,0.15)', color: '#00FF85' }
                : { background: 'rgba(255,59,92,0.15)', color: '#FF3B5C' }
            }
          >
            {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trend >= 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>

      {/* Animated value */}
      <div className="min-w-0">
        <p
          className="text-2xl font-black text-white leading-none tracking-tight tabular-nums"
          style={{ textShadow: `0 0 16px rgba(${rgb},0.80), 0 0 36px rgba(${rgb},0.40), 0 0 64px rgba(${rgb},0.18)` }}
        >
          <AnimatedCounter value={numValue} type={counterType} suffix={suffix} duration={1400} />
        </p>
        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-white/70 truncate">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] text-white/50 truncate">{sub}</p>}
      </div>
    </div>
  )
}
