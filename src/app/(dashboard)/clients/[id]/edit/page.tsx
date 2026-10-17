import { redirect, notFound } from 'next/navigation'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { ClientForm } from '@/features/clients/ClientForm'

export const metadata = { title: 'Modifier le client' }

interface Props { params: { id: string } }

export default async function EditClientPage({ params }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const client = await clientDao.findById(params.id, user.id)
  if (!client) notFound()

  return (
    <div className="mx-auto max-w-lg pb-24 lg:pb-6">
      <h1 className="mb-5 text-xl font-black text-white">
        Modifier — {client.prenom} {client.nom}
      </h1>
      <div className="tc-card p-5">
        <ClientForm client={client} />
      </div>
    </div>
  )
}
