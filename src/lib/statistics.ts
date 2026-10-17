export function retention(
  clients: { id: string; actif: boolean }[],
  sessions: { client_id: string; date_heure: string; statut: string }[],
  now = new Date(),
) {
  const active = new Set(clients.filter(client => client.actif).map(client => client.id))
  const cutoff = now.getTime() - 30 * 24 * 60 * 60_000
  const recent = new Set(sessions.filter(session => {
    const date = new Date(session.date_heure).getTime()
    return session.statut === 'EFFECTUEE' && active.has(session.client_id) && date >= cutoff && date <= now.getTime()
  }).map(session => session.client_id))
  return {
    totalClients: active.size,
    clientsActifsRecent: recent.size,
    tauxRetention: active.size ? Math.round(recent.size / active.size * 100) : 0,
  }
}
