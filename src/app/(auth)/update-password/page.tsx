import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/session'
import { UpdatePasswordForm } from '@/features/auth/UpdatePasswordForm'

export const metadata: Metadata = { title: 'Nouveau mot de passe' }

export default async function UpdatePasswordPage() {
  const user = await getServerUser()
  if (!user) redirect('/reset-password')
  return <>
    <div className="mb-6">
      <h2 className="text-xl font-black text-white">Choisir un nouveau mot de passe</h2>
      <p className="mt-1 text-sm text-muted-foreground">Protégez votre espace avec un mot de passe unique.</p>
    </div>
    <UpdatePasswordForm />
  </>
}
