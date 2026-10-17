'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { profileSchema, type ProfileFormData } from './schemas'
import { updateProfileAction } from './actions'
import type { ProfileRow } from '@/entities'

interface Props {
  profile: ProfileRow
}

export function ProfileForm({ profile }: Props) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nom:         profile.nom,
      prenom:      profile.prenom,
      telephone:   profile.telephone   ?? '',
      specialite:  profile.specialite  ?? '',
      zone:        profile.zone        ?? '',
      description: profile.description ?? '',
    },
  })

  const onSubmit = async (data: ProfileFormData) => {
    setServerError(null)
    setSaved(false)
    const result = await updateProfileAction(data)
    if (result.error) { setServerError(result.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const field = 'h-11 rounded-xl bg-card border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-primary'
  const err = (msg?: string) => msg ? <p className="text-xs text-destructive mt-1">{msg}</p> : null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: 'rgba(0,255,133,0.08)', border: '1px solid rgba(0,255,133,0.28)', color: '#00FF85' }}>
          <CheckCircle2 size={15} /> Profil mis à jour
        </div>
      )}

      {/* Prénom / Nom */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="prenom" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Prénom <span className="text-destructive">*</span></Label>
          <Input id="prenom" placeholder="Ousmane" className={field} {...register('prenom')} />
          {err(errors.prenom?.message)}
        </div>
        <div>
          <Label htmlFor="nom" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Nom <span className="text-destructive">*</span></Label>
          <Input id="nom" placeholder="Diallo" className={field} {...register('nom')} />
          {err(errors.nom?.message)}
        </div>
      </div>

      {/* Téléphone */}
      <div>
        <Label htmlFor="telephone" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Téléphone</Label>
        <Input id="telephone" type="tel" placeholder="77 123 45 67" className={field} {...register('telephone')} />
      </div>

      {/* Spécialité */}
      <div>
        <Label htmlFor="specialite" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Spécialité</Label>
        <Input id="specialite" placeholder="ex: Musculation, Cardio…" className={field} {...register('specialite')} />
      </div>

      {/* Zone */}
      <div>
        <Label htmlFor="zone" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Zone d&apos;activité</Label>
        <Input id="zone" placeholder="ex: Dakar, Thiès…" className={field} {...register('zone')} />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">À propos</Label>
        <textarea
          id="description"
          rows={4}
          placeholder="Présentez-vous en quelques mots…"
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
          {...register('description')}
        />
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || !isDirty}
        className="w-full h-11 bg-primary hover:bg-primary/90 font-bold text-black"
      >
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} /> Enregistrer</>}
      </Button>
    </form>
  )
}
