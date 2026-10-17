'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { recurrenceSchema, type RecurrenceFormData } from './schemas'
import { sessionRecurrenceDao } from '@/dao/sessionRecurrenceDao'
import { getServerUser } from '@/lib/session'
import { getErrorMessage } from '@/exception/AppError'

type ActionResult = { error?: string } | undefined

function invalidate(coachId: string) {
  revalidatePath('/sessions')
  revalidatePath('/sessions/recurrences')
  revalidatePath('/dashboard')
  revalidateTag('dashboard-' + coachId)
  revalidateTag('stats-' + coachId)
  revalidateTag('sessions-' + coachId)
}

export async function createRecurrenceAction(data: RecurrenceFormData): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifi?' }
  const parsed = recurrenceSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const values = parsed.data
  const defaultEnd = new Date(values.date_debut + 'T00:00:00Z')
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 16 * 7)
  try {
    await sessionRecurrenceDao.createWithSessions(user.id, {
      ...values, date_fin: values.date_fin || defaultEnd.toISOString().slice(0, 10),
    })
    invalidate(user.id)
  } catch (error) { return { error: getErrorMessage(error) } }
  redirect('/sessions/recurrences')
}

export async function deleteRecurrenceAction(recurrenceId: string): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { error: 'Non authentifi?' }
  try {
    await sessionRecurrenceDao.removeWithFutureSessions(recurrenceId)
    invalidate(user.id)
  } catch (error) { return { error: getErrorMessage(error) } }
  redirect('/sessions/recurrences')
}
