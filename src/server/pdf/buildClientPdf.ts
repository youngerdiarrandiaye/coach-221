import type { ClientRow } from '@/entities'
import type { SessionRow } from '@/entities'
import type { PaymentRow } from '@/entities'
import { OBJECTIF_LABELS, METHODE_LABELS, STATUT_SESSION_LABELS } from '@/config/constants'
import { paletteFor, type PdfPalette } from './palette'
import { drawFooters, drawHeader, fcfa, fill, ink, longDate, pill, sectionTitle, stroke, type PdfDoc } from './brand'

const W = 210
const M = 14
const INNER = W - M * 2
const BOTTOM = 272
const ROW = 7

interface Column { label: string; x: number; align?: 'left' | 'right' }

/** Tableau : en-tête noir, lignes alternées, saut de page avec en-tête répété. Renvoie la position verticale suivante. */
function table<T>(
  P: PdfPalette,
  d: PdfDoc,
  y: number,
  columns: Column[],
  rows: T[],
  cells: (row: T) => { text: string; bold?: boolean; muted?: boolean; dot?: boolean }[],
) {
  const header = (top: number) => {
    fill(d, P.header)
    d.rect(M, top, INNER, 8, 'F')
    ink(d, P.onHeader)
    d.setFont('helvetica', 'bold')
    d.setFontSize(8)
    columns.forEach(c => d.text(c.label, c.align === 'right' ? M + c.x : M + c.x, top + 5.4, c.align === 'right' ? { align: 'right' } : undefined))
    return top + 8
  }
  y = header(y)
  rows.forEach((row, index) => {
    if (y + ROW > BOTTOM) {
      d.addPage()
      y = header(22)
    }
    if (index % 2 === 0) {
      fill(d, P.zebra)
      d.rect(M, y, INNER, ROW, 'F')
    }
    cells(row).forEach((cell, i) => {
      const column = columns[i]
      const text = cell.text
      d.setFont('helvetica', cell.bold ? 'bold' : 'normal')
      d.setFontSize(8)
      ink(d, cell.muted ? P.faint : P.ink)
      let x = M + column.x
      if (cell.dot) {
        fill(d, P.accent)
        d.rect(x, y + 2.3, 2, 2, 'F')
        x += 3.4
      }
      d.text(text, x, y + 4.8, column.align === 'right' ? { align: 'right' } : undefined)
    })
    y += ROW
  })
  return y
}

export async function buildClientPdf(
  client: ClientRow,
  sessions: SessionRow[],
  payments: PaymentRow[],
  coachName: string,
  theme?: unknown,
) {
  const P = paletteFor(theme)
  // Import dynamique : jsPDF n'est chargé que lorsqu'un PDF est demandé
  const mod = await import('jspdf')
  const jsPDF = mod.jsPDF ?? mod.default
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const d = doc as unknown as PdfDoc

  let y = drawHeader(d, { title: 'Fiche client', note: `Générée le ${longDate(new Date())}`, coach: coachName }, M, P) + 12

  // ── Identité du client ─────────────────────────────────────────────────────
  const infos: [string, string][] = []
  if (client.telephone) infos.push(['Téléphone', client.telephone])
  if (client.email) infos.push(['E-mail', client.email])
  if (client.date_naissance) infos.push(['Naissance', longDate(client.date_naissance)])
  if (client.taille_cm) infos.push(['Taille', `${client.taille_cm} cm`])
  if (client.poids_initial_kg) infos.push(['Poids initial', `${client.poids_initial_kg} kg`])
  if (client.sexe) infos.push(['Sexe', client.sexe === 'HOMME' ? 'Homme' : 'Femme'])
  const rowsOfInfo = Math.ceil(infos.length / 3)
  const cardHeight = 26 + rowsOfInfo * 13

  fill(d, P.panel)
  stroke(d, P.line)
  d.setLineWidth(0.3)
  d.roundedRect(M, y, INNER, cardHeight, 3, 3, 'FD')
  fill(d, P.accent)
  d.roundedRect(M, y, 2.6, cardHeight, 1.3, 1.3, 'F')

  ink(d, P.ink)
  d.setFont('helvetica', 'bold')
  d.setFontSize(18)
  d.text(`${client.prenom} ${client.nom}`, M + 8, y + 11)
  if (client.objectif) pill(d, OBJECTIF_LABELS[client.objectif] ?? client.objectif, M + 8, y + 19, P)

  infos.forEach(([label, value], i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = M + 8 + col * 58
    const top = y + 27 + row * 13
    ink(d, P.soft)
    d.setFont('helvetica', 'normal')
    d.setFontSize(7.5)
    d.text(label, x, top)
    ink(d, P.ink)
    d.setFont('helvetica', 'bold')
    d.setFontSize(9)
    d.text(value.length > 30 ? value.slice(0, 28) + '…' : value, x, top + 5)
  })
  y += cardHeight + 12

  // ── Séances ────────────────────────────────────────────────────────────────
  if (sessions.length > 0) {
    sectionTitle(d, 'Séances', M, y, P)
    y += 5
    y = table(
      P, d, y,
      [{ label: 'Date', x: 3 }, { label: 'Titre', x: 48 }, { label: 'Durée', x: 118 }, { label: 'Statut', x: 144 }],
      sessions.slice(0, 20),
      s => [
        { text: longDate(s.date_heure) },
        { text: s.titre.length > 42 ? s.titre.slice(0, 40) + '…' : s.titre },
        { text: `${s.duree_minutes} min` },
        { text: STATUT_SESSION_LABELS[s.statut] ?? s.statut, bold: s.statut === 'EFFECTUEE', muted: s.statut === 'ANNULEE', dot: s.statut === 'EFFECTUEE' },
      ],
    )
    if (sessions.length > 20) {
      ink(d, P.soft)
      d.setFont('helvetica', 'normal')
      d.setFontSize(7.5)
      d.text(`${sessions.length} séances au total, les 20 premières sont listées.`, M, y + 5)
      y += 6
    }
    y += 10
  }

  // ── Paiements encaissés ────────────────────────────────────────────────────
  const paid = payments.filter(p => p.statut === 'PAYE')
  if (paid.length > 0) {
    if (y > BOTTOM - 40) { d.addPage(); y = 22 }
    sectionTitle(d, 'Paiements encaissés', M, y, P)
    y += 5
    y = table(
      P, d, y,
      [{ label: 'Date', x: 3 }, { label: 'Montant', x: 52 }, { label: 'Mode de paiement', x: 94 }, { label: 'Description', x: 136 }],
      paid,
      p => [
        { text: longDate(p.date_paiement) },
        { text: fcfa(p.montant), bold: true },
        { text: METHODE_LABELS[p.methode] ?? '' },
        { text: (p.description ?? '').slice(0, 30) },
      ],
    )
    if (y + 12 > BOTTOM) { d.addPage(); y = 22 }
    const total = paid.reduce((sum, p) => sum + p.montant, 0)
    fill(d, P.header)
    d.roundedRect(M, y + 3, INNER, 12, 2.5, 2.5, 'F')
    ink(d, P.onHeader)
    d.setFont('helvetica', 'bold')
    d.setFontSize(9)
    d.text('Total perçu', M + 5, y + 10.6)
    ink(d, P.headerAccent)
    d.setFontSize(12)
    d.text(fcfa(total), W - M - 5, y + 11, { align: 'right' })
  }

  const pageCount = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages()
  drawFooters(d, pageCount, coachName, M, P)

  return doc.output('arraybuffer')
}
