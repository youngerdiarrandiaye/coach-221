'use client'

import { useTransition, useState } from 'react'
import { Send, ExternalLink, XCircle, Loader2, FileCheck } from 'lucide-react'
import { sendRapportAction } from './sendRapportAction'

interface Props {
  clientId:  string
  yearMonth: string
}

type Status = 'idle' | 'generating' | 'ready' | 'error'

export function SendRapportButton({ clientId, yearMonth }: Props) {
  const [isPending, startTransition] = useTransition()
  const [status,   setStatus]   = useState<Status>('idle')
  const [waLink,   setWaLink]   = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleGenerate = () => {
    setStatus('generating')
    startTransition(async () => {
      const result = await sendRapportAction(clientId, yearMonth)
      if (result.ok) {
        setWaLink(result.waLink)
        setStatus('ready')
      } else {
        setErrorMsg(result.error)
        setStatus('error')
      }
    })
  }

  // ── Erreur ──────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div
          className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold"
          style={{ background: 'rgba(255,59,92,0.12)', border: '1px solid rgba(255,59,92,0.30)', color: '#FF3B5C' }}
        >
          <XCircle size={13} />
          Échec
        </div>
        <p className="text-[11px] text-right max-w-[180px] leading-snug" style={{ color: '#FF5577' }}>
          {errorMsg}
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="text-[11px] underline"
          style={{ color: '#9090B8' }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  // ── PDF prêt — ouvrir WhatsApp ───────────────────────────────────────────────
  if (status === 'ready') {
    return (
      <div className="flex flex-col items-end gap-2">
        {/* Confirmation PDF généré */}
        <div
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold"
          style={{ background: 'rgba(0,255,133,0.10)', border: '1px solid rgba(0,255,133,0.25)', color: '#00FF85' }}
        >
          <FileCheck size={12} />
          PDF généré
        </div>

        {/* Bouton WhatsApp — ouvre wa.me */}
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'rgba(37,211,102,0.16)',
            border:     '1px solid rgba(37,211,102,0.40)',
            color:      '#25D366',
            boxShadow:  '0 0 16px rgba(37,211,102,0.18)',
          }}
        >
          <ExternalLink size={14} />
          Envoyer sur WhatsApp
        </a>

        {/* Recommencer */}
        <button
          onClick={() => { setStatus('idle'); setWaLink('') }}
          className="text-[11px] underline"
          style={{ color: '#555577' }}
        >
          Regénérer
        </button>
      </div>
    )
  }

  // ── Bouton initial / chargement ──────────────────────────────────────────────
  return (
    <button
      onClick={handleGenerate}
      disabled={isPending || status === 'generating'}
      className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
      style={{
        background: 'rgba(37,211,102,0.12)',
        border:     '1px solid rgba(37,211,102,0.32)',
        color:      '#25D366',
      }}
    >
      {status === 'generating' ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Génération…
        </>
      ) : (
        <>
          <Send size={14} />
          Envoyer par WhatsApp
        </>
      )}
    </button>
  )
}
