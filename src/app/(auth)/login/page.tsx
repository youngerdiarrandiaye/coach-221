import type { Metadata } from 'next'
import { LoginForm } from '@/features/auth/LoginForm'

export const metadata: Metadata = {
  title: 'Connexion',
}

export default function LoginPage() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-black text-white">Connexion</h2>
        <p className="text-sm text-muted-foreground mt-1">Accédez à votre tableau de bord</p>
      </div>
      <LoginForm />
    </>
  )
}
