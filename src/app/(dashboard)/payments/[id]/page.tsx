import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Pencil, ArrowLeft, User, Calendar, CreditCard } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { paymentDao } from '@/dao/paymentDao'
import { clientDao } from '@/dao/clientDao'
import { profileDao } from '@/dao/profileDao'
import { DeletePaymentButton } from '@/features/payments/DeletePaymentButton'
import { ExportReceiptButton } from '@/features/payments/ExportReceiptButton'
import { formatCFA } from '@/utils/format'
import { METHODE_LABELS, STATUT_PAYMENT_LABELS } from '@/config/constants'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Paiement' }
}

interface Props {
  params: { id: string }
}

const STATUT_STYLES: Record<string, React.CSSProperties> = {
  PAYE:       { background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.40)',  color: '#00FF85' },
  EN_ATTENTE: { background: 'rgba(255,214,0,0.12)',  border: '1px solid rgba(255,214,0,0.40)',  color: '#FFD600' },
  ANNULE:     { background: 'rgba(255,59,92,0.12)',  border: '1px solid rgba(255,59,92,0.40)',  color: '#FF3B5C' },
}

function InfoRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 sm:w-28 shrink-0 text-xs text-muted-foreground pt-0.5 flex items-center gap-1.5">
        {icon}{label}
      </span>
      <span className="text-sm text-white">{children}</span>
    </div>
  )
}

export default async function PaymentDetailPage({ params }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const payment = await paymentDao.findById(params.id, user.id)
  if (!payment) notFound()

  const [clientData, coach] = await Promise.all([
    clientDao.findById(payment.client_id, user.id),
    profileDao.findById(user.id),
  ])

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/payments"
          className="flex h-10 w-10 items-center justify-center rounded-2xl transition-all hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <ArrowLeft size={16} style={{ color: '#9090B8' }} />
        </Link>
        <h1 className="flex-1 truncate text-xl font-black text-white">{formatCFA(payment.montant)}</h1>
        <Link
          href={`/payments/${payment.id}/edit`}
          className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold transition-all hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#9090B8' }}
        >
          <Pencil size={14} /> Modifier
        </Link>
      </div>

      {/* Statut */}
      <div className="tc-card p-4 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Statut</span>
        <span
          className="rounded-full px-3 py-0.5 text-xs font-bold"
          style={STATUT_STYLES[payment.statut]}
        >
          {STATUT_PAYMENT_LABELS[payment.statut]}
        </span>
      </div>

      {/* Informations */}
      <div className="tc-card p-4 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Informations</h2>

        <InfoRow label="Client" icon={<User size={12} style={{ color: '#00FF85' }} />}>
          <Link
            href={`/clients/${payment.client_id}`}
            className="flex items-center gap-1.5 font-semibold transition-colors hover:underline"
            style={{ color: '#00FF85' }}
          >
            {payment.clients.prenom} {payment.clients.nom}
          </Link>
        </InfoRow>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

        <InfoRow label="Montant" icon={<CreditCard size={12} style={{ color: '#7B6FFF' }} />}>
          <span className="font-black text-white">{formatCFA(payment.montant)}</span>
        </InfoRow>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

        <InfoRow label="Méthode" icon={<CreditCard size={12} style={{ color: '#00CFFF' }} />}>
          {METHODE_LABELS[payment.methode]}
        </InfoRow>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

        <InfoRow label="Date" icon={<Calendar size={12} style={{ color: '#FFD600' }} />}>
          {new Date(payment.date_paiement).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
        </InfoRow>

        {payment.description && (
          <>
            <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <InfoRow label="Description">
              <span className="text-white/80">{payment.description}</span>
            </InfoRow>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        {clientData && coach ? (
          <ExportReceiptButton payment={payment} client={clientData} coach={coach} />
        ) : <span />}
        <DeletePaymentButton paymentId={payment.id} />
      </div>
    </div>
  )
}
