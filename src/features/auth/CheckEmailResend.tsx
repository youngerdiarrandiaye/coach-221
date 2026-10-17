'use client'

import { useTransition, useState } from 'react'
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { resendConfirmationAction } from './actions'

export function CheckEmailResend({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleResend = () => {
    startTransition(async () => {
      setError(null)
      const result = await resendConfirmationAction({ email })
      if (result?.error) setError(result.error)
      else setSent(true)
    })
  }

  if (sent) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: '#00FF85' }}>
        <CheckCircle2 size={15} />
        Email renvoyé avec succès !
      </div>
    )
  }

  return (
    <div className="space-y-2 text-center">
      <button
        onClick={handleResend}
        disabled={isPending}
        className="inline-flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
        style={{ color: '#9090B8' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#9090B8' }}
      >
        <RefreshCw size={13} className={isPending ? 'animate-spin' : ''} />
        {isPending ? 'Envoi en cours…' : "Renvoyer l'email"}
      </button>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}
