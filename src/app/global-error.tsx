'use client'

import { AlertTriangle } from 'lucide-react'

interface Props {
  error:  Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ reset }: Props) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-background font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle size={26} className="text-red-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">Erreur critique</h2>
            <p className="text-sm text-gray-400">L&apos;application a rencontré une erreur inattendue.</p>
          </div>
          <button
            onClick={reset}
            className="rounded-lg bg-[#00853F] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
