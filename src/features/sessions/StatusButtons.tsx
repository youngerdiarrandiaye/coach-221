'use client'

import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { notify } from '@/lib/toast'
import { updateSessionStatusAction } from './actions'
import type { SessionStatus } from '@/entities'

interface StatusButtonsProps {
  sessionId:     string
  currentStatus: SessionStatus
}

const OPTIONS: { value: SessionStatus; label: string; activeStyle: React.CSSProperties; borderColor: string }[] = [
  {
    value: 'PLANIFIEE',
    label: 'À venir',
    borderColor: 'rgba(0,207,255,0.35)',
    activeStyle: { background: 'rgba(0,207,255,0.15)', borderColor: 'rgba(0,207,255,0.60)', color: '#00CFFF' },
  },
  {
    value: 'EFFECTUEE',
    label: 'Effectuée',
    borderColor: 'rgba(0,255,133,0.35)',
    activeStyle: { background: 'rgba(0,255,133,0.15)', borderColor: 'rgba(0,255,133,0.60)', color: '#00FF85' },
  },
  {
    value: 'ANNULEE',
    label: 'Annulée',
    borderColor: 'rgba(255,59,92,0.35)',
    activeStyle: { background: 'rgba(255,59,92,0.15)', borderColor: 'rgba(255,59,92,0.60)', color: '#FF3B5C' },
  },
]

const LABELS: Record<SessionStatus, string> = {
  PLANIFIEE: 'planifiée',
  EFFECTUEE: 'effectuée',
  ANNULEE:   'annulée',
}

export function StatusButtons({ sessionId, currentStatus }: StatusButtonsProps) {
  const [status, setStatus]   = useState<SessionStatus>(currentStatus)
  const [loading, setLoading] = useState<SessionStatus | null>(null)

  const handleChange = async (next: SessionStatus) => {
    if (next === status || loading) return
    setLoading(next)
    const toastId = notify.loading('Mise à jour du statut…')
    const result = await updateSessionStatusAction(sessionId, next)
    notify.dismiss(toastId)
    if (!result.error) {
      setStatus(next)
      notify.success('Statut mis à jour', `Séance marquée comme ${LABELS[next]}.`)
    } else {
      notify.error('Erreur', 'Impossible de mettre à jour le statut.')
    }
    setLoading(null)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => {
        const isActive = status === o.value
        return (
          <button
            key={o.value}
            onClick={() => handleChange(o.value)}
            disabled={loading !== null}
            className="flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)',
              transitionDuration: '250ms',
              ...(isActive
                ? o.activeStyle
                : { borderColor: o.borderColor, color: '#8888B0' }),
              ...(isActive ? { transform: 'scale(1.03)' } : {}),
            }}
          >
            {loading === o.value
              ? <Spinner size="sm" className="border-current/20 border-t-current" />
              : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
