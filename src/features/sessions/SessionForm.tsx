'use client'

import { useState } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2, Save, ArrowLeft, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ClientCombobox } from '@/components/ui/ClientCombobox'
import { sessionSchema, type SessionFormData } from './schemas'
import { createSessionAction, updateSessionAction } from './actions'
import { RecurrenceForm } from './RecurrenceForm'
import type { SessionWithClient } from '@/dao/sessionDao'

interface ClientOption {
  id:        string
  nom:       string
  prenom:    string
  telephone: string
}

interface SessionFormProps {
  clients: ClientOption[]
  session?: SessionWithClient
  preselectedClientId?: string
}

function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16)
}

const DUREE_OPTIONS = [
  { value: '30',  label: '30 minutes' },
  { value: '45',  label: '45 minutes' },
  { value: '60',  label: '1 heure' },
  { value: '90',  label: '1h30' },
  { value: '120', label: '2 heures' },
]

export function SessionForm({ clients, session, preselectedClientId }: SessionFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [mode, setMode] = useState<'unique' | 'recurrente'>('unique')
  const isEdit = !!session

  const defaultDuree = session
    ? String(session.duree_minutes)
    : '60'

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SessionFormData>({
    resolver: zodResolver(sessionSchema) as Resolver<SessionFormData>,
    defaultValues: session ? {
      client_id:     session.client_id,
      titre:         session.titre,
      description:   session.description ?? '',
      date_heure:    toDatetimeLocal(session.date_heure),
      duree_minutes: String(session.duree_minutes),
      notes:         session.notes ?? '',
    } : {
      client_id:     preselectedClientId ?? '',
      titre:         '',
      description:   '',
      date_heure:    '',
      duree_minutes: '60',
      notes:         '',
    },
  })

  const onSubmit = async (data: SessionFormData) => {
    setServerError(null)
    const tid = toast.loading(isEdit ? 'Mise à jour en cours…' : 'Planification en cours…')
    const result = isEdit
      ? await updateSessionAction(session.id, data)
      : await createSessionAction(data)

    if (result?.error) {
      toast.error(result.error, { id: tid })
      setServerError(result.error)
      return
    }
    toast.success(isEdit ? 'Séance mise à jour !' : 'Séance planifiée !', { id: tid })
    if (!isEdit && result?.id) router.push(`/sessions/${result.id}`)
    else router.push(`/sessions/${session!.id}`)
  }

  const field = 'h-11 rounded-2xl bg-card border-border text-white placeholder:text-muted-foreground focus-visible:ring-primary'
  const err = (msg?: string) => msg ? <p className="text-xs text-destructive mt-1">{msg}</p> : null

  return (
    <>
      {/* Mode toggle — visible uniquement en création */}
      {!isEdit && (
        <div
          className="flex gap-1 rounded-2xl p-1 mb-5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            type="button"
            onClick={() => setMode('unique')}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-all duration-200"
            style={mode === 'unique'
              ? { background: '#00FF85', color: '#000' }
              : { color: '#9090B8' }
            }
          >
            <Save size={13} />
            Séance unique
          </button>
          <button
            type="button"
            onClick={() => setMode('recurrente')}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-all duration-200"
            style={mode === 'recurrente'
              ? { background: 'rgba(123,111,255,0.22)', border: '1.5px solid rgba(123,111,255,0.45)', color: '#7B6FFF' }
              : { color: '#9090B8' }
            }
          >
            <RotateCcw size={13} />
            Récurrente
          </button>
        </div>
      )}

      {/* Formulaire séance récurrente */}
      {mode === 'recurrente' && !isEdit && (
        <RecurrenceForm clients={clients} preselectedClientId={preselectedClientId} />
      )}

      {/* Formulaire séance unique */}
      {(mode === 'unique' || isEdit) && (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* Client */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Client <span className="text-destructive">*</span></Label>
        <Controller
          name="client_id"
          control={control}
          render={({ field: f }) => (
            <ClientCombobox
              clients={clients}
              value={f.value}
              onChange={f.onChange}
              hasError={!!errors.client_id}
            />
          )}
        />
        {err(errors.client_id?.message)}
      </div>

      {/* Titre */}
      <div>
        <Label htmlFor="titre" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Titre <span className="text-destructive">*</span></Label>
        <Input id="titre" placeholder="ex: Séance cardio" className={field} {...register('titre')} />
        {err(errors.titre?.message)}
      </div>

      {/* Date/Heure + Durée */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="date_heure" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Date et heure <span className="text-destructive">*</span></Label>
          <Input id="date_heure" type="datetime-local" className={`${field} [color-scheme:dark]`} {...register('date_heure')} />
          {err(errors.date_heure?.message)}
        </div>
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Durée <span className="text-destructive">*</span></Label>
          <Controller
            name="duree_minutes"
            control={control}
            render={({ field: f }) => (
              <Select onValueChange={f.onChange} defaultValue={defaultDuree}>
                <SelectTrigger className={field}>
                  <SelectValue placeholder="Durée…" />
                </SelectTrigger>
                <SelectContent>
                  {DUREE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {err(errors.duree_minutes?.message)}
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Description</Label>
        <textarea
          id="description"
          rows={3}
          placeholder="Objectifs de la séance…"
          className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
          {...register('description')}
        />
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Notes post-séance</Label>
        <textarea
          id="notes"
          rows={3}
          placeholder="Observations après la séance…"
          className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
          {...register('notes')}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Link href={isEdit ? `/sessions/${session.id}` : '/sessions'} className="flex-1">
          <Button type="button" variant="outline" className="w-full h-11 border-border">
            <ArrowLeft size={16} /> Annuler
          </Button>
        </Link>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 h-11 rounded-2xl bg-primary hover:bg-primary/90 font-black text-black"
        >
          {isSubmitting
            ? <Loader2 size={18} className="animate-spin" />
            : <><Save size={16} /> {isEdit ? 'Enregistrer' : 'Planifier'}</>
          }
        </Button>
      </div>
    </form>
      )}
    </>
  )
}
