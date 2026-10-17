import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerUser } from '@/lib/session'
import { paymentDao } from '@/dao/paymentDao'
import { clientDao } from '@/dao/clientDao'
import { PaymentForm } from '@/features/payments/PaymentForm'

export const metadata: Metadata = { title: 'Modifier le paiement' }

interface Props {
  params: { id: string }
}

export default async function EditPaymentPage({ params }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [payment, clients] = await Promise.all([
    paymentDao.findById(params.id, user.id),
    clientDao.findAll(user.id),
  ])

  if (!payment) notFound()

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24 lg:pb-6">
      <h1 className="text-xl font-black text-white">Modifier le paiement</h1>
      <div className="tc-card p-5">
        <PaymentForm
          clients={clients.map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone }))}
          payment={payment}
        />
      </div>
    </div>
  )
}
