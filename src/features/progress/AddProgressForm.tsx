'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, ChevronDown, ChevronUp, Ruler, Droplets } from 'lucide-react'
import { HeartBeat } from '@/components/ui/HeartBeat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { progressSchema, type ProgressFormData } from './schemas'
import { createProgressAction } from './actions'

interface Props {
  clientId: string
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

const fieldCls = 'h-10 rounded-2xl bg-card border-border text-white placeholder:text-muted-foreground focus-visible:ring-primary'
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block'

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-destructive mt-1">{msg}</p>
}

export function AddProgressForm({ clientId }: Props) {
  const [open, setOpen]               = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess]         = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProgressFormData>({
    resolver: zodResolver(progressSchema),
    defaultValues: { poids_kg: '', notes: '', mesure_date: todayISO() },
  })

  const onSubmit = async (data: ProgressFormData) => {
    setServerError(null)
    const result = await createProgressAction(clientId, data)
    if (result.error) { setServerError(result.error); return }
    reset({ poids_kg: '', notes: '', mesure_date: todayISO() })
    setSuccess(true)
    setTimeout(() => { setSuccess(false); setOpen(false) }, 1500)
  }

  return (
    <div className="tc-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-sm font-bold text-white hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Plus size={15} className="text-primary" />
          Ajouter une mesure mensuelle
        </span>
        {open
          ? <ChevronUp size={15} className="text-muted-foreground" />
          : <ChevronDown size={15} className="text-muted-foreground" />}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="border-t border-border px-4 pb-4 pt-3 space-y-5"
          noValidate
        >
          {serverError && (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {serverError}
            </p>
          )}
          {success && (
            <p className="rounded-2xl border px-3 py-2 text-xs font-bold"
               style={{ background: 'rgba(0,255,133,0.10)', borderColor: 'rgba(0,255,133,0.30)', color: '#00FF85' }}>
              Mesure enregistrée ✓
            </p>
          )}

          {/* ── Essentiels ──────────────────────────────────── */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="poids_kg" className={labelCls}>Poids (kg) *</Label>
                <Input id="poids_kg" type="number" step="0.1" min="1" placeholder="70.5"
                       className={fieldCls} {...register('poids_kg')} />
                <FieldErr msg={errors.poids_kg?.message} />
              </div>
              <div>
                <Label htmlFor="mesure_date" className={labelCls}>Date *</Label>
                <Input id="mesure_date" type="date"
                       className={`${fieldCls} [color-scheme:dark]`} {...register('mesure_date')} />
                <FieldErr msg={errors.mesure_date?.message} />
              </div>
            </div>
            <div>
              <Label htmlFor="notes" className={labelCls}>Notes</Label>
              <Input id="notes" placeholder="Observations…" className={fieldCls} {...register('notes')} />
            </div>
          </div>

          {/* ── Cardio ──────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Titre section avec cœurs animés */}
            <div
              className="flex items-center gap-2 rounded-2xl px-3 py-2"
              style={{ background: 'rgba(255,59,92,0.07)', border: '1px solid rgba(255,59,92,0.18)' }}
            >
              <HeartBeat mode="repos" size={18} />
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#FF3B5C' }}>
                Cardio
              </span>
              <HeartBeat mode="effort" size={18} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* FC Repos */}
              <div>
                <label htmlFor="fc_repos" className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <HeartBeat mode="repos" size={13} />
                    FC Repos (bpm)
                  </span>
                </label>
                <Input id="fc_repos" type="number" step="1" min="20" placeholder="60"
                       className={fieldCls} {...register('frequence_cardiaque_repos_bpm')} />
                <FieldErr msg={errors.frequence_cardiaque_repos_bpm?.message} />
              </div>

              {/* FC Effort */}
              <div>
                <label htmlFor="fc_effort" className={labelCls}>
                  <span className="flex items-center gap-1.5">
                    <HeartBeat mode="effort" size={13} />
                    FC Effort (bpm)
                  </span>
                </label>
                <Input id="fc_effort" type="number" step="1" min="40" placeholder="150"
                       className={fieldCls} {...register('frequence_cardiaque_effort_bpm')} />
                <FieldErr msg={errors.frequence_cardiaque_effort_bpm?.message} />
              </div>
            </div>
          </div>

          {/* ── Mensurations ────────────────────────────────── */}
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest"
               style={{ color: '#00CFFF' }}>
              <Ruler size={12} /> Mensurations (cm)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tour_taille" className={labelCls}>Tour de taille</Label>
                <Input id="tour_taille" type="number" step="0.1" placeholder="80.0"
                       className={fieldCls} {...register('tour_taille_cm')} />
                <FieldErr msg={errors.tour_taille_cm?.message} />
              </div>
              <div>
                <Label htmlFor="hanches" className={labelCls}>Hanches</Label>
                <Input id="hanches" type="number" step="0.1" placeholder="95.0"
                       className={fieldCls} {...register('hanches_cm')} />
                <FieldErr msg={errors.hanches_cm?.message} />
              </div>
              <div>
                <Label htmlFor="bras" className={labelCls}>Bras</Label>
                <Input id="bras" type="number" step="0.1" placeholder="35.0"
                       className={fieldCls} {...register('bras_cm')} />
                <FieldErr msg={errors.bras_cm?.message} />
              </div>
              <div>
                <Label htmlFor="cuisse" className={labelCls}>Cuisse</Label>
                <Input id="cuisse" type="number" step="0.1" placeholder="55.0"
                       className={fieldCls} {...register('cuisse_cm')} />
                <FieldErr msg={errors.cuisse_cm?.message} />
              </div>
            </div>
          </div>

          {/* ── Composition corporelle ───────────────────────── */}
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest"
               style={{ color: '#7B6FFF' }}>
              <Droplets size={12} /> Composition
            </p>
            <div className="w-1/2 pr-1.5">
              <Label htmlFor="masse_grasse" className={labelCls}>% Masse grasse</Label>
              <Input id="masse_grasse" type="number" step="0.1" min="1" placeholder="18.5"
                     className={fieldCls} {...register('masse_grasse_pct')} />
              <FieldErr msg={errors.masse_grasse_pct?.message} />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            size="sm"
            className="w-full rounded-2xl bg-primary hover:bg-primary/90 text-black font-black"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : 'Enregistrer la mesure'}
          </Button>
        </form>
      )}
    </div>
  )
}
