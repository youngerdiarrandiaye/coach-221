import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { PaymentForm } from '@/features/payments/PaymentForm'

export const metadata: Metadata = { title: 'Nouveau paiement' }

interface Props {
  searchParams: { client?: string }
}

export default async function NewPaymentPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const clients = await clientDao.findAll(user.id)

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24 lg:pb-6">
      <h1 className="text-xl font-black text-white">Nouveau paiement</h1>
      <div className="tc-card p-5">
        <PaymentForm
          clients={clients.map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone }))}
          preselectedClientId={searchParams.client}
        />
      </div>
    </div>
  )
}

