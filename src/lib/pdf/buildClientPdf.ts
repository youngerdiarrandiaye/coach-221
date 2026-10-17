import type { ClientRow } from '@/entities'
import type { SessionRow } from '@/entities'
import type { PaymentRow } from '@/entities'
import { OBJECTIF_LABELS, METHODE_LABELS, STATUT_SESSION_LABELS } from '@/config/constants'

const PRIMARY = '#00853F'
const DARK    = '#111111'
const GRAY    = '#666666'
const LIGHT   = '#F5F5F5'
const BORDER  = '#E0E0E0'

function fDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
}

export async function buildClientPdf(
  client: ClientRow,
  sessions: SessionRow[],
  payments: PaymentRow[],
  coachName: string,
) {
  // Dynamic import — browser only
  const { default: jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const MARGIN = 14
  let y = 0

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(PRIMARY)
  doc.rect(0, 0, W, 22, 'F')

  doc.setTextColor('#FFFFFF')
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('TerangaCoach', MARGIN, 10)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Fiche Client', MARGIN, 16)
  doc.text(`Généré le ${fDate(new Date().toISOString())}`, W - MARGIN, 16, { align: 'right' })

  y = 30

  // ── Identité ─────────────────────────────────────────────────────────────
  doc.setFillColor(LIGHT)
  doc.roundedRect(MARGIN, y, W - MARGIN * 2, 38, 3, 3, 'F')

  doc.setTextColor(DARK)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`${client.prenom} ${client.nom}`, MARGIN + 4, y + 9)

  if (client.objectif) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(PRIMARY)
    doc.text(OBJECTIF_LABELS[client.objectif] ?? client.objectif, MARGIN + 4, y + 16)
  }

  doc.setTextColor(GRAY)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  const infos: string[] = []
  if (client.telephone)        infos.push(`Tél : ${client.telephone}`)
  if (client.email)            infos.push(`Email : ${client.email}`)
  if (client.date_naissance)   infos.push(`Naissance : ${fDate(client.date_naissance)}`)
  if (client.taille_cm)        infos.push(`Taille : ${client.taille_cm} cm`)
  if (client.poids_initial_kg) infos.push(`Poids initial : ${client.poids_initial_kg} kg`)
  if (client.sexe)             infos.push(`Sexe : ${client.sexe === 'HOMME' ? 'Homme' : 'Femme'}`)

  infos.slice(0, 3).forEach((info, i) => {
    doc.text(info, MARGIN + 4, y + 23 + i * 6)
  })
  infos.slice(3).forEach((info, i) => {
    doc.text(info, W / 2 + 4, y + 23 + i * 6)
  })

  y += 46

  // ── Coach ────────────────────────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setTextColor(GRAY)
  doc.text(`Coach : ${coachName}`, MARGIN, y)
  y += 8

  // ── Séances ──────────────────────────────────────────────────────────────
  if (sessions.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(PRIMARY)
    doc.text('Séances', MARGIN, y)
    doc.setDrawColor(PRIMARY)
    doc.line(MARGIN, y + 1, MARGIN + 30, y + 1)
    y += 6

    // Table header
    doc.setFillColor(PRIMARY)
    doc.rect(MARGIN, y, W - MARGIN * 2, 7, 'F')
    doc.setTextColor('#FFFFFF')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Date',   MARGIN + 2, y + 5)
    doc.text('Titre',  MARGIN + 35, y + 5)
    doc.text('Durée',  MARGIN + 110, y + 5)
    doc.text('Statut', MARGIN + 140, y + 5)
    y += 7

    doc.setFont('helvetica', 'normal')
    sessions.slice(0, 20).forEach((s, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(LIGHT)
        doc.rect(MARGIN, y, W - MARGIN * 2, 6.5, 'F')
      }
      doc.setTextColor(DARK)
      doc.setFontSize(8)
      doc.text(fDate(s.date_heure), MARGIN + 2, y + 4.5)
      const titreShort = s.titre.length > 40 ? s.titre.slice(0, 40) + '…' : s.titre
      doc.text(titreShort, MARGIN + 35, y + 4.5)
      doc.text(`${s.duree_minutes} min`, MARGIN + 110, y + 4.5)
      doc.setTextColor(s.statut === 'EFFECTUEE' ? '#1a7a3f' : s.statut === 'ANNULEE' ? '#c0392b' : GRAY)
      doc.text(STATUT_SESSION_LABELS[s.statut] ?? s.statut, MARGIN + 140, y + 4.5)
      doc.setTextColor(DARK)
      y += 6.5

      if (y > 270) { doc.addPage(); y = 20 }
    })

    y += 6
  }

  // ── Paiements ─────────────────────────────────────────────────────────────
  if (payments.length > 0) {
    if (y > 230) { doc.addPage(); y = 20 }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(PRIMARY)
    doc.text('Paiements', MARGIN, y)
    doc.setDrawColor(PRIMARY)
    doc.line(MARGIN, y + 1, MARGIN + 38, y + 1)
    y += 6

    // Table header
    doc.setFillColor(PRIMARY)
    doc.rect(MARGIN, y, W - MARGIN * 2, 7, 'F')
    doc.setTextColor('#FFFFFF')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Date',        MARGIN + 2,   y + 5)
    doc.text('Montant',     MARGIN + 40,  y + 5)
    doc.text('Méthode',     MARGIN + 90,  y + 5)
    doc.text('Description', MARGIN + 130, y + 5)
    y += 7

    let total = 0
    doc.setFont('helvetica', 'normal')
    payments.filter((p) => p.statut === 'PAYE').forEach((p, i) => {
      total += p.montant
      if (i % 2 === 0) {
        doc.setFillColor(LIGHT)
        doc.rect(MARGIN, y, W - MARGIN * 2, 6.5, 'F')
      }
      doc.setTextColor(DARK)
      doc.setFontSize(8)
      doc.text(fDate(p.date_paiement),              MARGIN + 2,   y + 4.5)
      doc.text(fCFA(p.montant),                     MARGIN + 40,  y + 4.5)
      doc.text(METHODE_LABELS[p.methode] ?? '',     MARGIN + 90,  y + 4.5)
      const desc = (p.description ?? '').slice(0, 28)
      doc.text(desc,                                MARGIN + 130, y + 4.5)
      y += 6.5

      if (y > 270) { doc.addPage(); y = 20 }
    })

    // Total line
    doc.setFillColor(PRIMARY)
    doc.rect(MARGIN, y, W - MARGIN * 2, 7, 'F')
    doc.setTextColor('#FFFFFF')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Total perçu', MARGIN + 2, y + 5)
    doc.text(fCFA(total), W - MARGIN - 2, y + 5, { align: 'right' })
    y += 14
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc.internal as any).getNumberOfPages() as number
  for (let i = 1; i <= pageCount; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(doc as any).setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(GRAY)
    doc.text(`TerangaCoach • ${i}/${pageCount}`, W / 2, 292, { align: 'center' })
    doc.setDrawColor(BORDER)
    doc.line(MARGIN, 288, W - MARGIN, 288)
  }

  const filename = `fiche_${client.prenom.toLowerCase()}_${client.nom.toLowerCase()}.pdf`
  doc.save(filename)
}
