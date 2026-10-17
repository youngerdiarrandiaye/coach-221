'use client'

import { useState } from 'react'
import { Download, Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
  action: () => Promise<string>
  filename: string
  label?: string
  color?: string
  mimeType?: string
  size?: 'sm' | 'md'
}

export function ExportButton({
  action,
  filename,
  label = 'Exporter',
  color = '#00FF85',
  mimeType = 'text/csv;charset=utf-8;',
  size = 'sm',
}: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleClick() {
    if (state === 'loading') return
    setState('loading')
    try {
      const content = await action()
      const blob = new Blob([content], { type: mimeType })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setState('done')
      setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('idle')
    }
  }

  const isSm = size === 'sm'

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className={`flex items-center gap-1.5 rounded-2xl font-semibold transition-all duration-200 ${
        isSm ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
      }`}
      style={{
        background: state === 'done'
          ? 'rgba(0,255,133,0.14)'
          : `${color}10`,
        border:  `1px solid ${state === 'done' ? 'rgba(0,255,133,0.35)' : `${color}28`}`,
        color:   state === 'done' ? '#00FF85' : color,
        opacity: state === 'loading' ? 0.7 : 1,
      }}
    >
      {state === 'loading' && <Loader2 size={isSm ? 12 : 14} className="shrink-0 animate-spin" />}
      {state === 'done'    && <CheckCircle2 size={isSm ? 12 : 14} className="shrink-0" />}
      {state === 'idle'    && <Download size={isSm ? 12 : 14} className="shrink-0" />}
      {state === 'done' ? 'Téléchargé !' : label}
    </button>
  )
}
