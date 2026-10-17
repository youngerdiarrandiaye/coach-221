export function formatCFA(amount: number): string {
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' FCFA'
  )
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Dakar',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(dateStr))
}

export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Dakar',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Dakar',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
