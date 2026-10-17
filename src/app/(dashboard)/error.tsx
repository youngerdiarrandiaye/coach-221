'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  error:  Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[Dashboard Error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle size={26} className="text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-foreground">Une erreur est survenue</h2>
        <p className="text-sm text-muted max-w-xs">
          {error.message || 'Quelque chose s\'est mal passé. Réessayez.'}
        </p>
      </div>
      <Button
        onClick={reset}
        variant="outline"
        className="gap-2 border-border"
      >
        <RefreshCw size={15} />
        Réessayer
      </Button>
    </div>
  )
}

