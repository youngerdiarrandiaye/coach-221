import type { PaymentRow, ClientRow, ProfileRow } from '@/entities'
import { METHODE_LABELS, STATUT_PAYMENT_LABELS } from '@/config/constants'

// ─── Palette (print-safe — pas de neon pur) ────────────────────────────────
const INK_DARK   = [13,  13,  40]   // fond sombre #0D0D28
const INK_MID    = [24,  24,  58]   // bande milieu
const GREEN      = [0,   185, 90]   // vert TerangaCoach print-safe
const GREEN_DIM  = [0,   130, 60]   // vert foncé pour sous-titres
const WHITE      = [255, 255, 255]
const SNOW       = [248, 249, 252]  // fond lignes paires
const BORDER     = [222, 224, 236]  // séparateurs fins
const TEXT_DARK  = [18,  18,  44]   // texte principal
const TEXT_MID   = [95,  95,  135]  // texte secondaire
const TEXT_LIGHT = [155, 155, 190]  // labels discrets

// ─── Helpers ────────────────────────────────────────────────────────────────

function fDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Intl.NumberFormat('fr-FR') utilise U+202F (narrow no-break space) que jsPDF
// interprète comme "/" — on formate manuellement avec une espace ordinaire.
function fCFA(amount: number) {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
}

type Doc = InstanceType<typeof import('jspdf')['jsPDF']>

function fill  (d: Doc, c: number[]) { d.setFillColor  (c[0], c[1], c[2]) }
function stroke(d: Doc, c: number[]) { d.setDrawColor  (c[0], c[1], c[2]) }
function txt   (d: Doc, c: number[]) { d.setTextColor  (c[0], c[1], c[2]) }

// ─── Main ────────────────────────────────────────────────────────────────────

export async function buildPaymentPdf(
  payment: PaymentRow,
  client:  ClientRow,
  coach:   ProfileRow,
) {
  const { jsPDF } = await import('jspdf')
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = 210
  const M    = 16   // margin
  const INNER = W - M * 2

  const receiptNum = `#${payment.id.slice(-8).toUpperCase()}`
  const coachName  = `${coach.prenom ?? ''} ${(coach.nom ?? '').toUpperCase()}`.trim()
  const clientName = `${client.prenom ?? ''} ${(client.nom ?? '').toUpperCase()}`.trim()

  // ══════════════════════════════════════════════════════════════════
  // 1. HEADER BAND (fond sombre)
  // ══════════════════════════════════════════════════════════════════
  fill(doc, INK_DARK)
  doc.rect(0, 0, W, 30, 'F')

  // Barre verte en bas du header (4 px)
  fill(doc, GREEN)
  doc.rect(0, 30, W, 1.5, 'F')

  // Nom du coach — titre principal
  txt(doc, WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(coachName, M, 12)

  // Sous-titre coach (spécialité ou "Coach Personnel")
  txt(doc, GREEN)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const specialite = (coach as { specialite?: string | null }).specialite ?? 'Coach Personnel'
  doc.text(specialite.toUpperCase(), M, 18)

  // "REÇU" à droite
  txt(doc, TEXT_LIGHT.map(v => Math.round(v * 0.6 + 100)) as number[])  // gris clair
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('REÇU DE PAIEMENT', W - M, 10, { align: 'right' })

  txt(doc, WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(receiptNum, W - M, 17, { align: 'right' })

  txt(doc, TEXT_LIGHT as number[])
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(fDate(payment.date_paiement), W - M, 23, { align: 'right' })

  // ══════════════════════════════════════════════════════════════════
  // 2. DE / À — deux colonnes
  // ══════════════════════════════════════════════════════════════════
  let y = 40
  const COL = (INNER - 8) / 2

  // Card DE (coach)
  fill(doc, SNOW)
  stroke(doc, BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(M, y, COL, 34, 2, 2, 'FD')

  // Barre verte gauche de la card
  fill(doc, GREEN)
  doc.rect(M, y, 2.5, 34, 'F')

  txt(doc, TEXT_LIGHT as number[])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('DE', M + 6, y + 7)

  txt(doc, TEXT_DARK as number[])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(coachName, M + 6, y + 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  txt(doc, TEXT_MID as number[])
  if (specialite !== 'Coach Personnel') {
    doc.text(specialite, M + 6, y + 20)
  }
  if (coach.telephone) {
    doc.text(String(coach.telephone), M + 6, y + 26)
  }

  // Card À (client)
  const cx = M + COL + 8
  fill(doc, SNOW)
  stroke(doc, BORDER)
  doc.roundedRect(cx, y, COL, 34, 2, 2, 'FD')

  // Barre verte gauche
  fill(doc, GREEN_DIM)
  doc.rect(cx, y, 2.5, 34, 'F')

  txt(doc, TEXT_LIGHT as number[])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('À', cx + 6, y + 7)

  txt(doc, TEXT_DARK as number[])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(clientName, cx + 6, y + 14)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  txt(doc, TEXT_MID as number[])
  if (client.telephone) doc.text(String(client.telephone), cx + 6, y + 20)
  if (client.email) {
    const email = client.email.length > 28
      ? client.email.slice(0, 26) + '…'
      : client.email
    doc.text(email, cx + 6, y + 26)
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. DÉTAILS
  // ══════════════════════════════════════════════════════════════════
  y += 42

  // Titre section
  txt(doc, TEXT_DARK as number[])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('DÉTAILS DU PAIEMENT', M, y)

  // Filet vert sous le titre
  fill(doc, GREEN)
  doc.rect(M, y + 1.5, 38, 0.7, 'F')

  y += 8

  const detailRows: [string, string, boolean][] = [
    ['Date',    fDate(payment.date_paiement),                              false],
    ['Méthode', METHODE_LABELS[payment.methode] ?? String(payment.methode), false],
    ['Statut',  STATUT_PAYMENT_LABELS[payment.statut] ?? String(payment.statut), true],
    ...(payment.description
      ? [['Description', payment.description, false] as [string, string, boolean]]
      : []),
  ]

  detailRows.forEach(([label, value, isGreen], i) => {
    const rowH = 9
    // Fond alterné
    if (i % 2 === 0) {
      fill(doc, SNOW)
      doc.rect(M, y, INNER, rowH, 'F')
    }
    // Séparateur
    stroke(doc, BORDER)
    doc.setLineWidth(0.2)
    doc.line(M, y + rowH, M + INNER, y + rowH)

    txt(doc, TEXT_MID as number[])
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(label, M + 4, y + 6)

    if (isGreen) {
      txt(doc, GREEN as number[])
      doc.setFont('helvetica', 'bold')
    } else {
      txt(doc, TEXT_DARK as number[])
      doc.setFont('helvetica', 'normal')
    }
    doc.setFontSize(8.5)
    doc.text(value, M + 55, y + 6)

    y += rowH
  })

  // ══════════════════════════════════════════════════════════════════
  // 4. MONTANT TOTAL
  // ══════════════════════════════════════════════════════════════════
  y += 10

  // Box sombre
  fill(doc, INK_DARK)
  doc.roundedRect(M, y, INNER, 22, 3, 3, 'F')

  // Accent vert gauche
  fill(doc, GREEN)
  doc.roundedRect(M, y, 3, 22, 1.5, 1.5, 'F')

  // Label MONTANT TOTAL
  txt(doc, TEXT_LIGHT as number[])
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text('MONTANT TOTAL', M + 8, y + 9)

  // Montant — assez de taille mais pas trop grand pour éviter l'overflow
  const amountStr = fCFA(payment.montant)
  txt(doc, GREEN as number[])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(amountStr, W - M - 5, y + 14, { align: 'right' })

  // ══════════════════════════════════════════════════════════════════
  // 5. NOTE
  // ══════════════════════════════════════════════════════════════════
  y += 32

  txt(doc, TEXT_LIGHT as number[])
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.text(
    `Ce reçu a été généré automatiquement par TerangaCoach le ${fDate(new Date().toISOString())}.`,
    W / 2, y, { align: 'center' },
  )

  // ══════════════════════════════════════════════════════════════════
  // 6. FOOTER
  // ══════════════════════════════════════════════════════════════════
  // Bande sombre en bas
  fill(doc, INK_MID)
  doc.rect(0, 285, W, 12, 'F')

  txt(doc, GREEN as number[])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('TerangaCoach', M, 292)

  txt(doc, TEXT_LIGHT as number[])
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('• Coaching Sportif Personnalisé', M + 28, 292)

  txt(doc, TEXT_MID as number[])
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(coachName, W - M, 292, { align: 'right' })

  // ══════════════════════════════════════════════════════════════════
  // Save
  // ══════════════════════════════════════════════════════════════════
  const safeName = (client.nom ?? 'client').toLowerCase().replace(/\s+/g, '_')
  doc.save(`recu_${safeName}_${payment.date_paiement}.pdf`)
}
