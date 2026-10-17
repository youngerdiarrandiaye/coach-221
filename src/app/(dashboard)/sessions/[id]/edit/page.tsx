import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getServerUser } from '@/lib/session'
import { sessionDao } from '@/dao/sessionDao'
import { clientDao } from '@/dao/clientDao'
import { SessionForm } from '@/features/sessions/SessionForm'

export const metadata: Metadata = { title: 'Modifier la séance' }

interface Props {
  params: { id: string }
}

export default async function EditSessionPage({ params }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [session, clients] = await Promise.all([
    sessionDao.findById(params.id, user.id),
    clientDao.findAll(user.id),
  ])

  if (!session) notFound()

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-24 lg:pb-6">
      <h1 className="text-xl font-black text-white">Modifier la séance</h1>
      <div className="tc-card p-5">
        <SessionForm
          clients={clients.map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone }))}
          session={session}
        />
      </div>
    </div>
  )
}
