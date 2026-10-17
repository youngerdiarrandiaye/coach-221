import { clientDao } from '@/dao/clientDao'
import { sessionDao, type SessionWithClient } from '@/dao/sessionDao'
import { paymentDao } from '@/dao/paymentDao'
import { getDayLabel, getStartOfWeek } from '@/utils/date'

export interface DashboardStats {
  clientsActifs: number
  seancesCetteSemaine: number
  seancesAVenir: number
  revenusCeMois: number
}

export interface WeeklyDay {
  label: string
  date: string
  count: number
}

export interface DailyRevenue {
  date:   string   // 'YYYY-MM-DD'
  amount: number
}

export const dashboardService = {
  async getStats(coachId: string): Promise<DashboardStats> {
    const [clientsActifs, seancesCetteSemaine, seancesAVenir, revenusCeMois] =
      await Promise.all([
        clientDao.countActifs(coachId),
        sessionDao.countThisWeek(coachId),
        sessionDao.countUpcoming(coachId),
        paymentDao.sumThisMonth(coachId),
      ])
    return { clientsActifs, seancesCetteSemaine, seancesAVenir, revenusCeMois }
  },

  async getWeeklyData(coachId: string): Promise<WeeklyDay[]> {
    const sessions = await sessionDao.findThisWeek(coachId)
    const monday = getStartOfWeek()

    const days: WeeklyDay[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setUTCDate(monday.getUTCDate() + i)
      const iso = d.toISOString().split('T')[0]
      return { label: getDayLabel(iso), date: iso, count: 0 }
    })

    for (const session of sessions) {
      const dayIso = session.date_heure.split('T')[0]
      const slot = days.find((d) => d.date === dayIso)
      if (slot) slot.count++
    }

    return days
  },

  async getUpcomingSessions(coachId: string, limit = 5): Promise<SessionWithClient[]> {
    return sessionDao.findUpcoming(coachId, limit)
  },
}
