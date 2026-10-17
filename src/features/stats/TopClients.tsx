'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import type { TopClient } from './statsService'

interface Props {
  clients: TopClient[]
}

export function TopClients({ clients }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (clients.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Aucune donnée de paiement</p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {clients.map((c, i) => (
        <li key={c.id}>
          <Link
            href={`/clients/${c.id}`}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{
              background: `${c.color}08`,
              border: `1px solid ${c.color}18`,
              transition: 'transform 0.2s cubic-bezier(0.25,0.46,0.45,0.94)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = ''
            }}
          >
            {/* Rank */}
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-black"
              style={
                i === 0
                  ? {
                      background: 'rgba(255,214,0,0.18)',
                      color: '#FFD600',
                      boxShadow: '0 0 12px rgba(255,214,0,0.35)',
                      animation: 'dot-pulse 2s ease-in-out infinite',
                    }
                  : { background: 'rgba(255,255,255,0.06)', color: '#6A6A9A' }
              }
            >
              {i === 0 ? <Crown size={11} /> : i + 1}
            </span>

            {/* Avatar */}
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-black"
              style={{
                background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}99 100%)`,
              }}
            >
              {c.initials}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-white truncate">{c.name}</p>
                <span className="text-xs font-black shrink-0 ml-2" style={{ color: c.color }}>
                  {c.revenue.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              {/* Progress bar animée au montage */}
              <div
                className="h-1 w-full rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.07)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: mounted ? `${c.pct}%` : '0%',
                    background: `linear-gradient(90deg, ${c.color} 0%, ${c.color}88 100%)`,
                    boxShadow: `0 0 8px ${c.color}44`,
                    transition: `width 0.9s cubic-bezier(0.25,0.46,0.45,0.94) ${i * 80}ms`,
                  }}
                />
              </div>
              <p className="text-[10px] mt-1" style={{ color: '#6A6A9A' }}>
                {c.sessions} séance{c.sessions > 1 ? 's' : ''}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
