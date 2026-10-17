'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import type { PaymentRow, ClientRow, ProfileRow } from '@/entities'

interface Props {
  payment: PaymentRow
  client:  ClientRow
  coach:   ProfileRow
}

export function ExportReceiptButton({ payment, client, coach }: Props) {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const { buildPaymentPdf } = await import('@/lib/pdf/buildPaymentPdf')
      await buildPaymentPdf(payment, client, coach)
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
      Télécharger reçu
    </button>
  )
}
