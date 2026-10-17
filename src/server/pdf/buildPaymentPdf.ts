import type { PaymentRow, ClientRow, ProfileRow } from '@/entities'
import { METHODE_LABELS, STATUT_PAYMENT_LABELS } from '@/config/constants'
import { coachLabel } from '@/lib/coachName'
import { paletteFor } from './palette'
import { drawFooters, drawHeader, fcfa, fill, ink, longDate, pill, sectionTitle, stroke, type PdfDoc } from './brand'

const W = 210
const M = 16
const INNER = W - M * 2

export async function buildPaymentPdf(
  payment: PaymentRow,
  client: ClientRow,
  coach: ProfileRow,
  theme?: unknown,
) {
  const P = paletteFor(theme)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const d = doc as unknown as PdfDoc

  const receiptNumber = `N° ${payment.id.slice(-8).toUpperCase()}`
  const coachName = coachLabel(coach.prenom, coach.nom)
  const clientName = `${client.prenom ?? ''} ${client.nom ?? ''}`.trim()
  const specialty = (coach as { specialite?: string | null }).specialite ?? ''

  let y = drawHeader(d, { title: 'Reçu de paiement', detail: receiptNumber, note: longDate(payment.date_paiement), coach: coachName }, M, P) + 12

  // ── De / À : deux cartes ───────────────────────────────────────────────────
  const col = (INNER - 8) / 2
  const card = (x: number, label: string, name: string, lines: string[]) => {
    fill(d, P.panel)
    stroke(d, P.line)
    d.setLineWidth(0.3)
    d.roundedRect(x, y, col, 34, 2.5, 2.5, 'FD')
    fill(d, P.accent)
    d.roundedRect(x, y, 2.6, 34, 1.3, 1.3, 'F')
    ink(d, P.soft)
    d.setFont('helvetica', 'normal')
    d.setFontSize(7.5)
    d.text(label, x + 7, y + 7)
    ink(d, P.ink)
    d.setFont('helvetica', 'bold')
    d.setFontSize(11)
    d.text(name.length > 26 ? name.slice(0, 24) + '…' : name, x + 7, y + 14)
    ink(d, P.soft)
    d.setFont('helvetica', 'normal')
    d.setFontSize(8.5)
    lines.filter(Boolean).slice(0, 2).forEach((line, i) => d.text(line.length > 32 ? line.slice(0, 30) + '…' : line, x + 7, y + 21 + i * 6))
  }
  card(M, 'De', coachName || 'Coach', [specialty, coach.telephone ? String(coach.telephone) : ''])
  card(M + col + 8, 'Pour', clientName, [client.telephone ? String(client.telephone) : '', client.email ?? ''])
  y += 34 + 14

  // ── Détails ────────────────────────────────────────────────────────────────
  sectionTitle(d, 'Détails du paiement', M, y, P)
  y += 6
  const details: [string, string][] = [
    ['Date', longDate(payment.date_paiement)],
    ['Mode de paiement', METHODE_LABELS[payment.methode] ?? String(payment.methode)],
    ['Statut', STATUT_PAYMENT_LABELS[payment.statut] ?? String(payment.statut)],
  ]
  if (payment.description) details.push(['Description', payment.description])

  details.forEach(([label, value], i) => {
    const lines = label === 'Description' ? d.splitTextToSize(value, INNER - 62) : [value]
    const rowHeight = Math.max(10, 5 + lines.length * 4.6)
    if (i % 2 === 0) {
      fill(d, P.zebra)
      d.rect(M, y, INNER, rowHeight, 'F')
    }
    ink(d, P.soft)
    d.setFont('helvetica', 'normal')
    d.setFontSize(9)
    d.text(label, M + 4, y + 6.6)
    if (label === 'Statut' && payment.statut === 'PAYE') {
      pill(d, value, M + 58, y + 6.6, P)
    } else {
      ink(d, P.ink)
      d.setFont('helvetica', label === 'Description' ? 'normal' : 'bold')
      d.text(lines, M + 58, y + 6.6)
    }
    y += rowHeight
  })

  // ── Montant : l'élément fort du reçu ───────────────────────────────────────
  y += 12
  fill(d, P.header)
  d.roundedRect(M, y, INNER, 28, 4, 4, 'F')
  fill(d, P.edge)
  d.roundedRect(M, y, 3.4, 28, 1.7, 1.7, 'F')
  ink(d, P.onHeaderSoft)
  d.setFont('helvetica', 'normal')
  d.setFontSize(9)
  d.text('Montant reçu', M + 10, y + 12)
  ink(d, P.headerAccent)
  d.setFont('helvetica', 'bold')
  d.setFontSize(24)
  d.text(fcfa(payment.montant), W - M - 8, y + 18, { align: 'right' })

  // ── Mention ────────────────────────────────────────────────────────────────
  y += 28 + 14
  ink(d, P.soft)
  d.setFont('helvetica', 'normal')
  d.setFontSize(8)
  d.text(`Ce reçu a été établi avec CoachSen le ${longDate(new Date())}.`, W / 2, y, { align: 'center' })

  drawFooters(d, 1, coachName, M, P)
  return doc.output('arraybuffer')
}
