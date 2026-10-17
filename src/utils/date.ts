const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export function getStartOfWeek(date = new Date()): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day // Monday = 0
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function getEndOfWeek(date = new Date()): Date {
  const monday = getStartOfWeek(date)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  sunday.setUTCHours(23, 59, 59, 999)
  return sunday
}

export function getStartOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function getEndOfMonth(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

export function getDayLabel(dateStr: string): string {
  return DAYS_FR[new Date(dateStr).getUTCDay()]
}

export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getUTCDate()  === now.getUTCDate()  &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCFullYear() === now.getUTCFullYear()
  )
}

export function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr)
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return (
    d.getUTCDate()  === tomorrow.getUTCDate()  &&
    d.getUTCMonth() === tomorrow.getUTCMonth() &&
    d.getUTCFullYear() === tomorrow.getUTCFullYear()
  )
}

export function relativeDay(dateStr: string): string {
  if (isToday(dateStr))    return "Aujourd'hui"
  if (isTomorrow(dateStr)) return 'Demain'
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Dakar',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date(dateStr))
}
