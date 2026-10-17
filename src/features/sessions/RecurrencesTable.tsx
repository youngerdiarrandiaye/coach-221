'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Clock, CalendarRange, RotateCcw,
  Trash2, Loader2, AlertTriangle,
} from 'lucide-react'
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { deleteRecurrenceAction } from './recurrenceActions'
import type { RecurrenceWithClient } from '@/dao/sessionRecurrenceDao'

const JOUR_LABELS: Record<number, string> = {
  0: 'Dim', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam',
}

function formatDateFR(str: string) {
  return new Date(str + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

interface Props {
  recurrences: RecurrenceWithClient[]
  upcomingCounts: number[]
}

export function RecurrencesTable({ recurrences, upcomingCounts }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<RecurrenceWithClient | null>(null)
  const [selectedUpcoming, setSelectedUpcoming] = useState(0)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openSheet(r: RecurrenceWithClient, upcoming: number) {
    setSelected(r)
    setSelectedUpcoming(upcoming)
    setConfirmDelete(false)
    setDeleteError(null)
    setOpen(true)
  }

  function handleDelete() {
    if (!selected) return
    startTransition(async () => {
      const result = await deleteRecurrenceAction(selected.id)
      if (result?.error) {
        setDeleteError(result.error)
      } else {
        setOpen(false)
        setSelected(null)
        router.refresh()
      }
    })
  }

  return (
    <>
      {/* Table */}
      <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#7B6FFF' }}>Titre</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden sm:table-cell" style={{ color: '#9090B8' }}>Client</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Jours</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden md:table-cell" style={{ color: '#9090B8' }}>Heure</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>À venir</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden sm:table-cell" style={{ color: '#9090B8' }}>Statut</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {recurrences.map((r, i) => {
              const upcoming = upcomingCounts[i]
              const jours = [...r.jours].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
              const isEven = i % 2 === 0
              return (
                <tr
                  key={r.id}
                  onClick={() => openSheet(r, upcoming)}
                  className="group cursor-pointer hover:bg-white/[0.04] transition-colors"
                  style={{
                    background: isEven ? 'rgba(255,255,255,0.015)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    opacity: r.actif ? 1 : 0.55,
                  }}
                >
                  {/* Titre */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <RotateCcw size={12} className="shrink-0" style={{ color: '#7B6FFF' }} />
                      <p className="text-sm font-bold text-white truncate">{r.titre}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 sm:hidden">{r.clients.prenom} {r.clients.nom}</p>
                  </td>
                  {/* Client */}
                  <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">
                    <p className="text-sm text-white/80">{r.clients.prenom} {r.clients.nom}</p>
                  </td>
                  {/* Jours */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {jours.slice(0, 3).map((j) => (
                        <span key={j} className="rounded px-1.5 py-0.5 text-[10px] font-black"
                          style={{ background: 'rgba(123,111,255,0.16)', color: '#7B6FFF' }}
                        >
                          {JOUR_LABELS[j]}
                        </span>
                      ))}
                      {jours.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{jours.length - 3}</span>
                      )}
                    </div>
                  </td>
                  {/* Heure */}
                  <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                    <p className="text-sm text-white/80">{r.heure}</p>
                    <p className="text-[10px] text-muted-foreground">{r.duree_minutes} min</p>
                  </td>
                  {/* À venir */}
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black"
                      style={{ background: 'rgba(123,111,255,0.14)', border: '1px solid rgba(123,111,255,0.30)', color: '#7B6FFF' }}
                    >
                      {upcoming}
                    </span>
                  </td>
                  {/* Statut */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={r.actif
                        ? { background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.35)', color: '#00FF85' }
                        : { background: 'rgba(255,59,92,0.12)', border: '1px solid rgba(255,59,92,0.30)', color: '#FF3B5C' }
                      }
                    >
                      {r.actif ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {/* Flèche */}
                  <td className="px-4 py-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                      style={{ background: 'rgba(123,111,255,0.12)', border: '1px solid rgba(123,111,255,0.25)' }}
                    >
                      <ChevronRight size={13} style={{ color: '#7B6FFF' }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet */}
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setConfirmDelete(false); setDeleteError(null) } }}>
        <SheetContent className="overflow-y-auto p-0 flex flex-col" style={{ width: '100%', maxWidth: 440 }}>
          {selected && (() => {
            const jours = [...selected.jours].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
            return (
              <>
                {/* Header */}
                <div className="p-5 pb-4" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <RotateCcw size={14} style={{ color: '#7B6FFF' }} />
                        <SheetTitle className="text-white font-black text-base truncate">{selected.titre}</SheetTitle>
                      </div>
                      <p className="text-xs" style={{ color: '#9090B8' }}>{selected.clients.prenom} {selected.clients.nom}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
                      style={selected.actif
                        ? { background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.35)', color: '#00FF85' }
                        : { background: 'rgba(255,59,92,0.12)', border: '1px solid rgba(255,59,92,0.30)', color: '#FF3B5C' }
                      }
                    >
                      {selected.actif ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Détails */}
                <div className="flex-1 p-4 space-y-2.5">
                  {/* Jours */}
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Jours de la semaine</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {jours.map((j) => (
                        <span key={j} className="rounded-lg px-2.5 py-1 text-xs font-black"
                          style={{ background: 'rgba(123,111,255,0.16)', color: '#7B6FFF' }}
                        >
                          {JOUR_LABELS[j]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Heure + Durée */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock size={11} style={{ color: '#00CFFF' }} />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Heure</span>
                      </div>
                      <p className="text-sm font-bold text-white">{selected.heure}</p>
                    </div>
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Clock size={11} style={{ color: '#00CFFF' }} />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Durée</span>
                      </div>
                      <p className="text-sm font-bold text-white">{selected.duree_minutes} min</p>
                    </div>
                  </div>

                  {/* Plage de dates */}
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <CalendarRange size={11} style={{ color: '#FFD600' }} />
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Plage de dates</span>
                    </div>
                    <p className="text-sm font-bold text-white">
                      {formatDateFR(selected.date_debut)}
                      <span className="text-muted-foreground mx-1">→</span>
                      {selected.date_fin ? formatDateFR(selected.date_fin) : 'Ouvert'}
                    </p>
                  </div>

                  {/* À venir */}
                  <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'rgba(123,111,255,0.08)', border: '1px solid rgba(123,111,255,0.22)' }}>
                    <span className="text-2xl font-black" style={{ color: '#7B6FFF' }}>{selectedUpcoming}</span>
                    <div>
                      <p className="text-sm font-bold text-white">séance{selectedUpcoming !== 1 ? 's' : ''} à venir</p>
                      <p className="text-xs text-muted-foreground">planifiées dans cette série</p>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  {!confirmDelete ? (
                    <>
                      <Link
                        href={`/sessions?recurrenceId=${selected.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                        style={{ background: 'rgba(0,207,255,0.12)', border: '1.5px solid rgba(0,207,255,0.35)', color: '#00CFFF' }}
                      >
                        Voir les séances →
                      </Link>
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02]"
                        style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.22)', color: '#FF3B5C' }}
                      >
                        <Trash2 size={13} /> Supprimer la série
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.25)' }}>
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle size={15} style={{ color: '#FF3B5C', flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p className="text-sm font-bold text-white">Supprimer la série ?</p>
                          <p className="text-xs mt-0.5" style={{ color: '#9090B8' }}>
                            {selectedUpcoming > 0
                              ? `${selectedUpcoming} séance${selectedUpcoming !== 1 ? 's' : ''} planifiée${selectedUpcoming !== 1 ? 's' : ''} seront supprimées.`
                              : 'Aucune séance future dans cette série.'}
                            {' '}Les séances passées restent enregistrées.
                          </p>
                          {deleteError && <p className="text-xs text-red-400 mt-1">{deleteError}</p>}
                        </div>
                      </div>
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
          <SheetDescription className="sr-only">Détails de la récurrence</SheetDescription>
        </SheetContent>
      </Sheet>
    </>
  )
}
