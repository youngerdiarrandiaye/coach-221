'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CheckCircle, Loader2, Mail } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPasswordAction } from './actions'
import { resetSchema, type ResetFormData } from './schemas'

export function ResetPasswordForm() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  })

  const onSubmit = async (data: ResetFormData) => {
    setServerError(null)
    const result = await resetPasswordAction(data)
    if (result?.error) setServerError(result.error)
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <div className="flex justify-center">
          <CheckCircle size={48} style={{ color: '#00FF85' }} />
        </div>
        <div>
          <p className="font-black text-white">Email envoyé !</p>
          <p className="text-sm text-muted-foreground mt-1">
            Vérifiez votre boîte mail à{' '}
            <span className="text-white font-semibold">{getValues('email')}</span>
          </p>
        </div>
        <Link href="/login">
          <Button variant="outline" className="w-full h-11 rounded-2xl border-border text-white">
            <ArrowLeft size={16} />
            Retour à la connexion
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <p className="text-sm text-muted-foreground">
        Entrez votre email. Vous recevrez un lien pour réinitialiser votre mot de passe.
      </p>

      {serverError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
          Adresse email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="coach@exemple.com"
          autoComplete="email"
          disabled={isSubmitting}
          className="h-11 rounded-2xl bg-accent border-border text-white placeholder:text-muted-foreground focus-visible:ring-primary"
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 rounded-2xl bg-primary hover:bg-primary/90 text-black font-black"
      >
        {isSubmitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>
            <Mail size={18} />
            Envoyer le lien
          </>
        )}
      </Button>

      <Link href="/login">
        <Button variant="ghost" className="w-full rounded-2xl text-muted-foreground hover:text-white">
          <ArrowLeft size={16} />
          Retour à la connexion
        </Button>
      </Link>
    </form>
  )
}
