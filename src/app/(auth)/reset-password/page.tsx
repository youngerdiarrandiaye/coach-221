import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Réinitialiser le mot de passe',
}

export default function ResetPasswordPage() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-black text-white">Mot de passe oublié</h2>
        <p className="text-sm text-muted-foreground mt-1">Réinitialisez votre accès en quelques secondes</p>
      </div>
      <ResetPasswordForm />
    </>
  )
}
