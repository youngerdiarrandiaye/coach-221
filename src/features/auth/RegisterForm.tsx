'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerAction } from './actions'
import { registerSchema, type RegisterFormData } from './schemas'

export function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null)
    const result = await registerAction(data)
    if (result?.error) setServerError(result.error)
  }

  const inputClass = 'h-11 rounded-2xl bg-accent border-border text-white placeholder:text-muted-foreground focus-visible:ring-primary'
  const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-2'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="prenom" className={labelClass}>Prénom</Label>
          <Input id="prenom" placeholder="Ousmane" disabled={isSubmitting} className={inputClass} {...register('prenom')} />
          {errors.prenom && <p className="text-xs text-destructive">{errors.prenom.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nom" className={labelClass}>Nom</Label>
          <Input id="nom" placeholder="Diallo" disabled={isSubmitting} className={inputClass} {...register('nom')} />
          {errors.nom && <p className="text-xs text-destructive">{errors.nom.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className={labelClass}>Adresse email</Label>
        <Input
          id="email"
          type="email"
          placeholder="coach@exemple.com"
          autoComplete="email"
          disabled={isSubmitting}
          className={inputClass}
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className={labelClass}>Mot de passe</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Min. 6 caractères"
            autoComplete="new-password"
            disabled={isSubmitting}
            className={`${inputClass} pr-10`}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm" className={labelClass}>Confirmer le mot de passe</Label>
        <Input
          id="confirm"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          disabled={isSubmitting}
          className={inputClass}
          {...register('confirm')}
        />
        {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 rounded-2xl bg-primary hover:bg-primary/90 text-black font-black mt-2"
      >
        {isSubmitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>
            <UserPlus size={18} />
            Créer mon compte
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Déjà un compte ?{' '}
        <Link href="/login" className="text-primary hover:text-primary/80 font-bold transition-colors">
          Se connecter
        </Link>
      </p>
    </form>
  )
}
