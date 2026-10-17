'use client'

import { useMemo, useState } from 'react'
import { useForm, Controller, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ClientCombobox } from '@/components/ui/ClientCombobox'
import { recurrenceSchema, type RecurrenceFormData } from './schemas'
import { createRecurrenceAction } from './recurrenceActions'

interface Props {
  clients: { id: string; nom: string; prenom: string; telephone: string }[]
  preselectedClientId?: string
}

const DUREE_OPTIONS = [
  { value: '30',  label: '30 min' },
  { value: '45',  label: '45 min' },
  { value: '60',  label: '1 heure' },
  { value: '90',  label: '1h30' },
  { value: '120', label: '2 heures' },
]

const JOURS_CONFIG = [
  { label: 'L',  full: 'Lundi',    value: 1 },
  { label: 'M',  full: 'Mardi',    value: 2 },
  { label: 'Me', full: 'Mercredi', value: 3 },
  { label: 'J',  full: 'Jeudi',    value: 4 },
  { label: 'V',  full: 'Vendredi', value: 5 },
  { label: 'S',  full: 'Samedi',   value: 6 },
  { label: 'D',  full: 'Dimanche', value: 0 },
]

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

function countSessions(jours: number[], dateDebut: string, dateFin: string): number {
  if (!dateDebut || !dateFin || jours.length === 0) return 0
  const start = new Date(dateDebut + 'T00:00:00')
  const end   = new Date(dateFin   + 'T23:59:59')
  const now   = new Date()
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    if (jours.includes(cur.getDay())) {
      const d = new Date(cur)
      d.setHours(12, 0, 0, 0)
      if (d > now) count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function RecurrenceForm({ clients, preselectedClientId }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const todayStr = new Date().toISOString().slice(0, 10)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RecurrenceFormData>({
    resolver: zodResolver(recurrenceSchema) as Resolver<RecurrenceFormData>,
    defaultValues: {
      client_id:     preselectedClientId ?? '',
      titre:         '',
      description:   '',
      duree_minutes: '60',
      heure:         '09:00',
      jours:         [],
      date_debut:    todayStr,
      date_fin:      addWeeks(todayStr, 16),
    },
  })

  const joursRaw   = watch('jours')
  const dateDebut  = watch('date_debut') ?? ''
  const dateFin    = watch('date_fin')   ?? ''
  const joursValue = useMemo(() => joursRaw ?? [], [joursRaw])

  const sessionCount = useMemo(
    () => countSessions(joursValue, dateDebut, dateFin || addWeeks(dateDebut, 16)),
    [joursValue, dateDebut, dateFin],
  )

  const toggleJour = (val: number) => {
    const next = joursValue.includes(val)
      ? joursValue.filter((j) => j !== val)
      : [...joursValue, val]
    setValue('jours', next, { shouldValidate: true, shouldDirty: true })
  }

  const onSubmit = async (data: RecurrenceFormData) => {
    setServerError(null)
    const tid = toast.loading('Création des séances récurrentes…')
    const result = await createRecurrenceAction(data)
    if (result?.error) {
      toast.error(result.error, { id: tid })
      setServerError(result.error)
      return
    }
    toast.success(`Récurrence créée — ${sessionCount} séances planifiées !`, { id: tid })
    router.push('/sessions/recurrences')
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

      {/* Client */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
          Client <span className="text-destructive">*</span>
        </Label>
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
        <Label htmlFor="r-titre" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
          Titre <span className="text-destructive">*</span>
        </Label>
        <Input id="r-titre" placeholder="ex: Séance cardio" className={field} {...register('titre')} />
        {err(errors.titre?.message)}
      </div>

      {/* Durée */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
          Durée <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="duree_minutes"
          control={control}
          render={({ field: f }) => (
            <Select onValueChange={f.onChange} defaultValue={f.value}>
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

      {/* Jours de la semaine */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
          Jours <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-1.5">
          {JOURS_CONFIG.map((j) => {
            const active = joursValue.includes(j.value)
            return (
              <button
                key={j.value}
                type="button"
                title={j.full}
                onClick={() => toggleJour(j.value)}
                className="flex h-10 flex-1 items-center justify-center rounded-xl text-xs font-black transition-all duration-150 hover:scale-105"
                style={active
                  ? { background: 'rgba(123,111,255,0.22)', border: '1.5px solid rgba(123,111,255,0.55)', color: '#7B6FFF' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#9090B8' }
                }
              >
                {j.label}
              </button>
            )
          })}
        </div>
        {joursValue.length > 0 && (
          <p className="mt-1.5 text-[11px]" style={{ color: '#7B6FFF' }}>
            {joursValue
              .slice()
              .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
              .map((v) => JOURS_CONFIG.find((j) => j.value === v)?.full)
              .join(' · ')}
          </p>
        )}
        {err((errors.jours as { message?: string } | undefined)?.message)}
      </div>

      {/* Heure */}
      <div>
        <Label htmlFor="r-heure" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
          Heure <span className="text-destructive">*</span>
        </Label>
        <Input
          id="r-heure"
          type="time"
          className={`${field} [color-scheme:dark]`}
          {...register('heure')}
        />
        {err(errors.heure?.message)}
      </div>

      {/* Plage de dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="r-debut" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
            Début <span className="text-destructive">*</span>
          </Label>
          <Input
            id="r-debut"
            type="date"
            className={`${field} [color-scheme:dark]`}
            {...register('date_debut')}
          />
          {err(errors.date_debut?.message)}
        </div>
        <div>
          <Label htmlFor="r-fin" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
            Fin <span className="text-[10px] normal-case font-normal" style={{ color: '#9090B8' }}>(optionnel)</span>
          </Label>
          <Input
            id="r-fin"
            type="date"
            className={`${field} [color-scheme:dark]`}
            {...register('date_fin')}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="r-desc" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">
          Description
        </Label>
        <textarea
          id="r-desc"
          rows={2}
          placeholder="Objectifs de la séance récurrente…"
          className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm text-white placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
          {...register('description')}
        />
      </div>

      {/* Aperçu */}
      {sessionCount > 0 && (
        <div
          className="flex items-center gap-2.5 rounded-2xl px-4 py-3"
          style={{ background: 'rgba(123,111,255,0.08)', border: '1px solid rgba(123,111,255,0.22)' }}
        >
          <CalendarRange size={15} style={{ color: '#7B6FFF', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: '#7B6FFF' }}>
            <span className="font-black">{sessionCount}</span> séance{sessionCount !== 1 ? 's' : ''} seront créées
            {!dateFin && ' (16 prochaines semaines)'}
          </p>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 rounded-2xl font-black text-white border-0"
        style={{ background: 'linear-gradient(135deg,#7B6FFF 0%,#9D94FF 100%)', boxShadow: '0 0 20px rgba(123,111,255,0.28)' }}
      >
        {isSubmitting
          ? <Loader2 size={18} className="animate-spin" />
          : <><RotateCcw size={16} className="mr-1.5" /> Créer la récurrence</>
        }
      </Button>
    </form>
  )
}
