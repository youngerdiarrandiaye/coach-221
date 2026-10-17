'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Bell, Clock, MessageCircle, X, ChevronRight } from 'lucide-react'
import { getUpcomingAlertsAction } from './actions'
import { notify } from '@/lib/toast'
import type { SessionWithClient } from '@/dao/sessionDao'

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

function toWaPhone(raw: string): string {
  let n = raw.replace(/[\s\-\.\(\)]/g, '')
  if (n.startsWith('+'))   n = n.slice(1)
  if (n.startsWith('221')) return n
  if (n.startsWith('0'))   n = n.slice(1)
  return '221' + n
}

function buildWhatsAppLink(session: SessionWithClient, coachNom: string): string {
  const date  = new Date(session.date_heure)
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const prenom = session.clients.prenom
  const msg = encodeURIComponent(
    `🏋️ *Rappel de séance*\n\nBonjour *${prenom}*,\n\nVotre séance *${session.titre}* est prévu à *${heure}* aujourd'hui.\n\n⏱ Durée : ${session.duree_minutes} min\n\nPréparez-vous bien, à tout de suite ! 💪\n— Coach ${coachNom}`
  )
  const phone = toWaPhone(session.clients.telephone)
  return `https://wa.me/${phone}?text=${msg}`
}

interface AlertCardProps {
  session: SessionWithClient
  coachNom: string
  onDismiss: (id: string) => void
}

function AlertCard({ session, coachNom, onDismiss }: AlertCardProps) {
  const [msLeft, setMsLeft] = useState(() => new Date(session.date_heure).getTime() - Date.now())
  const isUrgent = msLeft < 60 * 60 * 1000

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = new Date(session.date_heure).getTime() - Date.now()
      setMsLeft(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [session.date_heure])

  const waLink  = buildWhatsAppLink(session, coachNom)
  const accent  = isUrgent ? '#FF3B5C' : '#00FF85'
  const accentR = isUrgent ? '255,59,92' : '0,255,133'
  const waColor = '#25D366'

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: `linear-gradient(135deg,rgba(${accentR},0.09) 0%,rgba(10,10,24,0.98) 100%)`,
        border:     `1.5px solid rgba(${accentR},0.42)`,
        boxShadow:  `0 0 28px rgba(${accentR},0.12), 0 4px 16px rgba(0,0,0,0.50)`,
        animation:  isUrgent ? 'pulse-border-red 2s ease-in-out infinite' : undefined,
      }}
    >
      {/* ── Layout unique : colonne mobile → ligne lg ── */}
      <div className="flex items-start gap-3 p-3.5 sm:p-4 lg:items-center lg:gap-4 lg:py-3.5 lg:px-5">

        {/* Icône */}
        <div
          className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: `rgba(${accentR},0.18)`,
            border:     `1px solid rgba(${accentR},0.38)`,
            boxShadow:  `0 0 14px rgba(${accentR},0.22)`,
            animation:  'pulse 2s ease-in-out infinite',
          }}
        >
          <Bell size={16} className="sm:hidden" style={{ color: accent }} />
          <Bell size={18} className="hidden sm:block" style={{ color: accent }} />
        </div>

        {/* Contenu central */}
        <div className="flex-1 min-w-0">

          {/* Ligne 1 : badge + titre + client (sur desktop tout sur une ligne) */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest shrink-0"
              style={{ color: accent }}
            >
              {isUrgent ? '🔴 Imminente' : '🟢 Prochaine'}
            </span>
            <span className="text-sm font-black text-white leading-tight truncate max-w-[160px] sm:max-w-none">
              {session.titre}
            </span>
            <span className="hidden sm:inline text-muted-foreground opacity-40 text-xs">·</span>
            <span className="text-xs text-muted-foreground truncate">
              {session.clients.prenom} {session.clients.nom}
            </span>
          </div>

          {/* Ligne 2 : countdown + boutons (mobile : 2 lignes ; lg : 1 ligne) */}
          <div className="mt-2 lg:mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">

            {/* Countdown */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Clock size={12} className="sm:hidden" style={{ color: accent }} />
              <Clock size={13} className="hidden sm:block" style={{ color: accent }} />
              <span
                className={`text-sm sm:text-base font-black tabular-nums leading-none ${isUrgent ? 'glow-red' : 'glow-green'}`}
                style={{ color: accent }}
              >
                {formatCountdown(msLeft)}
              </span>
              <span className="text-[11px] text-muted-foreground">restant</span>
            </div>

            {/* Boutons */}
            <div className="flex items-center gap-2">
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'rgba(37,211,102,0.16)',
                  border:     '1px solid rgba(37,211,102,0.38)',
                  color:      waColor,
                  boxShadow:  '0 0 10px rgba(37,211,102,0.14)',
                  transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)',
                }}
              >
                <MessageCircle size={12} />
                <span className="hidden xs:inline sm:inline">Rappel&nbsp;</span>WhatsApp
              </a>
              <Link
                href={`/sessions/${session.id}`}
                className="flex items-center gap-1 rounded-xl px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-muted-foreground transition-all hover:text-white hover:scale-105 active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border:     '1px solid rgba(255,255,255,0.10)',
                  transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)',
                }}
              >
                <span className="hidden sm:inline">Voir la séance</span>
                <span className="sm:hidden">Voir</span>
                <ChevronRight size={11} />
              </Link>
            </div>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => onDismiss(session.id)}
          className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-white transition-colors self-start lg:self-center"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

interface Props {
  coachNom: string
}

export function SessionAlertBanner({ coachNom }: Props) {
  const [sessions, setSessions] = useState<SessionWithClient[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const data = await getUpcomingAlertsAction()
    setSessions(data)
    setLoaded(true)

    // Toast pour les séances dans moins d'1h
    data.forEach((s) => {
      const msLeft = new Date(s.date_heure).getTime() - Date.now()
      if (msLeft < 60 * 60 * 1000 && msLeft > 0) {
        const mins = Math.floor(msLeft / 60_000)
        notify.warning(
          `Séance dans ${mins} min`,
          `${s.titre} — ${s.clients.prenom} ${s.clients.nom}`,
        )
      }
    })
  }, [])

  useEffect(() => {
    load()
    // Rechargement toutes les 5 minutes
    const interval = setInterval(load, 5 * 60_000)
    return () => clearInterval(interval)
  }, [load])

  const visible = sessions.filter((s) => !dismissed.has(s.id))

  if (!loaded || visible.length === 0) return null

  return (
    <div className="space-y-3 mb-2" data-animate="card">
      {visible.map((session) => (
        <AlertCard
          key={session.id}
          session={session}
          coachNom={coachNom}
          onDismiss={(id) => setDismissed((prev) => { const next = new Set(Array.from(prev)); next.add(id); return next })}
        />
      ))}
    </div>
  )
}
