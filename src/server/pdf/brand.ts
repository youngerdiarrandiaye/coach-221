/**
 * Identité visuelle CoachSen pour les PDF (fiche client, reçu, rapport).
 * Les couleurs suivent le thème de l'application (palette.ts : nuit, corail, lagon). Par défaut : nuit (noir, vert citron, blanc).
 * L'accent est réservé aux aplats (barres, pastilles, éclair) : sur fond blanc il se lit mal,
 * donc le texte posé sur un aplat utilise `onAccent`, et l'accent n'est jamais utilisé comme couleur de texte sur blanc.
 */
import { paletteFor, type PdfPalette, type Rgb } from './palette'

export type { Rgb, PdfPalette }

/** Seule constante de marque indépendante du thème ; les couleurs viennent de ./palette (voir paletteFor). */
export const BRAND = { name: 'coachsen' }
const DEFAULT_PALETTE = paletteFor('nuit')

export interface PdfDoc {
  setFillColor(r: number, g: number, b: number): unknown
  setDrawColor(r: number, g: number, b: number): unknown
  setTextColor(r: number, g: number, b: number): unknown
  setFont(name: string, style?: string): unknown
  setFontSize(size: number): unknown
  setLineWidth(width: number): unknown
  text(text: string | string[], x: number, y: number, options?: { align?: 'left' | 'center' | 'right' }): unknown
  rect(x: number, y: number, w: number, h: number, style?: string): unknown
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): unknown
  line(x1: number, y1: number, x2: number, y2: number): unknown
  lines(lines: number[][], x: number, y: number, scale?: number[], style?: string, closed?: boolean): unknown
  getTextWidth(text: string): number
  splitTextToSize(text: string, maxWidth: number): string[]
  addPage(): unknown
  setPage(page: number): unknown
  internal: { pageSize: { getWidth(): number; getHeight(): number } }
}

export const fill = (d: PdfDoc, c: Rgb) => d.setFillColor(c[0], c[1], c[2])
export const stroke = (d: PdfDoc, c: Rgb) => d.setDrawColor(c[0], c[1], c[2])
export const ink = (d: PdfDoc, c: Rgb) => d.setTextColor(c[0], c[1], c[2])

/** Date longue en français, sans dépendre du fuseau de la machine. */
export function longDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Dakar', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/**
 * Montant FCFA lisible. Intl.NumberFormat('fr-FR') produit une espace fine insécable (U+202F) que jsPDF affiche
 * comme « / » : on groupe les milliers à la main avec une espace ordinaire.
 */
export function fcfa(amount: number) {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
}

/** Éclair CoachSen dessiné en vectoriel (même forme que l'icône de l'application). */
export function drawBolt(d: PdfDoc, x: number, y: number, size: number, color: Rgb) {
  const k = size / 512
  const pts: [number, number][] = [[296, 40], [104, 296], [226, 296], [196, 472], [408, 190], [284, 190]]
  const start = pts[0]
  const deltas = pts.slice(1).map((p, i) => [(p[0] - pts[i][0]) * k, (p[1] - pts[i][1]) * k])
  fill(d, color)
  d.lines(deltas, x + start[0] * k, y + start[1] * k, [1, 1], 'F', true)
}

/** Logo : tuile verte arrondie, éclair noir, puis le mot « coachsen » suivi d'un point vert. */
export function drawLogo(d: PdfDoc, x: number, y: number, scale = 1, P: PdfPalette = DEFAULT_PALETTE) {
  const tile = 11 * scale
  fill(d, P.headerAccent)
  d.roundedRect(x, y, tile, tile, 2.6 * scale, 2.6 * scale, 'F')
  drawBolt(d, x + tile * 0.12, y + tile * 0.12, tile * 0.76, P.header)
  ink(d, P.onHeader)
  d.setFont('helvetica', 'bold')
  d.setFontSize(17 * scale)
  const textX = x + tile + 3.2 * scale
  const baseline = y + tile * 0.72
  d.text(BRAND.name, textX, baseline)
  const width = d.getTextWidth(BRAND.name)
  fill(d, P.headerAccent)
  d.rect(textX + width + 0.6 * scale, baseline - 1.5 * scale, 1.7 * scale, 1.7 * scale, 'F')
}

export interface HeaderOptions {
  /** Type de document, à droite (ex. « Fiche client »). */
  title: string
  /** Ligne secondaire à droite (ex. numéro de reçu ou date). */
  detail?: string
  /** Troisième ligne à droite (ex. date). */
  note?: string
  /** Nom du coach, sous le logo. */
  coach?: string
}

/** En-tête noir pleine largeur : logo à gauche, type de document à droite, filet vert dessous. Renvoie la hauteur utilisée. */
export function drawHeader(d: PdfDoc, o: HeaderOptions, margin = 14, P: PdfPalette = DEFAULT_PALETTE) {
  const w = d.internal.pageSize.getWidth()
  const h = 36
  fill(d, P.header)
  d.rect(0, 0, w, h, 'F')
  fill(d, P.edge)
  d.rect(0, h, w, 1.4, 'F')
  drawLogo(d, margin, 9, 1, P)
  if (o.coach) {
    ink(d, P.onHeaderSoft)
    d.setFont('helvetica', 'normal')
    d.setFontSize(8)
    d.text(o.coach, margin, 29)
  }
  ink(d, P.onHeader)
  d.setFont('helvetica', 'bold')
  d.setFontSize(13)
  d.text(o.title, w - margin, 15, { align: 'right' })
  if (o.detail) {
    ink(d, P.headerAccent)
    d.setFontSize(10)
    d.text(o.detail, w - margin, 22, { align: 'right' })
  }
  if (o.note) {
    ink(d, P.onHeaderSoft)
    d.setFont('helvetica', 'normal')
    d.setFontSize(8)
    d.text(o.note, w - margin, 28, { align: 'right' })
  }
  return h + 1.4
}

/** Titre de section : petit rectangle vert, puis le titre en noir gras. */
export function sectionTitle(d: PdfDoc, label: string, x: number, y: number, P: PdfPalette = DEFAULT_PALETTE) {
  fill(d, P.accent)
  d.rect(x, y - 3.6, 1.8, 4.6, 'F')
  ink(d, P.ink)
  d.setFont('helvetica', 'bold')
  d.setFontSize(11)
  d.text(label, x + 4.2, y)
}

/** Pastille verte avec texte noir. Renvoie sa largeur. */
export function pill(d: PdfDoc, label: string, x: number, y: number, P: PdfPalette = DEFAULT_PALETTE) {
  d.setFont('helvetica', 'bold')
  d.setFontSize(8)
  const width = d.getTextWidth(label) + 6
  fill(d, P.accent)
  d.roundedRect(x, y - 4.2, width, 6.4, 3.2, 3.2, 'F')
  ink(d, P.onAccent)
  d.text(label, x + 3, y)
  return width
}

/** Pied de page sur toutes les pages : filet, marque à gauche, nom du coach au centre, pagination à droite. */
export function drawFooters(d: PdfDoc, pageCount: number, coach: string, margin = 14, P: PdfPalette = DEFAULT_PALETTE) {
  const w = d.internal.pageSize.getWidth()
  const hgt = d.internal.pageSize.getHeight()
  for (let page = 1; page <= pageCount; page++) {
    d.setPage(page)
    stroke(d, P.line)
    d.setLineWidth(0.2)
    d.line(margin, hgt - 12, w - margin, hgt - 12)
    fill(d, P.accent)
    d.rect(margin, hgt - 8.6, 1.6, 1.6, 'F')
    ink(d, P.ink)
    d.setFont('helvetica', 'bold')
    d.setFontSize(7.5)
    d.text(BRAND.name, margin + 3, hgt - 7)
    ink(d, P.soft)
    d.setFont('helvetica', 'normal')
    d.setFontSize(7.5)
    if (coach) d.text(coach, w / 2, hgt - 7, { align: 'center' })
    d.text(`Page ${page} sur ${pageCount}`, w - margin, hgt - 7, { align: 'right' })
  }
}
