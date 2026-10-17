'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Phone, Target, CalendarPlus, User } from 'lucide-react'
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { OBJECTIF_LABELS } from '@/config/constants'
import type { ClientRow } from '@/entities'

const PALETTES = [
  ['#00FF85','#00CFFF'],['#00CFFF','#7B6FFF'],['#FFD600','#FF6B35'],
  ['#FF3B5C','#FF6B35'],['#7B6FFF','#00CFFF'],['#00FF85','#FFD600'],
]
function avatarGrad(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [c1, c2] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
}

interface Props {
  clients: ClientRow[]
}

export function ClientsTable({ clients }: Props) {
  const [selected, setSelected] = useState<ClientRow | null>(null)
  const [open, setOpen] = useState(false)

  function openSheet(client: ClientRow) {
    setSelected(client)
    setOpen(true)
  }

  return (
    <>
      {/* Table */}
      <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#00FF85' }}>Client</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden sm:table-cell" style={{ color: '#9090B8' }}>Téléphone</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden md:table-cell" style={{ color: '#9090B8' }}>Objectif</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {clients.map((client, i) => {
              const fullName = `${client.prenom} ${client.nom}`
              const isEven = i % 2 === 0
              return (
                <tr
                  key={client.id}
                  onClick={() => openSheet(client)}
                  className="group cursor-pointer hover:bg-white/[0.04] transition-colors"
                  style={{
                    background: isEven ? 'rgba(255,255,255,0.015)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Nom + avatar */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-black"
                        style={{ background: avatarGrad(fullName) }}
                      >
                        {client.prenom[0]}{client.nom[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{fullName}</p>
                        <p className="text-[10px] text-muted-foreground sm:hidden">{client.telephone}</p>
                      </div>
                    </div>
                  </td>
                  {/* Téléphone */}
                  <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">
                    <p className="text-sm text-white/80">{client.telephone}</p>
                  </td>
                  {/* Objectif */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    {client.objectif ? (
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(123,111,255,0.14)', border: '1px solid rgba(123,111,255,0.30)', color: '#7B6FFF' }}
                      >
                        {OBJECTIF_LABELS[client.objectif] ?? client.objectif}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
          </tbody>
        </table>
      </div>

      {/* Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="overflow-y-auto p-0 flex flex-col"
          style={{ width: '100%', maxWidth: 420 }}
        >
          {selected && (
            <>
              {/* Header coloré */}
              <div className="p-6 pb-4" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-black"
                    style={{ background: avatarGrad(`${selected.prenom}${selected.nom}`) }}
                  >
                    {selected.prenom[0]}{selected.nom[0]}
                  </div>
                  <div>
                    <SheetTitle className="text-white text-lg font-black">
                      {selected.prenom} {selected.nom}
                    </SheetTitle>
                    {selected.objectif && (
                      <span
                        className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(123,111,255,0.14)', border: '1px solid rgba(123,111,255,0.30)', color: '#7B6FFF' }}
                      >
                        {OBJECTIF_LABELS[selected.objectif] ?? selected.objectif}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Infos */}
              <div className="flex-1 p-4 space-y-3">
                {/* Téléphone */}
                <div
                  className="flex items-center gap-3 rounded-2xl p-3.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'rgba(0,207,255,0.12)' }}>
                    <Phone size={14} style={{ color: '#00CFFF' }} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Téléphone</p>
                    <p className="text-sm font-bold text-white">{selected.telephone}</p>
                  </div>
                </div>

                {/* Objectif */}
                {selected.objectif && (
                  <div
                    className="flex items-center gap-3 rounded-2xl p-3.5"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'rgba(123,111,255,0.12)' }}>
                      <Target size={14} style={{ color: '#7B6FFF' }} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Objectif</p>
                      <p className="text-sm font-bold text-white">{OBJECTIF_LABELS[selected.objectif] ?? selected.objectif}</p>
                    </div>
                  </div>
                )}

                {/* Taille / Poids initial */}
                {(selected.taille_cm || selected.poids_initial_kg) && (
                  <div
                    className="flex items-center gap-3 rounded-2xl p-3.5"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: 'rgba(255,214,0,0.12)' }}>
                      <User size={14} style={{ color: '#FFD600' }} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Mensurations</p>
                      <p className="text-sm font-bold text-white">
                        {selected.taille_cm ? `${selected.taille_cm} cm` : ''}
                        {selected.taille_cm && selected.poids_initial_kg ? ' · ' : ''}
                        {selected.poids_initial_kg ? `${selected.poids_initial_kg} kg` : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <Link
                  href={`/sessions/new?clientId=${selected.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(0,255,133,0.14)', border: '1.5px solid rgba(0,255,133,0.35)', color: '#00FF85' }}
                >
                  <CalendarPlus size={15} /> Planifier une séance
                </Link>
                <Link
                  href={`/clients/${selected.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#9090B8' }}
                >
                  Voir le profil complet
                </Link>
              </div>
            </>
          )}
          <SheetDescription className="sr-only">Détails du client</SheetDescription>
        </SheetContent>
      </Sheet>
    </>
  )
}
