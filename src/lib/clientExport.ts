/** Nom de fichier ASCII sûr pour l'export d'un client (aucun caractère de contrôle ni guillemet). */
export function exportFileName(client: { prenom: string; nom: string }, now = new Date()): string {
  const slug = `${client.prenom}-${client.nom}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'client'
  return `client-${slug}-${now.toISOString().slice(0, 10)}.json`
}
