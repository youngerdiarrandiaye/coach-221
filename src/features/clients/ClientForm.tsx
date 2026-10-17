'use client'

import { useState } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2, Save, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { clientSchema, type ClientFormData } from './schemas'
import { createClientAction, updateClientAction } from './actions'
import { OBJECTIF_LABELS } from '@/config/constants'
import type { ClientRow } from '@/entities'

interface ClientFormProps {
  client?: ClientRow
}

export function ClientForm({ client }: ClientFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const isEdit = !!client

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema) as Resolver<ClientFormData>,
    defaultValues: client ? {
      nom:              client.nom,
      prenom:           client.prenom,
      telephone:        client.telephone,
      email:            client.email            ?? '',
      date_naissance:   client.date_naissance   ?? '',
      sexe:             client.sexe             ?? undefined,
      taille_cm:        client.taille_cm        != null ? String(client.taille_cm)        : '',
      poids_initial_kg: client.poids_initial_kg != null ? String(client.poids_initial_kg) : '',
      objectif:         client.objectif         ?? undefined,
    } : {},
  })

  const onSubmit = async (data: ClientFormData) => {
    setServerError(null)
    const tid = toast.loading(isEdit ? 'Mise à jour en cours…' : 'Création du client…')
    const result = isEdit
      ? await updateClientAction(client.id, data)
      : await createClientAction(data)

    if (result?.error) {
      toast.error(result.error, { id: tid })
      setServerError(result.error)
      return
    }
    toast.success(isEdit ? 'Client mis à jour !' : 'Client créé !', { id: tid })
    if (!isEdit && result?.id) router.push(`/clients/${result.id}`)
    else router.push(`/clients/${client!.id}`)
  }

  const field = 'h-11 rounded-2xl bg-card border-border text-white placeholder:text-muted-foreground focus-visible:ring-primary'
  const err = (msg?: string) => msg ? <p className="text-xs text-destructive mt-1">{msg}</p> : null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* Nom / Prénom */}
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

      {/* Téléphone / Email */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="telephone" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Téléphone <span className="text-destructive">*</span></Label>
          <Input id="telephone" type="tel" placeholder="77 123 45 67" className={field} {...register('telephone')} />
          {err(errors.telephone?.message)}
        </div>
        <div>
          <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Email</Label>
          <Input id="email" type="email" placeholder="optionnel" className={field} {...register('email')} />
          {err(errors.email?.message)}
        </div>
      </div>

      {/* Date naissance / Sexe */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="date_naissance" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Date de naissance</Label>
          <Input id="date_naissance" type="date" className={field} {...register('date_naissance')} />
          {err(errors.date_naissance?.message)}
        </div>
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Sexe</Label>
          <Controller
            name="sexe"
            control={control}
            render={({ field: f }) => (
              <Select onValueChange={f.onChange} defaultValue={f.value}>
                <SelectTrigger className={field}>
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOMME">Homme</SelectItem>
                  <SelectItem value="FEMME">Femme</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Taille / Poids */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="taille_cm" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Taille (cm)</Label>
          <Input id="taille_cm" type="number" placeholder="175" className={field} {...register('taille_cm')} />
          {err(errors.taille_cm?.message)}
        </div>
        <div>
          <Label htmlFor="poids_initial_kg" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Poids initial (kg)</Label>
          <Input id="poids_initial_kg" type="number" placeholder="70" className={field} {...register('poids_initial_kg')} />
          {err(errors.poids_initial_kg?.message)}
        </div>
      </div>

      {/* Objectif */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Objectif</Label>
        <Controller
          name="objectif"
          control={control}
          render={({ field: f }) => (
            <Select onValueChange={f.onChange} defaultValue={f.value}>
              <SelectTrigger className={field}>
                <SelectValue placeholder="Sélectionner un objectif…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OBJECTIF_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Link href={isEdit ? `/clients/${client.id}` : '/clients'} className="flex-1">
          <Button type="button" variant="outline" className="w-full h-11 border-border">
            <ArrowLeft size={16} /> Annuler
          </Button>
        </Link>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 h-11 rounded-2xl bg-primary hover:bg-primary/90 font-black text-black"
        >
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} /> {isEdit ? 'Enregistrer' : 'Créer le client'}</>}
        </Button>
      </div>
    </form>
  )
}
