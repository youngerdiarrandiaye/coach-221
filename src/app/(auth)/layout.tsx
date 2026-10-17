import type { Metadata } from 'next'
import { Dumbbell, Star, Shield, Zap } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Authentification',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">

      {/* ── Panneau gauche : image ─────────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-[58%] xl:w-[62%] flex-col overflow-hidden">

        {/* Image de fond */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/login-bg.png')" }}
        />

        {/* Overlay chaud pour compléter le coucher de soleil */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(3,3,9,0.80) 0%, rgba(10,5,3,0.50) 45%, rgba(3,3,9,0.82) 100%)',
          }}
        />

        {/* Contenu sur l'image */}
        <div className="relative z-10 flex flex-col justify-between h-full p-10">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background: 'linear-gradient(135deg, #00FF85 0%, #00D166 100%)',
                boxShadow: '0 0 28px rgba(0,255,133,0.45)',
              }}
            >
              <Dumbbell size={22} className="text-black" strokeWidth={2.5} />
            </div>
            <div>
              <span className="block text-xl font-black tracking-tight text-white">
                TerangaCoach
              </span>
              <span className="block text-[11px] font-medium" style={{ color: '#00FF85' }}>
                Coaching &amp; Suivi
              </span>
            </div>
          </div>

          {/* Accroche centrale */}
          <div className="max-w-lg">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-5"
              style={{
                background: 'rgba(0,255,133,0.12)',
                border: '1px solid rgba(0,255,133,0.28)',
              }}
            >
              <Star size={11} style={{ color: '#00FF85' }} />
              <span className="text-[11px] font-bold" style={{ color: '#00FF85' }}>
                #1 Plateforme coaching en Afrique de l&apos;Ouest
              </span>
            </div>

            <h2
              className="text-4xl xl:text-5xl font-black leading-[1.1] text-white mb-4"
              style={{ textShadow: '0 2px 32px rgba(0,0,0,0.60)' }}
            >
              Gérez votre coaching.<br />
              <span style={{ color: '#00FF85' }}>Développez votre business.</span>
            </h2>
            <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>
              Clients, séances, paiements — tout centralisé pour les coachs
              d&apos;Afrique de l&apos;Ouest. Simple, rapide, professionnel.
            </p>

            {/* Stats visuelles */}
            <div className="flex gap-8 mt-8">
              {[
                { value: '100+', label: 'Coachs actifs' },
                { value: '2 min', label: 'Pour démarrer' },
                { value: '0 FCFA', label: 'Pour commencer' },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p
                    className="text-2xl font-black text-white leading-none"
                    style={{ textShadow: '0 0 24px rgba(0,255,133,0.35)' }}
                  >
                    {value}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mt-6">
              {[
                { icon: Zap,    text: 'Suivi clients en temps réel' },
                { icon: Shield, text: 'Données sécurisées' },
                { icon: Star,   text: 'Rapports automatiques' },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <Icon size={11} style={{ color: '#00FF85' }} />
                  <span className="text-[11px] font-medium text-white/70">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Badge bas */}
          <div
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 self-start"
            style={{
              background: 'rgba(0,255,133,0.10)',
              border: '1px solid rgba(0,255,133,0.24)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span
              className="h-2 w-2 rounded-full animate-pulse"
              style={{ background: '#00FF85', boxShadow: '0 0 8px #00FF85' }}
            />
            <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Plateforme sécurisée · Données chiffrées · RGPD conforme
            </span>
          </div>
        </div>
      </div>

      {/* ── Panneau droit : formulaire ─────────────────────────────── */}
      <div
        className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-12"
        style={{ background: '#030309' }}
      >
        {/* Logo mobile */}
        <div className="lg:hidden mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl"
            style={{
              background: 'linear-gradient(135deg, #00FF85 0%, #00D166 100%)',
              boxShadow: '0 0 28px rgba(0,255,133,0.40)',
            }}
          >
            <Dumbbell size={28} className="text-black" strokeWidth={2.5} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-white">TerangaCoach</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestion simplifiée pour coachs</p>
          </div>
        </div>

        {/* Card formulaire */}
        <div className="w-full max-w-sm">
          <div
            className="w-full rounded-3xl p-7"
            style={{
              background: 'linear-gradient(160deg, rgba(18,18,42,0.98) 0%, rgba(10,10,24,1) 100%)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {children}
          </div>
        </div>

        <p className="mt-6 text-xs text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
          © {new Date().getFullYear()} TerangaCoach — Conçu pour les coachs d&apos;Afrique de l&apos;Ouest
        </p>
      </div>
    </div>
  )
}
