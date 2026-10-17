import type { Metadata } from 'next'
import { RegisterForm } from '@/features/auth/RegisterForm'

export const metadata: Metadata = {
  title: 'Créer un compte',
}

export default function RegisterPage() {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-xl font-black text-white">Créer un compte</h2>
        <p className="text-sm text-muted-foreground mt-1">Commencez gratuitement dès aujourd&apos;hui</p>
      </div>
      <RegisterForm />
    </>
  )
}
