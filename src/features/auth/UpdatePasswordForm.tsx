'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePasswordSchema, type UpdatePasswordFormData } from './schemas'
import { updatePasswordAction } from './actions'

export function UpdatePasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<UpdatePasswordFormData>({
    resolver: zodResolver(updatePasswordSchema),
  })

  if (saved) return (
    <div className="space-y-5" role="status">
      <p className="text-primary">Votre mot de passe a été modifié.</p>
      <Link href="/dashboard" className="block font-semibold underline">Accéder à mon espace</Link>
    </div>
  )

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit(async data => {
      setError(null)
      try {
        const result = await updatePasswordAction(data)
        if (result?.error) setError(result.error)
        else setSaved(true)
      } catch {
        setError('Connexion interrompue. Veuillez réessayer.')
      }
    })}>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input id="password" type="password" autoComplete="new-password" disabled={isSubmitting}
          aria-invalid={Boolean(errors.password)} aria-describedby="password-help" {...register('password')} />
        <p id="password-help" className="text-sm text-muted-foreground">{errors.password?.message ?? 'Au moins 8 caractères.'}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmer le mot de passe</Label>
        <Input id="confirm" type="password" autoComplete="new-password" disabled={isSubmitting}
          aria-invalid={Boolean(errors.confirm)} aria-describedby={errors.confirm ? 'confirm-error' : undefined} {...register('confirm')} />
        {errors.confirm && <p id="confirm-error" className="text-sm text-destructive">{errors.confirm.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
      </Button>
      <Link href="/reset-password" className="block text-sm text-muted-foreground underline">Demander un nouveau lien</Link>
    </form>
  )
}
