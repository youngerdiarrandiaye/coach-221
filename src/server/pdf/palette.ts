/**
 * Palettes des PDF selon le thème choisi dans l'application (Nuit citron, Corail, Lagon).
 * Contrat : les demandes de PDF acceptent `?theme=nuit|corail|lagon` ; toute autre valeur (ou l'absence) donne `nuit`,
 * c'est-à-dire l'apparence d'origine. Le thème est une préférence d'affichage : aucune donnée n'en dépend.
 * Les PDF sont lus sur papier ou sur écran clair : le fond de page reste blanc dans tous les thèmes ;
 * seuls le bandeau d'en-tête, les aplats d'accent et les teintes de gris changent.
 */
export type Rgb = [number, number, number]
export type PdfThemeId = 'nuit' | 'corail' | 'lagon'

export interface PdfPalette {
  id: PdfThemeId
  /** Fond du bandeau d'en-tête et des barres de total. */
  header: Rgb
  /** Texte principal posé sur le bandeau. */
  onHeader: Rgb
  /** Texte secondaire posé sur le bandeau. */
  onHeaderSoft: Rgb
  /** Élément d'accent posé sur le bandeau (barre, éclair, montant). */
  headerAccent: Rgb
  /** Liseré sous le bandeau et bande d'accent des totaux : doit se voir sur le bandeau comme sur le blanc. */
  edge: Rgb
  /** Aplat d'accent sur fond blanc (pastille, barre de titre, tuile du logo). Jamais utilisé comme couleur de texte sur blanc. */
  accent: Rgb
  /** Texte ou dessin posé sur un aplat d'accent. */
  onAccent: Rgb
  white: Rgb
  /** Texte principal sur blanc. */
  ink: Rgb
  /** Texte secondaire (contraste suffisant sur blanc). */
  soft: Rgb
  /** Libellés discrets. */
  faint: Rgb
  /** Filets. */
  line: Rgb
  /** Lignes paires des tableaux. */
  zebra: Rgb
  /** Fond des cartes. */
  panel: Rgb
}

const nuit: PdfPalette = {
  id: 'nuit',
  header: [10, 10, 10], onHeader: [255, 255, 255], onHeaderSoft: [190, 190, 190], headerAccent: [200, 243, 29], edge: [200, 243, 29],
  accent: [200, 243, 29], onAccent: [10, 10, 10],
  white: [255, 255, 255], ink: [10, 10, 10], soft: [96, 96, 96], faint: [150, 150, 150],
  line: [224, 224, 220], zebra: [245, 245, 241], panel: [250, 250, 247],
}

/** Rose de l'application (#ff1f6b) en aplat : le texte dessus est blanc. L'orange (#ff9f43) sert d'accent sur le bandeau rose. */
const corail: PdfPalette = {
  id: 'corail',
  header: [255, 31, 107], onHeader: [255, 255, 255], onHeaderSoft: [255, 226, 236], headerAccent: [255, 255, 255], edge: [255, 159, 67],
  accent: [255, 31, 107], onAccent: [255, 255, 255],
  white: [255, 255, 255], ink: [29, 22, 32], soft: [100, 88, 96], faint: [160, 148, 156],
  line: [234, 221, 228], zebra: [251, 246, 248], panel: [253, 249, 251],
}

/** Turquoise de l'application (#5fc9d2) : bandeau anthracite, accent turquoise, texte sombre sur turquoise. */
const lagon: PdfPalette = {
  id: 'lagon',
  header: [12, 13, 14], onHeader: [255, 255, 255], onHeaderSoft: [175, 190, 193], headerAccent: [95, 201, 210], edge: [95, 201, 210],
  accent: [95, 201, 210], onAccent: [6, 42, 46],
  white: [255, 255, 255], ink: [12, 13, 14], soft: [88, 100, 103], faint: [146, 158, 161],
  line: [220, 228, 230], zebra: [241, 246, 247], panel: [247, 250, 250],
}

const PALETTES: Record<PdfThemeId, PdfPalette> = { nuit, corail, lagon }

/** Accepte une valeur de requête quelconque : tout ce qui n'est pas un thème connu donne `nuit`. */
export function parseTheme(value: unknown): PdfThemeId {
  return value === 'corail' || value === 'lagon' ? value : 'nuit'
}

export function paletteFor(theme: unknown): PdfPalette {
  return PALETTES[parseTheme(theme)]
}

/** Couleur au format #rrggbb, pour react-pdf (le rapport mensuel). */
export function hex(color: Rgb): string {
  return '#' + color.map(c => c.toString(16).padStart(2, '0')).join('')
}
