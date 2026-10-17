'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Bell, MessageCircle, X, ChevronRight,
  ChevronLeft, Calendar, User,
} from 'lucide-react'
import { getUpcomingAlertsAction } from './actions'
import { notify } from '@/lib/toast'
import { useAuthStore } from '@/store/authStore'
import type { SessionWithClient } from '@/dao/sessionDao'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
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
  const msg = encodeURIComponent(
    `🏋️ *Rappel de séance*\n\nBonjour *${session.clients.prenom}*,\n\nVotre séance *${session.titre}* est prévue à *${heure}* aujourd'hui.\n\n⏱ Durée : ${session.duree_minutes} min\n\nPréparez-vous bien, à tout de suite ! 💪\n— Coach ${coachNom}`
  )
  const phone = toWaPhone(session.clients.telephone)
  return `https://wa.me/${phone}?text=${msg}`
}

// ─── Countdown hook ──────────────────────────────────────────────────────────

function useCountdown(dateHeure: string) {
  const [ms, setMs] = useState(() => new Date(dateHeure).getTime() - Date.now())
  useEffect(() => {
    const iv = setInterval(() => {
      const r = new Date(dateHeure).getTime() - Date.now()
      setMs(r)
      if (r <= 0) clearInterval(iv)
    }, 1000)
    return () => clearInterval(iv)
  }, [dateHeure])
  return ms
}

// ─── Alert list item ─────────────────────────────────────────────────────────

function AlertListItem({
  session,
  onSelect,
  onDismiss,
}: {
  session:   SessionWithClient
  onSelect:  () => void
  onDismiss: () => void
}) {
  const ms       = useCountdown(session.date_heure)
  const isUrgent = ms < 60 * 60 * 1000
  const accent   = isUrgent ? '#FF3B5C' : '#00FF85'

  return (
    <div
      className="group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.04] border-b border-white/[0.06] last:border-0"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
    >
      {/* Dot */}
      <span
        className="shrink-0 h-2.5 w-2.5 rounded-full"
        style={{
          background: accent,
          boxShadow:  `0 0 6px ${accent}`,
          animation:  isUrgent ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate leading-tight">{session.titre}</p>
        <p className="text-xs truncate mt-0.5" style={{ color: '#9090B8' }}>
          {session.clients.prenom} {session.clients.nom}
        </p>
      </div>

      {/* Countdown + chevron */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="text-xs font-black tabular-nums"
          style={{ color: accent }}
        >
          {formatCountdown(ms)}
        </span>
        <ChevronRight size={13} style={{ color: '#555577' }} />
      </div>

      {/* Dismiss — stop propagation */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss() }}
        className="shrink-0 h-6 w-6 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: '#555577' }}
        aria-label="Ignorer"
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ─── Alert detail panel ───────────────────────────────────────────────────────

function AlertDetail({
  session,
  coachNom,
  onBack,
  onDismiss,
}: {
  session:   SessionWithClient
  coachNom:  string
  onBack:    () => void
  onDismiss: () => void
}) {
  const ms       = useCountdown(session.date_heure)
  const isUrgent = ms < 60 * 60 * 1000
  const accent   = isUrgent ? '#FF3B5C' : '#00FF85'
  const accentR  = isUrgent ? '255,59,92' : '0,255,133'
  const waLink   = buildWhatsAppLink(session, coachNom)
  const date     = new Date(session.date_heure)
  const heure    = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const dateStr  = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          style={{ color: '#9090B8' }}
          aria-label="Retour"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-xs font-black uppercase tracking-widest flex-1" style={{ color: accent }}>
          {isUrgent ? '🔴 Imminente' : '🟢 Prochaine'}
        </span>
        <button
          onClick={onDismiss}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          style={{ color: '#555577' }}
          aria-label="Ignorer"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Countdown big */}
        <div
          className="rounded-2xl p-4 text-center"
          style={{
            background: `rgba(${accentR},0.07)`,
            border:     `1px solid rgba(${accentR},0.25)`,
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#6A6A9A' }}>
            Dans
          </p>
          <p
            className="text-3xl font-black tabular-nums"
            style={{ color: accent, textShadow: `0 0 20px rgba(${accentR},0.5)` }}
          >
            {formatCountdown(ms)}
          </p>
        </div>

        {/* Session info */}
        <div className="space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div
              className="mt-0.5 h-8 w-8 shrink-0 flex items-center justify-center rounded-xl"
              style={{ background: `rgba(${accentR},0.14)`, border: `1px solid rgba(${accentR},0.28)` }}
            >
              <Bell size={14} style={{ color: accent }} />
            </div>
            <div>
              <p className="text-sm font-black text-white leading-tight">{session.titre}</p>
              <p className="text-xs mt-0.5" style={{ color: '#6A6A9A' }}>Séance · {session.duree_minutes} min</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div
              className="mt-0.5 h-8 w-8 shrink-0 flex items-center justify-center rounded-xl"
              style={{ background: 'rgba(123,111,255,0.12)', border: '1px solid rgba(123,111,255,0.25)' }}
            >
              <User size={14} style={{ color: '#7B6FFF' }} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{session.clients.prenom} {session.clients.nom}</p>
              <p className="text-xs mt-0.5" style={{ color: '#6A6A9A' }}>Client</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div
              className="mt-0.5 h-8 w-8 shrink-0 flex items-center justify-center rounded-xl"
              style={{ background: 'rgba(0,207,255,0.12)', border: '1px solid rgba(0,207,255,0.25)' }}
            >
              <Calendar size={14} style={{ color: '#00CFFF' }} />
            </div>
            <div>
              <p className="text-sm font-bold text-white capitalize">{dateStr}</p>
              <p className="text-xs mt-0.5" style={{ color: '#6A6A9A' }}>à {heure}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex flex-col gap-2.5">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'rgba(37,211,102,0.14)',
            border:     '1px solid rgba(37,211,102,0.35)',
            color:      '#25D366',
          }}
        >
          <MessageCircle size={15} />
          Envoyer rappel WhatsApp
        </a>
        <Link
          href={`/sessions/${session.id}`}
          className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border:     '1px solid rgba(255,255,255,0.10)',
            color:      '#9090B8',
          }}
        >
          Voir la séance <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  )
}

// ─── Main bell component ───────────────────────────────────────────────────────

export function NotificationBell() {
  const profile  = useAuthStore((s) => s.profile)
  const coachNom = profile?.prenom ?? 'Coach'

  const [sessions,  setSessions]  = useState<SessionWithClient[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [open,      setOpen]      = useState(false)
  const [selected,  setSelected]  = useState<SessionWithClient | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const data = await getUpcomingAlertsAction()
    setSessions(data)

    data.forEach(s => {
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
    const iv = setInterval(load, 5 * 60_000)
    return () => clearInterval(iv)
  }, [load])

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSelected(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const visible = sessions.filter(s => !dismissed.has(s.id))
  const count   = visible.length

  const dismiss = (id: string) => {
    setDismissed(prev => new Set(Array.from(prev).concat(id)))
    if (selected?.id === id) setSelected(null)
    if (count === 1) setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* ── Bell button ── */}
      <button
        onClick={() => { setOpen(p => !p); if (open) setSelected(null) }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:scale-105 active:scale-95"
        style={{
          background: open
            ? 'rgba(0,255,133,0.12)'
            : count > 0
              ? 'rgba(255,59,92,0.10)'
              : 'rgba(255,255,255,0.05)',
          border: open
            ? '1px solid rgba(0,255,133,0.35)'
            : count > 0
              ? '1px solid rgba(255,59,92,0.30)'
              : '1px solid rgba(255,255,255,0.09)',
        }}
        aria-label={`Notifications${count > 0 ? ` (${count})` : ''}`}
      >
        <Bell
          size={17}
          style={{ color: open ? '#00FF85' : count > 0 ? '#FF3B5C' : '#9090B8' }}
          className={count > 0 && !open ? 'animate-[wiggle_1s_ease-in-out_infinite]' : ''}
        />

        {/* Badge */}
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full text-[9px] font-black px-[3px]"
            style={{ background: '#FF3B5C', color: '#fff', boxShadow: '0 0 8px rgba(255,59,92,0.6)' }}
          >
            {count}
          </span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl"
          style={{
            width:       '320px',
            maxWidth:    'calc(100vw - 24px)',
            maxHeight:   '480px',
            background:  'rgba(10,10,24,0.97)',
            border:      '1px solid rgba(255,255,255,0.10)',
            boxShadow:   '0 20px 60px rgba(0,0,0,0.70), 0 0 0 1px rgba(0,255,133,0.06)',
            backdropFilter: 'blur(24px)',
          }}
        >
          {selected ? (
            /* ── Detail view ── */
            <AlertDetail
              session={selected}
              coachNom={coachNom}
              onBack={() => setSelected(null)}
              onDismiss={() => { dismiss(selected.id); setSelected(null) }}
            />
          ) : (
            /* ── List view ── */
            <>
              {/* Panel header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.07)' }}
              >
                <div className="flex items-center gap-2">
                  <Bell size={13} style={{ color: '#FF3B5C' }} />
                  <span className="text-xs font-black uppercase tracking-widest text-white">
                    Alertes séances
                  </span>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-black"
                  style={{ background: 'rgba(255,59,92,0.18)', color: '#FF3B5C' }}
                >
                  {count} {count > 1 ? 'alertes' : 'alerte'}
                </span>
              </div>

              {/* List */}
              <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                    <Bell size={28} style={{ color: '#2A2A4A' }} />
                    <p className="text-sm font-semibold" style={{ color: '#555577' }}>
                      Aucune séance imminente
                    </p>
                  </div>
                ) : (
                  visible.map(s => (
                    <AlertListItem
                      key={s.id}
                      session={s}
                      onSelect={() => setSelected(s)}
                      onDismiss={() => dismiss(s.id)}
                    />
                  ))
                )}
              </div>

              {/* Footer hint */}
              {visible.length > 0 && (
                <div
                  className="px-4 py-2.5 border-t"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[10px] text-center" style={{ color: '#3A3A5A' }}>
                    Touchez une alerte pour les détails
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
