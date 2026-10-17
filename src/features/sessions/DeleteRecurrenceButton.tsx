'use client'

import { useTransition, useState } from 'react'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { deleteRecurrenceAction } from './recurrenceActions'

interface Props {
  recurrenceId:   string
  titre:          string
  upcomingCount:  number
}

export function DeleteRecurrenceButton({ recurrenceId, titre, upcomingCount }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteRecurrenceAction(recurrenceId)
      if (result?.error) setError(result.error)
    })
  }

  if (confirm) {
    return (
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.25)' }}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} style={{ color: '#FF3B5C', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-sm font-bold text-white">Supprimer la série ?</p>
            <p className="text-xs mt-0.5" style={{ color: '#9090B8' }}>
              {upcomingCount > 0
                ? `${upcomingCount} séance${upcomingCount !== 1 ? 's' : ''} planifiée${upcomingCount !== 1 ? 's' : ''} seront supprimées.`
                : 'Plus aucune séance future dans cette série.'}
              {' '}Les séances passées restent enregistrées.
            </p>
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="flex-1 rounded-xl py-2 text-xs font-bold transition-all hover:scale-105"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#9090B8' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
            style={{ background: 'rgba(255,59,92,0.18)', border: '1px solid rgba(255,59,92,0.40)', color: '#FF3B5C' }}
          >
            {isPending
              ? <Loader2 size={13} className="animate-spin" />
              : <><Trash2 size={13} /> Supprimer</>
            }
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-all hover:scale-105"
      style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.22)', color: '#FF3B5C' }}
      title={`Supprimer la série "${titre}"`}
    >
      <Trash2 size={13} /> Supprimer la série
    </button>
  )
}
