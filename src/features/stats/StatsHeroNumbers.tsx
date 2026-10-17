'use client'
import { AnimatedCounter } from '@/components/ui/AnimatedCounter'

interface Props {
  totalRevenue:   number
  totalSessions:  number
  totalClients:   number
}

export function StatsHeroNumbers({ totalRevenue, totalSessions, totalClients }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-8">
      <div className="min-w-0">
        <p
          className="text-lg sm:text-xl lg:text-2xl font-black text-white tabular-nums truncate"
          style={{ textShadow: '0 0 16px rgba(0,255,133,0.95), 0 0 36px rgba(0,255,133,0.55), 0 0 72px rgba(0,255,133,0.25)' }}
        >
          <AnimatedCounter value={totalRevenue} type="currency" duration={1800} />
        </p>
        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50 mt-0.5 truncate">Revenu total</p>
      </div>
      <div className="min-w-0">
        <p className="text-lg sm:text-xl lg:text-2xl font-black text-white tabular-nums truncate">
          <AnimatedCounter value={totalSessions} duration={1200} />
        </p>
        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50 mt-0.5 truncate">Séances</p>
      </div>
      <div className="min-w-0">
        <p className="text-lg sm:text-xl lg:text-2xl font-black text-white tabular-nums truncate">
          <AnimatedCounter value={totalClients} duration={1000} />
        </p>
        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/50 mt-0.5 truncate">Clients</p>
      </div>
    </div>
  )
}
