'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  CalendarDays, User2, CreditCard, FileText,
  CheckCircle2, XCircle, Trash2, Loader2,
} from 'lucide-react'
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { METHODE_LABELS, STATUT_PAYMENT_LABELS } from '@/config/constants'
import { formatCFA } from '@/utils/format'
import { deletePaymentFromListAction } from './actions'
import type { PaymentWithClient } from '@/dao/paymentDao'

const STATUT_STYLES: Record<string, React.CSSProperties> = {
  PAYE:       { background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.40)', color: '#00FF85' },
  EN_ATTENTE: { background: 'rgba(255,214,0,0.12)',  border: '1px solid rgba(255,214,0,0.40)',  color: '#FFD600' },
  ANNULE:     { background: 'rgba(255,59,92,0.12)',  border: '1px solid rgba(255,59,92,0.40)',  color: '#FF3B5C' },
}
const METHODE_DOT: Record<string, string> = {
  WAVE: '#00CFFF', ORANGE_MONEY: '#FF8C00', ESPECES: '#00FF85',
  CHEQUE: '#7B6FFF', VIREMENT: '#FF6B35',
}

interface SortThProps {
  label: string; col: string; current: string; href: string
}
function SortTh({ label, col, current, href }: SortThProps) {
  const isAsc  = current === `${col}_asc`
  const isDesc = current === `${col}_desc` || (col === 'date' && (current === 'newest' || !current))
  const active = isAsc || isDesc
  return (
    <th className="px-4 py-3 text-left">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest transition-colors hover:opacity-80"
        style={{ color: active ? '#00FF85' : '#9090B8' }}
      >
        {label}
        {active ? (isDesc ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : <ArrowUpDown size={11} style={{ opacity: 0.4 }} />}
      </Link>
    </th>
  )
}

function buildHref(
  base: { q?: string; statut?: string; methode?: string; sort?: string; page?: string },
  override: Record<string, string>,
) {
  const params = new URLSearchParams()
  const merged = { ...base, ...override }
  if (merged.q)       params.set('q', merged.q)
  if (merged.statut)  params.set('statut', merged.statut)
  if (merged.methode) params.set('methode', merged.methode)
  if (merged.sort && merged.sort !== 'newest') params.set('sort', merged.sort)
  if (merged.page && merged.page !== '1')      params.set('page', merged.page)
  const qs = params.toString()
  return `/payments${qs ? `?${qs}` : ''}`
}

interface Props {
  payments: PaymentWithClient[]
  rawSort:  string
  q:        string
  statut:   string
  methode:  string
}

export function PaymentsTable({ payments, rawSort, q, statut, methode }: Props) {
  const filterHref = (override: Record<string, string>) =>
    buildHref({ q, statut, methode, sort: rawSort }, { ...override, page: '1' })
  const sortHref = (col: string) => {
    const nextSort = rawSort === `${col}_desc` ? `${col}_asc` : `${col}_desc`
    return filterHref({ sort: nextSort })
  }
  const router = useRouter()
  const [selected, setSelected] = useState<PaymentWithClient | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function openSheet(p: PaymentWithClient) {
    setSelected(p)
    setConfirmDelete(false)
    setOpen(true)
  }

  function handleDelete() {
    if (!selected) return
    startTransition(async () => {
      await deletePaymentFromListAction(selected.id)
      setOpen(false)
      setSelected(null)
      router.refresh()
    })
  }

  return (
    <>
      {/* Table */}
      <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <SortTh label="Date"    col="date"   current={rawSort} href={sortHref('date')} />
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Client</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden sm:table-cell" style={{ color: '#9090B8' }}>Méthode</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest hidden md:table-cell" style={{ color: '#9090B8' }}>Description</th>
              <SortTh label="Montant" col="amount" current={rawSort} href={sortHref('amount')} />
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest" style={{ color: '#9090B8' }}>Statut</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => {
              const date = new Date(p.date_paiement)
              const isEven = i % 2 === 0
              return (
                <tr
                  key={p.id}
                  onClick={() => openSheet(p)}
                  className="group cursor-pointer hover:bg-white/[0.04] transition-colors"
                  style={{
                    background: isEven ? 'rgba(255,255,255,0.015)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Date */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm font-bold text-white">
                      {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{date.getFullYear()}</p>
                  </td>
                  {/* Client */}
                  <td className="px-4 py-3">
                    <p className="text-sm font-bold text-white whitespace-nowrap">{p.clients.prenom} {p.clients.nom}</p>
                  </td>
                  {/* Méthode */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: METHODE_DOT[p.methode] ?? '#9090B8' }} />
                      <span className="text-xs font-semibold" style={{ color: METHODE_DOT[p.methode] ?? '#9090B8' }}>
                        {METHODE_LABELS[p.methode] ?? p.methode}
                      </span>
                    </span>
                  </td>
                  {/* Description */}
                  <td className="px-4 py-3 max-w-[160px] hidden md:table-cell">
                    <p className="text-xs text-muted-foreground truncate">{p.description || '—'}</p>
                  </td>
                  {/* Montant */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm font-black text-white">{formatCFA(p.montant)}</p>
                  </td>
                  {/* Statut */}
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap" style={STATUT_STYLES[p.statut]}>
                      {STATUT_PAYMENT_LABELS[p.statut]}
                    </span>
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
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmDelete(false) }}>
        <SheetContent className="overflow-y-auto p-0 flex flex-col" style={{ width: '100%', maxWidth: 440 }}>
          {selected && (() => {
            const date = new Date(selected.date_paiement)
            return (
              <>
                {/* Header */}
                <div className="p-5 pb-4" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div>
                      <SheetTitle className="text-white font-black text-2xl">{formatCFA(selected.montant)}</SheetTitle>
                      <p className="text-xs mt-0.5" style={{ color: '#9090B8' }}>
                        {selected.clients.prenom} {selected.clients.nom} · {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold" style={STATUT_STYLES[selected.statut]}>
                      {STATUT_PAYMENT_LABELS[selected.statut]}
                    </span>
                  </div>
                </div>

                {/* Détails */}
                <div className="flex-1 p-4 space-y-2.5">
                  {/* Date */}
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays size={12} style={{ color: '#00CFFF' }} />
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Date</span>
                    </div>
                    <p className="text-sm font-bold text-white">
                      {date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>

                  {/* Client */}
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <User2 size={12} style={{ color: '#7B6FFF' }} />
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Client</span>
                    </div>
                    <p className="text-sm font-bold text-white">{selected.clients.prenom} {selected.clients.nom}</p>
                  </div>

                  {/* Méthode */}
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard size={12} style={{ color: METHODE_DOT[selected.methode] ?? '#9090B8' }} />
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Méthode</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: METHODE_DOT[selected.methode] ?? '#9090B8' }} />
                      <span className="text-sm font-bold" style={{ color: METHODE_DOT[selected.methode] ?? 'white' }}>
                        {METHODE_LABELS[selected.methode] ?? selected.methode}
                      </span>
                    </span>
                  </div>

                  {/* Description */}
                  {selected.description && (
                    <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={12} style={{ color: '#9090B8' }} />
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Description</span>
                      </div>
                      <p className="text-sm text-white/80">{selected.description}</p>
                    </div>
                  )}

                  {/* Marquer comme payé */}
                  {selected.statut === 'EN_ATTENTE' && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-1">Actions rapides</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          href={`/payments/${selected.id}?action=pay`}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02]"
                          style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.35)', color: '#00FF85' }}
                        >
                          <CheckCircle2 size={13} /> Marquer payé
                        </Link>
                        <Link
                          href={`/payments/${selected.id}?action=cancel`}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02]"
                          style={{ background: 'rgba(255,59,92,0.10)', border: '1px solid rgba(255,59,92,0.30)', color: '#FF3B5C' }}
                        >
                          <XCircle size={13} /> Annuler
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  {!confirmDelete ? (
                    <>
                      <Link
                        href={`/payments/${selected.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-all hover:scale-[1.02]"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#9090B8' }}
                      >
                        Voir le paiement complet
                      </Link>
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 text-xs font-bold transition-all hover:scale-[1.02]"
                        style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.22)', color: '#FF3B5C' }}
                      >
                        <Trash2 size={13} /> Supprimer
                      </button>
                    </>
                  ) : (
                    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.25)' }}>
                      <p className="text-sm font-bold text-white">Supprimer ce paiement ?</p>
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
          <SheetDescription className="sr-only">Détails du paiement</SheetDescription>
        </SheetContent>
      </Sheet>
    </>
  )
}
