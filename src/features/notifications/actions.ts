'use server'

import { getServerUser } from '@/lib/session'
import { sessionDao } from '@/dao/sessionDao'
import type { SessionWithClient } from '@/dao/sessionDao'

export async function getUpcomingAlertsAction(): Promise<SessionWithClient[]> {
  const user = await getServerUser()
  if (!user) return []
  // Sessions dans les 2 prochaines heures
  return sessionDao.findInNextMinutes(user.id, 120)
}
