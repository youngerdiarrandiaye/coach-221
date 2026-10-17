'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { paymentSchema, type PaymentFormData } from './schemas'
import { paymentDao } from '@/dao/paymentDao'
import { getServerUser } from '@/lib/session'
import { getErrorMessage } from '@/exception/AppError'

type ActionResult = { success?: boolean; error?: string; id?: string }

export async function createPaymentAction(data: PaymentFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = paymentSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const montant = Number(parsed.data.montant)
  if (isNaN(montant) || montant <= 0) return { error: 'Montant invalide' }

  try {
    const payment = await paymentDao.create(user.id, {
      client_id:     parsed.data.client_id,
      montant,
      methode:       parsed.data.methode,
      statut:        parsed.data.statut,
      description:   parsed.data.description?.trim() || null,
      date_paiement: parsed.data.date_paiement,
    })
    if (!payment) return { error: 'Erreur lors de la création' }
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`payments-${user.id}`)
    return { success: true, id: payment.id }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function updatePaymentAction(id: string, data: PaymentFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }

  const parsed = paymentSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const montant = Number(parsed.data.montant)
  if (isNaN(montant) || montant <= 0) return { error: 'Montant invalide' }

  try {
    const payment = await paymentDao.update(id, user.id, {
      montant,
      methode:       parsed.data.methode,
      statut:        parsed.data.statut,
      description:   parsed.data.description?.trim() || null,
      date_paiement: parsed.data.date_paiement,
    })
    if (!payment) return { error: 'Paiement introuvable' }
    revalidatePath(`/payments/${id}`)
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`payments-${user.id}`)
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}

export async function deletePaymentAction(id: string): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }
  try {
    await paymentDao.remove(id, user.id)
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`payments-${user.id}`)
  } catch (error) { return { error: getErrorMessage(error) } }
  redirect('/payments')
}

export async function deletePaymentFromListAction(id: string): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifié' }
  try {
    await paymentDao.remove(id, user.id)
    revalidatePath('/payments')
    revalidatePath('/dashboard')
    revalidateTag(`dashboard-${user.id}`)
    revalidateTag(`stats-${user.id}`)
    revalidateTag(`payments-${user.id}`)
    return { success: true }
  } catch (e) {
    return { error: getErrorMessage(e) }
  }
}
