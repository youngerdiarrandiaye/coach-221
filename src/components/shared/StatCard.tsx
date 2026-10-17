import type { LucideIcon } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: string
  iconColor?: string
}

export function StatCard({ icon: Icon, label, value, sub, iconColor = '#00FF85' }: StatCardProps) {
  const isNumeric = typeof value === 'number'

  return (
    <div
      data-animate="card"
      className="tc-card flex flex-col gap-3 p-4"
      style={{
        background: `linear-gradient(155deg, rgba(20,20,48,0.97) 0%, rgba(12,12,24,0.99) 100%)`,
      }}
    >
      {/* Icône */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl self-start"
        style={{
          background: `${iconColor}13`,
          border:     `1px solid ${iconColor}26`,
          boxShadow:  `0 0 18px ${iconColor}1A`,
        }}
      >
        <Icon size={18} style={{ color: iconColor }} strokeWidth={2} />
      </div>

      {/* Valeur + label */}
      <div className="min-w-0">
        <p
          data-animate="text"
          className="text-2xl font-black text-white leading-none tracking-tight tabular-nums"
          style={{
            textShadow: `0 0 14px ${iconColor}CC, 0 0 32px ${iconColor}55, 0 0 60px ${iconColor}22`,
          }}
        >
          {isNumeric
            ? <AnimatedCounter value={value as number} />
            : value
          }
        </p>
        <p
          data-animate="text"
          className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate"
        >
          {label}
        </p>
        {sub && (
          <p data-animate="text" className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        )}
      </div>
    </div>
  )
}
