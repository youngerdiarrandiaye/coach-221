'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, TrendingUp, TrendingDown, Minus, Plus, Activity } from 'lucide-react'
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { IMC_LABELS } from '@/config/constants'
import type { ClientRow } from '@/entities'
import type { ProgressWithClient } from '@/dao/progressDao'

const PALETTES = [
  ['#00FF85','#00CFFF'],['#00CFFF','#7B6FFF'],['#FFD600','#FF6B35'],
  ['#FF3B5C','#FF6B35'],['#7B6FFF','#00CFFF'],['#00FF85','#FFD600'],
]
function avatarGrad(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [c1, c2] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
}

function getImcLabel(imc: number): string {
  return IMC_LABELS.find((l) => imc < l.max)?.label ?? 'N/A'
}

export interface TrackedClientData {
  client: ClientRow
  latest: ProgressWithClient
  prev?: ProgressWithClient
}

interface Props {
  tracked: TrackedClientData[]
  untracked: ClientRow[]
}

export function ProgressTable({ tracked, untracked }: Props) {
  const [selectedTracked, setSelectedTracked] = useState<TrackedClientData | null>(null)
  const [selectedUntracked, setSelectedUntracked] = useState<ClientRow | null>(null)
  const [open, setOpen] = useState(false)

  function openTracked(data: TrackedClientData) {
    setSelectedTracked(data)
    setSelectedUntracked(null)
    setOpen(true)
  }
  function openUntracked(client: ClientRow) {
    setSelectedUntracked(client)
    setSelectedTracked(null)
    setOpen(true)
  }

  const allCount = tracked.length + untracked.length

  return (
    <>
      {allCount === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Activity size={28} style={{ color: '#3A3A6A' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/60">Aucun client</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ajoutez des clients pour suivre leur progression</p>
          </div>
          <Link
            href="/clients/new"
            className="flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:scale-105"
            style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.28)', color: '#00FF85' }}
          >
            <Plus size={13} /> Ajouter un client
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <table className="w-full min-w-[500px] border-collapse">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#00FF85' }}>Client</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Statut</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden sm:table-cell" style={{ color: '#9090B8' }}>Poids</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden md:table-cell" style={{ color: '#9090B8' }}>IMC</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Évolution</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {/* Clients suivis */}
              {tracked.map(({ client, latest, prev }, i) => {
                const fullName = `${client.prenom} ${client.nom}`
                const diff = latest.poids_kg !== null && prev?.poids_kg !== null && prev?.poids_kg !== undefined
                  ? latest.poids_kg - prev.poids_kg
                  : null
                const isEven = i % 2 === 0
                return (
                  <tr
                    key={client.id}
                    onClick={() => openTracked({ client, latest, prev })}
                    className="group cursor-pointer hover:bg-white/[0.04] transition-colors"
                    style={{
                      background: isEven ? 'rgba(255,255,255,0.015)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black text-black"
                          style={{ background: avatarGrad(fullName) }}
                        >
                          {client.prenom[0]}{client.nom[0]}
                        </div>
                        <p className="text-sm font-bold text-white truncate">{fullName}</p>
                      </div>
                    </td>
                    {/* Statut */}
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.35)', color: '#00FF85' }}
                      >
                        Suivi
                      </span>
                    </td>
                    {/* Poids */}
                    <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">
                      <p className="text-sm font-bold text-white">
                        {latest.poids_kg !== null ? `${latest.poids_kg} kg` : '—'}
                      </p>
                    </td>
                    {/* IMC */}
                    <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                      {latest.imc !== null ? (
                        <div>
                          <p className="text-sm font-bold text-white">{latest.imc}</p>
                          <p className="text-[10px] text-muted-foreground">{getImcLabel(latest.imc)}</p>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    {/* Évolution */}
                    <td className="px-4 py-3">
                      {diff === null ? (
                        <Minus size={14} style={{ color: '#3A3A6A' }} />
                      ) : diff < 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-xs font-bold"
                          style={{ background: 'rgba(0,255,133,0.12)', color: '#00FF85' }}
                        >
                          <TrendingDown size={12} />{diff.toFixed(1)} kg
                        </span>
                      ) : diff > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-xl px-2 py-0.5 text-xs font-bold"
                          style={{ background: 'rgba(255,59,92,0.12)', color: '#FF3B5C' }}
                        >
                          <TrendingUp size={12} />+{diff.toFixed(1)} kg
                        </span>
                      ) : (
                        <Minus size={14} style={{ color: '#3A3A6A' }} />
                      )}
                    </td>
                    {/* Flèche */}
                    <td className="px-4 py-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                        style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.25)' }}
                      >
                        <ChevronRight size={13} style={{ color: '#00FF85' }} />
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Clients sans mesures */}
              {untracked.map((client, idx) => {
                const fullName = `${client.prenom} ${client.nom}`
                const isEven = (tracked.length + idx) % 2 === 0
                return (
                  <tr
                    key={client.id}
                    onClick={() => openUntracked(client)}
                    className="group cursor-pointer hover:bg-white/[0.04] transition-colors"
                    style={{
                      background: isEven ? 'rgba(255,255,255,0.015)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      opacity: 0.6,
                    }}
                  >
                    {/* Client */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#6A6A9A' }}
                        >
                          {client.prenom[0]}{client.nom[0]}
                        </div>
                        <p className="text-sm font-bold text-white truncate">{fullName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#9090B8' }}
                      >
                        Sans mesures
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell"><span className="text-xs text-muted-foreground">—</span></td>
                    <td className="px-4 py-3 hidden md:table-cell"><span className="text-xs text-muted-foreground">—</span></td>
                    <td className="px-4 py-3"><Minus size={14} style={{ color: '#3A3A6A' }} /></td>
                    <td className="px-4 py-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                        style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.25)' }}
                      >
                        <ChevronRight size={13} style={{ color: '#00FF85' }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto p-0 flex flex-col" style={{ width: '100%', maxWidth: 440 }}>
          {/* Tracked client sheet */}
          {selectedTracked && (() => {
            const { client, latest, prev } = selectedTracked
            const fullName = `${client.prenom} ${client.nom}`
            const diff = latest.poids_kg !== null && prev?.poids_kg !== null && prev?.poids_kg !== undefined
              ? latest.poids_kg - prev.poids_kg
              : null
            const mesureDate = new Date(latest.mesure_date)
            return (
              <>
                {/* Header */}
                <div className="p-5 pb-4" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-3 pr-8">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black text-black"
                      style={{ background: avatarGrad(fullName) }}
                    >
                      {client.prenom[0]}{client.nom[0]}
                    </div>
                    <div>
                      <SheetTitle className="text-white font-black text-base">{fullName}</SheetTitle>
                      <span className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.35)', color: '#00FF85' }}
                      >
                        Suivi actif
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex-1 p-4 space-y-2.5">
                  {/* Date mesure */}
                  <p className="text-xs text-muted-foreground px-1">
                    Dernière mesure : {mesureDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>

                  {/* Poids + IMC */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(0,255,133,0.06)', border: '1px solid rgba(0,255,133,0.18)' }}>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Poids</p>
                      <p className="text-xl font-black text-white">
                        {latest.poids_kg !== null ? `${latest.poids_kg}` : '—'}
                        <span className="text-sm font-medium text-muted-foreground ml-1">kg</span>
                      </p>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(123,111,255,0.06)', border: '1px solid rgba(123,111,255,0.18)' }}>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">IMC</p>
                      <p className="text-xl font-black text-white">
                        {latest.imc !== null ? latest.imc : '—'}
                      </p>
                      {latest.imc !== null && (
                        <p className="text-[10px] text-muted-foreground">{getImcLabel(latest.imc)}</p>
                      )}
                    </div>
                  </div>

                  {/* Évolution */}
                  {diff !== null && (
                    <div className="rounded-2xl p-3" style={{
                      background: diff < 0 ? 'rgba(0,255,133,0.06)' : diff > 0 ? 'rgba(255,59,92,0.06)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${diff < 0 ? 'rgba(0,255,133,0.20)' : diff > 0 ? 'rgba(255,59,92,0.20)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Évolution</p>
                      <div className="flex items-center gap-2">
                        {diff < 0 ? (
                          <TrendingDown size={16} style={{ color: '#00FF85' }} />
                        ) : diff > 0 ? (
                          <TrendingUp size={16} style={{ color: '#FF3B5C' }} />
                        ) : (
                          <Minus size={16} style={{ color: '#9090B8' }} />
                        )}
                        <span className="text-base font-black" style={{ color: diff < 0 ? '#00FF85' : diff > 0 ? '#FF3B5C' : '#9090B8' }}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
                        </span>
                        <span className="text-xs text-muted-foreground">depuis la mesure précédente</span>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {latest.notes && (
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-sm text-white/80 leading-relaxed">{latest.notes}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <Link
                    href={`/progress/${client.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                    style={{ background: 'rgba(0,255,133,0.12)', border: '1.5px solid rgba(0,255,133,0.35)', color: '#00FF85' }}
                  >
                    Voir la progression complète
                  </Link>
                </div>
              </>
            )
          })()}

          {/* Untracked client sheet */}
          {selectedUntracked && (() => {
            const fullName = `${selectedUntracked.prenom} ${selectedUntracked.nom}`
            return (
              <>
                <div className="p-5 pb-4" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-3 pr-8">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#6A6A9A' }}
                    >
                      {selectedUntracked.prenom[0]}{selectedUntracked.nom[0]}
                    </div>
                    <div>
                      <SheetTitle className="text-white font-black text-base">{fullName}</SheetTitle>
                      <span className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#9090B8' }}
                      >
                        Sans mesures
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 p-4">
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <Activity size={20} style={{ color: '#3A3A6A' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/60">Aucune mesure enregistrée</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Commencez le suivi de ce client</p>
                    </div>
                  </div>
                </div>

                <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <Link
                    href={`/progress/${selectedUntracked.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                    style={{ background: 'rgba(0,255,133,0.12)', border: '1.5px solid rgba(0,255,133,0.35)', color: '#00FF85' }}
                  >
                    <Plus size={15} /> Ajouter une mesure
                  </Link>
                </div>
              </>
            )
          })()}

          <SheetDescription className="sr-only">Détails de la progression</SheetDescription>
        </SheetContent>
      </Sheet>
    </>
  )
}
