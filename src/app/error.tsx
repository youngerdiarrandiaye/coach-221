'use client'

import { useEffect } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function RootError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[Root Error]', error)
  }, [error])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: '20px',
      padding: '24px', textAlign: 'center', background: '#05050F',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'rgba(255,59,92,0.12)', border: '1px solid rgba(255,59,92,0.30)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertTriangle size={24} color="#FF3B5C" />
      </div>
      <div>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', margin: '0 0 8px', fontFamily: 'sans-serif' }}>
          Une erreur est survenue
        </p>
        <p style={{ color: '#9090B8', fontSize: '0.875rem', margin: 0, fontFamily: 'sans-serif' }}>
          {error.message || 'Rechargez la page pour réessayer.'}
        </p>
      </div>
      <button
        onClick={reset}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.28)',
          color: '#00FF85', borderRadius: 12, padding: '10px 20px',
          fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'sans-serif',
        }}
      >
        <RefreshCw size={15} /> Réessayer
      </button>
    </div>
  )
}
