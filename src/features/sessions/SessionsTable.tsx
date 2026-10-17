'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, ArrowUp, ArrowDown, RotateCcw,
  CalendarDays, Clock, User2, FileText, StickyNote,
  CheckCircle2, XCircle, RefreshCw, Trash2, Loader2,
} from 'lucide-react'
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { STATUT_SESSION_LABELS } from '@/config/constants'
import { formatTime } from '@/utils/format'
import { updateSessionStatusAction, deleteSessionFromListAction } from './actions'
import type { SessionWithClient } from '@/dao/sessionDao'
import type { SessionStatus } from '@/entities'

const STATUT_STYLES: Record<string, React.CSSProperties> = {
  PLANIFIEE: { background: 'rgba(0,207,255,0.12)', border: '1px solid rgba(0,207,255,0.40)', color: '#00CFFF' },
  EFFECTUEE: { background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.40)', color: '#00FF85' },
  ANNULEE:   { background: 'rgba(255,59,92,0.12)',  border: '1px solid rgba(255,59,92,0.40)',  color: '#FF3B5C' },
}
const STATUT_DOTS: Record<string, string> = {
  PLANIFIEE: '#00CFFF', EFFECTUEE: '#00FF85', ANNULEE: '#FF3B5C',
}

interface Props {
  sessions: SessionWithClient[]
  sort: string
  sortDateHref: string
  todayStr: string
}

export function SessionsTable({ sessions, sort, sortDateHref, todayStr }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<SessionWithClient | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function openSheet(s: SessionWithClient) {
    setSelected(s)
    setConfirmDelete(false)
    setOpen(true)
  }

  function handleStatusChange(newStatus: SessionStatus) {
    if (!selected) return
    startTransition(async () => {
      await updateSessionStatusAction(selected.id, newStatus)
      setSelected((prev) => prev ? { ...prev, statut: newStatus } : prev)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!selected) return
    startTransition(async () => {
      await deleteSessionFromListAction(selected.id)
      setOpen(false)
      setSelected(null)
      router.refresh()
    })
  }

  const now = new Date()

  return (
    <>
      {/* Table */}
      <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full min-w-[580px] border-collapse">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th className="px-4 py-3 text-left">
                <Link
                  href={sortDateHref}
                  className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest transition-colors hover:opacity-80"
                  style={{ color: '#00FF85' }}
                >
                  Date
                  {sort === 'newest' ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                </Link>
              </th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Heure</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Client</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Titre</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden md:table-cell" style={{ color: '#9090B8' }}>Durée</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Statut</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const dt = new Date(s.date_heure)
              const dateStr = s.date_heure.slice(0, 10)
              const isToday = dateStr === todayStr
              const isFuture = s.date_heure >= now.toISOString() && s.statut === 'PLANIFIEE'
              const isEven = i % 2 === 0
              const hasRecurrence = (s as { recurrence_id?: string | null }).recurrence_id

              return (
                <tr
                  key={s.id}
                  onClick={() => openSheet(s)}
                  className="group cursor-pointer hover:bg-white/[0.04] transition-colors"
                  style={{
                    background: isEven ? 'rgba(255,255,255,0.015)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Date */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {isToday && (
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: '#00FF85', boxShadow: '0 0 6px #00FF85' }} />
                      )}
                      <div>
                        <p className="text-sm font-bold" style={{ color: isFuture ? '#00CFFF' : 'white' }}>
                          {dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{dt.getFullYear()}</p>
                      </div>
                    </div>
                  </td>
                  {/* Heure */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm font-semibold text-white">{formatTime(s.date_heure)}</p>
                  </td>
                  {/* Client */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm font-bold text-white">{s.clients.prenom} {s.clients.nom}</p>
                  </td>
                  {/* Titre */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm text-white truncate">{s.titre}</p>
                      {hasRecurrence && <RotateCcw size={10} className="shrink-0" style={{ color: '#7B6FFF' }} />}
                    </div>
                  </td>
                  {/* Durée */}
                  <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                    <p className="text-xs text-muted-foreground">{s.duree_minutes} min</p>
                  </td>
                  {/* Statut */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: STATUT_DOTS[s.statut] }} />
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={STATUT_STYLES[s.statut]}>
                        {STATUT_SESSION_LABELS[s.statut]}
                      </span>
                    </span>
                  </td>
                  {/* Flèche */}
                  <td className="px-4 py-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                      style={{ background: 'rgba(0,207,255,0.12)', border: '1px solid rgba(0,207,255,0.25)' }}
                    >
                      <ChevronRight size={13} style={{ color: '#00CFFF' }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet */}
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmDelete(false) }}>
        <SheetContent className="overflow-y-auto p-0 flex flex-col" style={{ width: '100%', maxWidth: 440 }}>
          {selected && (() => {
            const dt = new Date(selected.date_heure)
            const hasRecurrence = (selected as { recurrence_id?: string | null }).recurrence_id
            return (
              <>
                {/* Header */}
                <div className="p-5 pb-4" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div className="min-w-0">
                      <SheetTitle className="text-white font-black text-base leading-tight truncate">{selected.titre}</SheetTitle>
                      <p className="text-xs mt-1" style={{ color: '#9090B8' }}>{selected.clients.prenom} {selected.clients.nom}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={STATUT_STYLES[selected.statut]}>
                      {STATUT_SESSION_LABELS[selected.statut]}
                    </span>
                  </div>
                </div>

                {/* Détails */}
                <div className="flex-1 p-4 space-y-2.5">
                  {/* Date + Heure */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarDays size={12} style={{ color: '#00CFFF' }} />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Date</span>
                      </div>
                      <p className="text-sm font-bold text-white">
                        {dt.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Clock size={12} style={{ color: '#00CFFF' }} />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Heure · Durée</span>
                      </div>
                      <p className="text-sm font-bold text-white">{formatTime(selected.date_heure)} · {selected.duree_minutes} min</p>
                    </div>
                  </div>

                  {/* Client */}
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <User2 size={12} style={{ color: '#7B6FFF' }} />
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Client</span>
                    </div>
                    <p className="text-sm font-bold text-white">{selected.clients.prenom} {selected.clients.nom}</p>
                    {selected.clients.telephone && (
                      <p className="text-xs text-muted-foreground mt-0.5">{selected.clients.telephone}</p>
                    )}
                  </div>

                  {/* Description */}
                  {selected.description && (
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={12} style={{ color: '#9090B8' }} />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Description</span>
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">{selected.description}</p>
                    </div>
                  )}

                  {/* Notes */}
                  {selected.notes && (
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <StickyNote size={12} style={{ color: '#FFD600' }} />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Notes</span>
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">{selected.notes}</p>
                    </div>
                  )}

                  {/* Récurrence */}
                  {hasRecurrence && (
                    <div className="flex items-center gap-2 rounded-2xl p-3" style={{ background: 'rgba(123,111,255,0.08)', border: '1px solid rgba(123,111,255,0.22)' }}>
                      <RotateCcw size={13} style={{ color: '#7B6FFF' }} />
                      <span className="text-xs font-semibold" style={{ color: '#7B6FFF' }}>Séance récurrente</span>
                    </div>
                  )}

                  {/* Changement de statut */}
                  {selected.statut === 'PLANIFIEE' && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-1">Changer le statut</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleStatusChange('EFFECTUEE')}
                          disabled={isPending}
                          className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                          style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.35)', color: '#00FF85' }}
                        >
                          {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                          Effectuée
                        </button>
                        <button
                          onClick={() => handleStatusChange('ANNULEE')}
                          disabled={isPending}
                          className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                          style={{ background: 'rgba(255,59,92,0.10)', border: '1px solid rgba(255,59,92,0.30)', color: '#FF3B5C' }}
                        >
                          {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                  {(selected.statut === 'EFFECTUEE' || selected.statut === 'ANNULEE') && (
                    <div className="pt-1">
                      <button
                        onClick={() => handleStatusChange('PLANIFIEE')}
                        disabled={isPending}
                        className="w-full flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-50"
                        style={{ background: 'rgba(0,207,255,0.10)', border: '1px solid rgba(0,207,255,0.28)', color: '#00CFFF' }}
                      >
                        {isPending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        Remettre en planifiée
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  {!confirmDelete ? (
                    <>
                      <Link
                        href={`/sessions/${selected.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#9090B8' }}
                      >
                        Voir la séance complète
                      </Link>
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02]"
                        style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.22)', color: '#FF3B5C' }}
                      >
                        <Trash2 size={13} /> Supprimer la séance
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.25)' }}>
                      <p className="text-sm font-bold text-white">Supprimer &quot;{selected.titre}&quot; ?</p>
                      <p className="text-xs" style={{ color: '#9090B8' }}>Cette action est irréversible.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(false)}
                          className="flex-1 rounded-xl py-2 text-xs font-bold"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#9090B8' }}
                        >
                          Annuler
                        </button>
                        <button onClick={handleDelete} disabled={isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold disabled:opacity-50"
                          style={{ background: 'rgba(255,59,92,0.18)', border: '1px solid rgba(255,59,92,0.40)', color: '#FF3B5C' }}
                        >
                          {isPending ? <Loader2 size={13} className="animate-spin" /> : <><Trash2 size={13} /> Supprimer</>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )
          })()}
          <SheetDescription className="sr-only">Détails de la séance</SheetDescription>
        </SheetContent>
      </Sheet>
    </>
  )
}
