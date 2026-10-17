import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, ArrowLeft, ShieldCheck } from 'lucide-react'
import { CheckEmailResend } from '@/features/auth/CheckEmailResend'

export const metadata: Metadata = { title: 'Confirmez votre email' }

interface Props {
  searchParams: { email?: string }
}

export default function CheckEmailPage({ searchParams }: Props) {
  const email = searchParams.email ?? ''

  return (
    <>
      {/* Icône enveloppe animée */}
      <div className="mb-7 flex flex-col items-center gap-4">
        <div className="relative">
          {/* Anneaux de pulse */}
          <span
            className="absolute inset-0 rounded-full"
            style={{ animation: 'pulse-ring-green 2.5s ease-in-out infinite' }}
          />
          <span
            className="absolute inset-0 rounded-full"
            style={{ animation: 'pulse-ring-green 2.5s ease-in-out 0.8s infinite', opacity: 0.6 }}
          />
          {/* Icône */}
          <div
            className="relative flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(0,255,133,0.18) 0%, rgba(0,207,255,0.12) 100%)',
              border:     '1.5px solid rgba(0,255,133,0.38)',
              boxShadow:  '0 0 32px rgba(0,255,133,0.22)',
            }}
          >
            <Mail size={28} style={{ color: '#00FF85' }} strokeWidth={1.8} />
          </div>
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-xl font-black text-white">Vérifiez votre boîte mail</h2>
          <p className="text-sm" style={{ color: '#9090B8' }}>
            Un lien d&apos;activation a été envoyé à
          </p>
          {email && (
            <p
              className="text-sm font-black truncate max-w-[260px]"
              style={{ color: '#00FF85' }}
              title={email}
            >
              {email}
            </p>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div
        className="rounded-2xl p-4 mb-5 space-y-2.5"
        style={{
          background: 'rgba(0,255,133,0.06)',
          border:     '1px solid rgba(0,255,133,0.18)',
        }}
      >
        {[
          'Ouvrez l\'email de TerangaCoach',
          'Cliquez sur le bouton "Activer mon compte"',
          'Vous serez automatiquement connecté',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
              style={{ background: 'rgba(0,255,133,0.18)', color: '#00FF85', marginTop: '1px' }}
            >
              {i + 1}
            </span>
            <p className="text-sm text-white/70 leading-snug">{step}</p>
          </div>
        ))}
      </div>

      {/* Badge spam */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-6"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <ShieldCheck size={14} style={{ color: '#9090B8' }} />
        <p className="text-xs" style={{ color: '#9090B8' }}>
          Pensez à vérifier vos spams si vous ne recevez rien sous 2 minutes.
        </p>
      </div>

      {/* Renvoyer */}
      <div className="text-center mb-5">
        <p className="text-xs mb-2" style={{ color: '#9090B8' }}>
          Vous n&apos;avez pas reçu l&apos;email ?
        </p>
        <CheckEmailResend email={email} />
      </div>

      {/* Retour connexion */}
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 text-sm font-semibold transition-all hover:-translate-y-px"
        style={{ color: '#9090B8' }}
        onMouseEnter={undefined}
      >
        <ArrowLeft size={14} />
        Retour à la connexion
      </Link>
    </>
  )
}
