'use client'

import Link from 'next/link'
import { CalendarDays, ChevronRight, Plus } from 'lucide-react'
import type { SessionWithClient } from '@/dao/sessionDao'
import { relativeDay } from '@/utils/date'
import { formatTime } from '@/utils/format'

interface Props {
  sessions: SessionWithClient[]
}

const AVATAR_PALETTES = [
  ['#00FF85', '#00CFFF'],
  ['#00CFFF', '#7B6FFF'],
  ['#FFD600', '#FF6B35'],
  ['#FF3B5C', '#FF6B35'],
  ['#7B6FFF', '#00CFFF'],
  ['#00FF85', '#FFD600'],
]

function getAvatarGradient(name: string) {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const [c1, c2] = AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`
}

function isToday(iso: string) {
  const d = new Date(iso)
  const n = new Date()
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
}

function isWithinHour(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return diff > 0 && diff < 60 * 60_000
}

export function UpcomingSessions({ sessions }: Props) {
  return (
    <div className="tc-card overflow-hidden" data-animate="card">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.22)' }}
          >
            <CalendarDays size={14} style={{ color: '#00FF85' }} />
          </div>
          <h2 className="text-sm font-black text-white">Séances à venir</h2>
          {sessions.length > 0 && (
            <span
              className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-black"
              style={{ background: 'rgba(0,255,133,0.18)', color: '#00FF85' }}
            >
              {sessions.length}
            </span>
          )}
        </div>
        <Link
          href="/sessions"
          className="flex items-center gap-1 text-[11px] font-semibold transition-all hover:-translate-y-px"
          style={{ color: '#00FF85', transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)' }}
        >
          Voir tout
          <ChevronRight size={12} />
        </Link>
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <CalendarDays size={24} style={{ color: '#3A3A6A' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">Agenda vide</p>
            <p className="text-xs text-muted-foreground mt-0.5">Planifiez votre prochaine séance</p>
          </div>
          <Link
            href="/sessions/new"
            className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'rgba(0,255,133,0.12)',
              border:     '1px solid rgba(0,255,133,0.28)',
              color:      '#00FF85',
              transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)',
            }}
          >
            <Plus size={13} />
            Planifier une séance
          </Link>
        </div>
      )}

      {/* Session list */}
      {sessions.length > 0 && (
        <ul>
          {sessions.map((session, idx) => {
            const today   = isToday(session.date_heure)
            const urgent  = isWithinHour(session.date_heure)
            const fullName = `${session.clients.prenom} ${session.clients.nom}`
            const avatarGrad = getAvatarGradient(fullName)

            return (
              <li
                key={session.id}
                style={idx < sessions.length - 1
                  ? { borderBottom: '1px solid rgba(255,255,255,0.05)' }
                  : {}}
              >
                <Link
                  href={`/sessions/${session.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-all"
                  style={{ transitionTimingFunction: 'cubic-bezier(0.25,0.46,0.45,0.94)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateX(3px)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = ''
                    ;(e.currentTarget as HTMLElement).style.transform = ''
                  }}
                >
                  {/* Avatar avec pulse si urgent */}
                  <div className="relative shrink-0">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-2xl text-[11px] font-black text-black"
                      style={{ background: avatarGrad }}
                    >
                      {session.clients.prenom[0]}{session.clients.nom[0]}
                    </div>
                    {/* Dot de statut */}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full"
                      style={{
                        background: urgent ? '#FF3B5C' : today ? '#00FF85' : '#3A3A6A',
                        border:     '2px solid #0F0F1E',
                        animation:  (urgent || today) ? 'dot-pulse 2s ease-in-out infinite' : undefined,
                      }}
                    />
                  </div>

                  {/* Infos */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-white truncate">
                        {session.clients.prenom} {session.clients.nom}
                      </p>
                      {urgent && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide"
                          style={{ background: 'rgba(255,59,92,0.18)', color: '#FF3B5C' }}
                        >
                          Imminent
                        </span>
                      )}
                      {today && !urgent && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide"
                          style={{ background: 'rgba(0,255,133,0.12)', color: '#00FF85' }}
                        >
                          Auj.
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">{session.titre}</span>
                      <span className="text-muted-foreground opacity-40">·</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {relativeDay(session.date_heure)} {formatTime(session.date_heure)}
                      </span>
                    </div>
                  </div>

                  {/* Durée + flèche */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className="rounded-xl px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#8888B0' }}
                    >
                      {session.duree_minutes}&nbsp;min
                    </span>
                    <ChevronRight size={14} style={{ color: '#3A3A6A' }} />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
