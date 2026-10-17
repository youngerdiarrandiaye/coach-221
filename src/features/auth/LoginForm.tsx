'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginAction } from './actions'
import { loginSchema, type LoginFormData } from './schemas'

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)
    const result = await loginAction(data)
    if (result?.error) setServerError(result.error)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mot de passe
          </Label>
          <Link
            href="/reset-password"
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Mot de passe oublié ?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={isSubmitting}
            className="h-11 rounded-2xl bg-accent border-border text-white placeholder:text-muted-foreground focus-visible:ring-primary pr-10"
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
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
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
            <LogIn size={18} />
            Se connecter
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/register" className="text-primary hover:text-primary/80 font-bold transition-colors">
          Créer un compte
        </Link>
      </p>
    </form>
  )
}
