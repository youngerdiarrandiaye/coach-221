'use client'

import { useState, useEffect } from 'react'
import type { PaymentMethodStat } from './statsService'

interface Props {
  methods: PaymentMethodStat[]
}

export function PaymentMethodBars({ methods }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (methods.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Aucun paiement enregistré</p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {methods.map((m, i) => (
        <li key={m.method} className="flex items-center gap-3">
          {/* Dot */}
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: m.color, boxShadow: `0 0 8px ${m.color}66` }}
          />

          {/* Label + bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-white">{m.label}</span>
              <span className="text-xs font-black shrink-0 ml-2" style={{ color: m.color }}>
                {m.pct}%
              </span>
            </div>
            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: mounted ? `${m.pct}%` : '0%',
                  background: `linear-gradient(90deg, ${m.color} 0%, ${m.color}88 100%)`,
                  transition: `width 0.8s cubic-bezier(0.25,0.46,0.45,0.94) ${i * 100}ms`,
                  boxShadow: `0 0 8px ${m.color}44`,
                }}
              />
            </div>
          </div>

          {/* Amount */}
          <span
            className="shrink-0 text-[11px] font-bold tabular-nums w-20 text-right"
            style={{ color: '#9090B8' }}
          >
            {m.total.toLocaleString('fr-FR')}
          </span>
        </li>
      ))}
    </ul>
  )
}
