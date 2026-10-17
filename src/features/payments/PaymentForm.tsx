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
import { paymentSchema, type PaymentFormData } from './schemas'
import { createPaymentAction, updatePaymentAction } from './actions'
import { METHODE_LABELS, STATUT_PAYMENT_LABELS } from '@/config/constants'
import type { PaymentWithClient } from '@/dao/paymentDao'
import { ClientCombobox } from '@/components/ui/ClientCombobox'

interface ClientOption { id: string; nom: string; prenom: string; telephone: string }

interface PaymentFormProps {
  clients: ClientOption[]
  payment?: PaymentWithClient
  preselectedClientId?: string
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function PaymentForm({ clients, payment, preselectedClientId }: PaymentFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const isEdit = !!payment

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as Resolver<PaymentFormData>,
    defaultValues: payment ? {
      client_id:     payment.client_id,
      montant:       String(payment.montant),
      methode:       payment.methode,
      statut:        payment.statut,
      description:   payment.description ?? '',
      date_paiement: payment.date_paiement,
    } : {
      client_id:     preselectedClientId ?? '',
      montant:       '',
      methode:       undefined,
      statut:        'PAYE',
      description:   '',
      date_paiement: todayISO(),
    },
  })

  const onSubmit = async (data: PaymentFormData) => {
    setServerError(null)
    const tid = toast.loading(isEdit ? 'Mise à jour en cours…' : 'Enregistrement du paiement…')
    const result = isEdit
      ? await updatePaymentAction(payment.id, data)
      : await createPaymentAction(data)
    if (result?.error) {
      toast.error(result.error, { id: tid })
      setServerError(result.error)
      return
    }
    toast.success(isEdit ? 'Paiement mis à jour !' : 'Paiement enregistré !', { id: tid })
    if (!isEdit && result?.id) router.push(`/payments/${result.id}`)
    else router.push(`/payments/${payment!.id}`)
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
        <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Client <span className="text-destructive">*</span></Label>
        {isEdit ? (
          <Controller
            name="client_id"
            control={control}
            render={({ field: f }) => (
              <Select onValueChange={f.onChange} defaultValue={f.value} disabled>
                <SelectTrigger className={field}>
                  <SelectValue placeholder="Choisir un client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.prenom} {c.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        ) : (
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
        )}
        {err(errors.client_id?.message)}
      </div>

      {/* Montant + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="montant" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Montant (FCFA) <span className="text-destructive">*</span></Label>
          <Input id="montant" type="number" min="0" step="100" placeholder="25000" className={field} {...register('montant')} />
          {err(errors.montant?.message)}
        </div>
        <div>
          <Label htmlFor="date_paiement" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Date <span className="text-destructive">*</span></Label>
          <Input id="date_paiement" type="date" className={`${field} [color-scheme:dark]`} {...register('date_paiement')} />
          {err(errors.date_paiement?.message)}
        </div>
      </div>

      {/* Méthode + Statut */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Méthode <span className="text-destructive">*</span></Label>
          <Controller
            name="methode"
            control={control}
            render={({ field: f }) => (
              <Select onValueChange={f.onChange} defaultValue={f.value}>
                <SelectTrigger className={field}>
                  <SelectValue placeholder="Méthode…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHODE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {err(errors.methode?.message)}
        </div>
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Statut</Label>
          <Controller
            name="statut"
            control={control}
            render={({ field: f }) => (
              <Select onValueChange={f.onChange} defaultValue={f.value ?? 'PAYE'}>
                <SelectTrigger className={field}>
                  <SelectValue placeholder="Statut…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUT_PAYMENT_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wide mb-2 block text-muted-foreground">Description</Label>
        <Input id="description" placeholder="ex: Abonnement mensuel" className={field} {...register('description')} />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Link href={isEdit ? `/payments/${payment.id}` : '/payments'} className="flex-1">
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
            : <><Save size={16} /> {isEdit ? 'Enregistrer' : 'Enregistrer'}</>
          }
        </Button>
      </div>
    </form>
  )
}
