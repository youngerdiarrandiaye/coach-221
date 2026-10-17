'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import type { ClientRow, SessionRow, PaymentRow } from '@/entities'

interface Props {
  client:    ClientRow
  sessions:  SessionRow[]
  payments:  PaymentRow[]
  coachName: string
}

export function ExportClientPDFButton({ client, sessions, payments, coachName }: Props) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const { buildClientPdf } = await import('@/lib/pdf/buildClientPdf')
      await buildClientPdf(client, sessions, payments, coachName)
    } catch (e) {
      console.error('PDF error:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
      <span className="hidden sm:inline">PDF</span>
    </button>
  )
}
