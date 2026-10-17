'use server'

import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { progressDao } from '@/dao/progressDao'
import { sessionDao } from '@/dao/sessionDao'
import { paymentDao } from '@/dao/paymentDao'
import { RapportDocument } from './RapportPDF'
import type { RapportPDFData } from './RapportPDF'

function prevMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function toWaPhone(raw: string): string {
  const n = raw.replace(/[\s\-\.\(\)\+]/g, '')
  if (n.startsWith('221')) return n
  if (n.startsWith('0'))   return '221' + n.slice(1)
  return '221' + n
}

export type SendRapportResult =
  | { ok: true;  waLink: string; fileName: string }
  | { ok: false; error: string }

export async function sendRapportAction(
  clientId:  string,
  yearMonth: string,
): Promise<SendRapportResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: 'Non authentifié' }

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const [client, entriesCurrent, entriesPrev, sessions, payments] = await Promise.all([
    clientDao.findById(clientId, user.id),
    progressDao.findByClientAndMonth(clientId, user.id, yearMonth),
    progressDao.findByClientAndMonth(clientId, user.id, prevMonth(yearMonth)),
    sessionDao.findByClientAndMonth(clientId, user.id, yearMonth),
    paymentDao.findByClientAndMonth(clientId, user.id, yearMonth),
  ])

  if (!client)           return { ok: false, error: 'Client introuvable' }
  if (!client.telephone) return { ok: false, error: 'Numéro de téléphone manquant pour ce client' }

  // Age client
  const clientAge = (() => {
    if (!client.date_naissance) return null
    const b = new Date(client.date_naissance)
    const t = new Date()
    let age = t.getFullYear() - b.getFullYear()
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
    return age
  })()

  // Coach name from profile
  let coachNom: string | null = null
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: profile } = await admin
      .from('profiles')
      .select('prenom, nom')
      .eq('id', user.id)
      .single()
    if (profile) {
      coachNom = [profile.prenom, profile.nom].filter(Boolean).join(' ')
    }
  } catch { /* ignore — non-blocking */ }

  const data: RapportPDFData = {
    client: {
      nom:              client.nom,
      prenom:           client.prenom,
      objectif:         client.objectif,
      taille_cm:        client.taille_cm,
      poids_initial_kg: client.poids_initial_kg,
      telephone:        client.telephone,
      sexe:             client.sexe,
      age:              clientAge,
    },
    coachNom,
    yearMonth,
    entry:     entriesCurrent[0] ?? null,
    prevEntry: entriesPrev[0]    ?? null,
    sessions:  sessions.map(s => ({ titre: s.titre, date_heure: s.date_heure, statut: s.statut })),
    payments:  payments.map(p => ({
      montant:       p.montant,
      methode:       p.methode,
      description:   p.description,
      date_paiement: p.date_paiement,
      statut:        p.statut,
    })),
  }

  // ── Generate PDF ────────────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(createElement(RapportDocument, { data }) as any)
  } catch (err) {
    console.error('[sendRapport] PDF render failed:', err)
    return { ok: false, error: 'Erreur lors de la génération du PDF' }
  }

  // ── Upload to Supabase Storage ──────────────────────────────────────────────
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const safePrenom  = client.prenom.toLowerCase().replace(/\s+/g, '-')
  const safeNom     = client.nom.toLowerCase().replace(/\s+/g, '-')
  const fileName    = `rapport_${safePrenom}_${safeNom}_${yearMonth}.pdf`
  const storagePath = `${user.id}/${clientId}/${fileName}`

  const { error: uploadErr } = await admin.storage
    .from('exports')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('[sendRapport] Upload error:', uploadErr)
    return { ok: false, error: "Erreur lors de l'upload du PDF" }
  }

  // Signed URL valable 24h (assez pour que le client le reçoive et l'ouvre)
  const { data: signed, error: signErr } = await admin.storage
    .from('exports')
    .createSignedUrl(storagePath, 24 * 3600)

  if (signErr || !signed?.signedUrl) {
    return { ok: false, error: 'Erreur lors de la génération du lien de téléchargement' }
  }

  // ── Build wa.me link ────────────────────────────────────────────────────────
  const phone      = toWaPhone(client.telephone)
  const monthLabel = fmtMonth(yearMonth)

  const message = [
    `👋 Bonjour *${client.prenom}* !`,
    '',
    `Voici votre *rapport de performance* du mois de *${monthLabel}* 📊`,
    '',
    `📥 Télécharger le rapport PDF :`,
    signed.signedUrl,
    '',
    `_Lien valable 24h — TerangaCoach_`,
  ].join('\n')

  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

  return { ok: true, waLink, fileName }
}
