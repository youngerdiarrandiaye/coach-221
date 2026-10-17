import React from 'react'
import {
  Document, Page, View, Text, StyleSheet, Svg, Path, Line, Circle, Rect, Font,
} from '@react-pdf/renderer'
import { OBJECTIF_LABELS, METHODE_LABELS } from '@/config/constants'
import {
  getImcZone,
  getFcReposZone,
  getFcEffortZone,
  getMasseGrasseZone,
  getTourTailleZone,
  forecastValue,
  getTendance,
  TENDANCE_META,
  type MetricZone,
  type Tendance,
} from '@/utils/metricZones'
import type { ProgressEntryRow, SessionRow, PaymentRow } from '@/entities'
import { paletteFor, parseTheme, hex, type PdfThemeId, type PdfPalette } from '@/server/pdf/palette'
import { buildReportData, monthLabel, pdfSafe, MOIS_COURTS, type ReportData } from '@/lib/reportData'

// Un mot très long (sans espace) est coupé pour ne jamais déborder de la page.
Font.registerHyphenationCallback(word => (word.length > 22 ? (word.match(/.{1,14}/g) as string[]) : [word]))

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RapportPDFData {
  client: {
    nom:               string
    prenom:            string
    objectif?:         string | null
    taille_cm?:        number | null
    poids_initial_kg?: number | null
    telephone:         string
    sexe?:             string | null
    age?:              number | null
  }
  coachNom?:  string | null
  yearMonth:  string
  entry:      ProgressEntryRow | null
  prevEntry:  ProgressEntryRow | null
  sessions:   Pick<SessionRow, 'titre' | 'date_heure' | 'statut'>[]
  payments:   Pick<PaymentRow, 'montant' | 'methode' | 'description' | 'date_paiement' | 'statut'>[]
  /** Données calculées par la source unique (src/lib/reportData.ts). */
  report?:    ReportData
  /** Message du coach déjà nettoyé (texte brut) ou null. */
  message?:   string | null
  /** Thème des couleurs (nuit par défaut ; valeur inconnue = nuit). */
  theme?:     PdfThemeId
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(ym: string) { return monthLabel(ym) }

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
/** « ven. 17 oct. » (jour Dakar = UTC). */
function fmtDay(value: string) {
  const d = new Date(value.length <= 10 ? value + 'T00:00:00Z' : value)
  if (!Number.isFinite(d.getTime())) return ''
  return `${JOURS_COURTS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`
}
function fmtTime(value: string) {
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''
}
function fmtLongDate(d: Date) { return `${d.getUTCDate()} ${monthLabel(d.toISOString().slice(0, 7))}` }
/** Nombre à la française : virgule décimale, espaces pour les milliers. */
function fmtNum(n: number | null | undefined, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '-'
  const [int, dec = ''] = (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits).split('.')
  const frac = dec.replace(/0+$/, '')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac ? ',' + frac : '')
}
function fmtSigned(n: number | null | undefined, unit = '', digits = 1) {
  if (n == null || !Number.isFinite(n)) return ''
  return `${n > 0 ? '+' : ''}${fmtNum(n, digits)}${unit ? ' ' + unit : ''}`
}

function fmtAmount(n: number) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function deltaInfo(
  curr: number | null | undefined,
  prev: number | null | undefined,
  unit = '',
  inverse = false,
): { text: string; good: boolean | undefined } {
  if (curr == null || prev == null) return { text: '', good: undefined }
  const d = curr - prev
  if (d === 0) return { text: '=', good: undefined }
  const abs  = fmtNum(Math.abs(d), 1)
  const text = `${d > 0 ? '+' : '-'}${abs}${unit ? ` ${unit}` : ''}`
  return { text, good: inverse ? d < 0 : d > 0 }
}

// Pour les couleurs vives, une variante foncée lisible sur blanc
function dk(hex: string): string {
  const MAP: Record<string, string> = {
    '#00FF85': '#006E38',
    '#00CC66': '#005C2E',
    '#4488FF': '#1144BB',
    '#FFD600': '#7A5C00',
    '#FF3B5C': '#BB0028',
    '#FF8C3B': '#AA4A00',
    '#00CFFF': '#006E99',
    '#7B6FFF': '#3B22CC',
    '#9090B8': '#454566',
    '#C8F31D': '#0A0A0A',
  }
  return MAP[hex] ?? '#1A1A3A'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeColors(pal: PdfPalette) {
  // Nuit : valeurs d'origine du rapport (aucune régression visuelle).
  const nuit = pal.id === 'nuit'
  return {
    green:  hex(pal.accent),
    inkDk:  nuit ? '#0A0A0A' : hex(pal.ink),
    red:    '#FF3B5C',
    blue:   '#00CFFF',
    purple: '#7B6FFF',
    yellow: '#FFD600',
    text:   nuit ? '#0D0D20' : hex(pal.ink),
    sub:    nuit ? '#555577' : hex(pal.soft),
    muted:  nuit ? '#888899' : hex(pal.soft),
    border: nuit ? '#E5E5F0' : hex(pal.line),
    rowBdr: nuit ? '#F0F0F8' : hex(pal.zebra),
    bg:     '#FFFFFF',
    band:   nuit ? '#F7F8FC' : hex(pal.zebra),
    msgBg:  nuit ? '#FBFEEF' : hex(pal.panel),
    header: hex(pal.header),
    onHeader: hex(pal.onHeader),
    onHeaderSoft: hex(pal.onHeaderSoft),
    headerAccent: hex(pal.headerAccent),
    ink:    nuit ? '#0A0A0A' : hex(pal.ink),
    grid:   nuit ? '#E5E5F0' : hex(pal.line),
    logoInk: hex(pal.header),
  }
}
type Colors = ReturnType<typeof makeColors>

function makeStyles(C: Colors) {
  return StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    fontFamily:      'Helvetica',
    fontSize:        8,
    color:           C.text,
    paddingBottom:   44,
  },
  miniHead: {
    paddingHorizontal: 22, paddingTop: 12, paddingBottom: 6, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: `0.5pt solid ${C.border}`,
  },

  // Bandeau de marque CoachSen
  brandBand: {
    backgroundColor:   C.header,
    paddingHorizontal: 22,
    paddingVertical:   14,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
  },
  brandRule: { height: 3, backgroundColor: C.green, width: '100%' },
  brandRow:  { flexDirection: 'row', alignItems: 'center' },
  logoTile: {
    width: 26, height: 26, borderRadius: 7, backgroundColor: C.headerAccent,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  brandName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.onHeader },
  brandDot:  { width: 4, height: 4, backgroundColor: C.headerAccent, marginLeft: 2, marginTop: 6 },
  bandTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.onHeader, textAlign: 'right' },
  bandMonth: { fontSize: 9, color: C.headerAccent, textAlign: 'right', textTransform: 'capitalize', marginTop: 2 },
  bandCoach: { fontSize: 7, color: C.onHeaderSoft, textAlign: 'right', marginTop: 2 },
  footBrand: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.text },
  footDot:   { width: 4, height: 4, backgroundColor: C.green, marginRight: 4 },

  // Header
  header: {
    paddingHorizontal: 22,
    paddingVertical:   14,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-end',
    borderBottom:      `1pt solid ${C.border}`,
  },
  clientName: {
    fontSize:    19,
    fontFamily:  'Helvetica-Bold',
    color:       C.text,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize:  7,
    color:     C.muted,
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerMonth: {
    fontSize:    13,
    fontFamily:  'Helvetica-Bold',
    color:       C.inkDk,
    textAlign:   'right',
    textTransform: 'capitalize',
  },
  headerPeriodLabel: {
    fontSize:    6,
    color:       C.muted,
    textAlign:   'right',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerCoach: {
    fontSize:  7,
    color:     C.muted,
    textAlign: 'right',
    marginTop: 3,
  },

  // Client info band
  infoband: {
    backgroundColor:   C.band,
    paddingHorizontal: 22,
    paddingVertical:   7,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    borderBottom:      `1pt solid ${C.border}`,
  },
  infobandText: {
    fontSize: 7,
    color:    C.sub,
  },
  infobandRight: {
    fontSize:  7,
    color:     C.sub,
    textAlign: 'right',
  },

  // Body
  body: {
    paddingHorizontal: 18,
    paddingTop:        10,
  },

  // Two-col row
  twoCol: {
    flexDirection: 'row',
    gap:           10,
  },
  col: {
    flex: 1,
  },

  // Section card
  card: {
    marginBottom:  8,
    border:        `0.5pt solid ${C.border}`,
    borderRadius:  4,
    overflow:      'hidden',
  },
  cardHeader: {
    paddingLeft:     10,
    paddingRight:    12,
    paddingVertical: 5,
    flexDirection:   'row',
    alignItems:      'center',
    borderBottom:    `0.5pt solid ${C.border}`,
  },
  cardHeaderDot: {
    width:        5,
    height:       5,
    borderRadius: 2.5,
    marginRight:  5,
  },
  cardTitle: {
    fontSize:      6.5,
    fontFamily:    'Helvetica-Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  cardNote: {
    fontSize:   6,
    marginLeft: 'auto',
  },
  cardBody: {
    paddingHorizontal: 10,
    paddingVertical:   7,
  },

  // Data row
  dataRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 2.5,
    borderBottom:    `0.5pt solid ${C.rowBdr}`,
  },
  rowLabel: {
    fontSize: 7,
    color:    C.sub,
    flex:     1,
  },
  rowDelta: {
    fontSize:    6.5,
    fontFamily:  'Helvetica-Bold',
    textAlign:   'right',
    minWidth:    36,
    marginRight: 8,
  },
  rowValue: {
    fontSize:   8.5,
    fontFamily: 'Helvetica-Bold',
    color:      C.text,
    textAlign:  'right',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap:           5,
    marginBottom:  6,
  },
  statBox: {
    flex:              1,
    backgroundColor:   C.band,
    borderRadius:      3,
    paddingVertical:   5,
    paddingHorizontal: 6,
    alignItems:        'center',
    border:            `0.5pt solid ${C.border}`,
  },
  statNum: {
    fontSize:   12,
    fontFamily: 'Helvetica-Bold',
    color:      C.text,
  },
  statLabel: {
    fontSize:  6,
    color:     C.muted,
    marginTop: 1,
    textAlign: 'center',
  },

  // Session row
  sessionRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 2.5,
    borderBottom:    `0.5pt solid ${C.rowBdr}`,
  },

  // Badge
  badge: {
    fontSize:          6,
    fontFamily:        'Helvetica-Bold',
    paddingHorizontal: 4,
    paddingVertical:   1.5,
    borderRadius:      2,
  },

  // Footer
  footer: {
    position:       'absolute',
    bottom:         12,
    left:           22,
    right:          22,
    flexDirection:  'row',
    justifyContent: 'space-between',
    borderTop:      `0.5pt solid ${C.border}`,
    paddingTop:     4,
  },
  footerText: {
    fontSize: 6,
    color:    C.muted,
  },
  })
}

/** Texte lisible sur blanc pour une couleur d'aplat : l'accent du thème donne l'encre, jamais l'accent lui-même. */
const dkT = (C: Colors, color: string) => (color === C.green ? C.inkDk : dk(color))

/**
 * Les composants lisent les couleurs et styles du thème par fermeture : une fabrique par thème, mise en cache.
 * (Pas de contexte React : createContext est interdit dans le graphe serveur de Next.js.)
 */
function createRapport(theme: PdfThemeId) {
  const C = makeColors(paletteFor(theme))
  const S = makeStyles(C)
  // ─── Sub-components ───────────────────────────────────────────────────────────

  function SectionCard({ color, title, note, children, breakable }: {
    color:      string
    title:      string
    note?:      string
    children:   React.ReactNode
    breakable?: boolean
  }) {
    const textColor = dkT(C, color)
    return (
      <View wrap={breakable === true} style={[S.card, { borderLeftWidth: 3, borderLeftColor: color, borderLeftStyle: 'solid' }]}>
        <View style={[S.cardHeader, { backgroundColor: color + '0F' }]}>
          <View style={[S.cardHeaderDot, { backgroundColor: color }]} />
          <Text style={[S.cardTitle, { color: textColor }]}>{title}</Text>
          {note && <Text style={[S.cardNote, { color: C.muted }]}>{note}</Text>}
        </View>
        <View style={S.cardBody}>{children}</View>
      </View>
    )
  }

  function DataRow({ label, value, unit, d }: {
    label:  string
    value:  string | number | null | undefined
    unit?:  string
    d?:     { text: string; good: boolean | undefined }
  }) {
    const dColor = d?.good === true ? '#006E38' : d?.good === false ? '#BB0028' : C.muted
    return (
      <View style={S.dataRow}>
        <Text style={S.rowLabel}>{label}</Text>
        {d?.text ? (
          <Text style={[S.rowDelta, { color: dColor }]}>{d.text}</Text>
        ) : (
          <View style={{ minWidth: 36, marginRight: 8 }} />
        )}
        <Text style={S.rowValue}>
          {value != null ? `${value}${unit ? ` ${unit}` : ''}` : '—'}
        </Text>
      </View>
    )
  }

  function ZonePillPDF({ zone, val, unit }: { zone: MetricZone; val: string; unit?: string }) {
    const textColor = dk(zone.color)
    return (
      <View style={{
        backgroundColor: zone.color + '18',
        borderRadius:    3,
        paddingLeft:     4,
        paddingRight:    4,
        paddingTop:      1.5,
        paddingBottom:   1.5,
        flexDirection:   'row',
        alignItems:      'center',
        gap:             3,
      }}>
        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: zone.color }} />
        <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: textColor }}>
          {zone.label}{'  '}{val}{unit ? ` ${unit}` : ''}
        </Text>
      </View>
    )
  }

  function ForecastRowPDF({ label, currentZone, currentVal, unit, delta, predictedZone, predictedVal, tendance }: {
    label:         string
    currentZone:   MetricZone
    currentVal:    string
    unit?:         string
    delta:         number | null
    predictedZone: MetricZone | null
    predictedVal:  string | null
    tendance:      Tendance | null
  }) {
    const tm = tendance ? TENDANCE_META[tendance] : null
    const deltaColor = tendance === 'amélioration' ? '#006E38'
      : tendance === 'attention' ? '#AA4A00'
      : C.muted

    return (
      <View style={{
        flexDirection:   'row',
        alignItems:      'center',
        paddingVertical: 3.5,
        borderBottom:    `0.5pt solid ${C.rowBdr}`,
        gap:             5,
      }}>
        <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.sub, width: 52, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {label}
        </Text>

        <ZonePillPDF zone={currentZone} val={currentVal} unit={unit} />

        {delta !== null && (
          <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: deltaColor, width: 48 }}>
            {delta > 0 ? '+' : ''}{Number.isInteger(delta) ? delta : delta.toFixed(1)}{unit ? ` ${unit}` : ''}/mois
          </Text>
        )}

        {predictedZone && predictedVal && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ fontSize: 6.5, color: C.muted }}>vers</Text>
            <ZonePillPDF zone={predictedZone} val={predictedVal} unit={unit} />
          </View>
        )}

        <View style={{ flex: 1 }} />
        {tm && (
          <View style={{
            backgroundColor: dk('#C8F31D') === dk(tm.color) ? '#006E381A' : tm.color + '18',
            borderRadius:    2,
            paddingLeft:     4,
            paddingRight:    4,
            paddingTop:      1.5,
            paddingBottom:   1.5,
          }}>
            <Text style={{ fontSize: 6, fontFamily: 'Helvetica-Bold', color: dk(tm.color) }}>
              {tm.label}
            </Text>
          </View>
        )}
      </View>
    )
  }

  // ─── Courbes vectorielles (primitives Svg de @react-pdf/renderer) ──────────────

  const CH = { w: 248, h: 104, left: 32, right: 8, top: 14, bottom: 18 }

  /** Échelle « propre » : pas de 1, 2 ou 5 × 10^k, 3 à 5 repères. */
  function niceScale(min: number, max: number, floorZero = false) {
    const span = max - min || Math.max(1, Math.abs(max) * 0.1)
    const raw = span / 3
    const mag = 10 ** Math.floor(Math.log10(raw))
    const step = ([1, 2, 5, 10].find(m => m * mag >= raw) ?? 10) * mag
    const lo = floorZero ? 0 : Math.floor((min - span * 0.1) / step) * step
    let hi = Math.ceil((max + span * 0.12) / step) * step
    if (hi <= lo) hi = lo + step
    const ticks: number[] = []
    for (let t = lo; t <= hi + step / 1000 && ticks.length < 7; t += step) ticks.push(Math.round(t * 1000) / 1000)
    return { lo, hi, ticks, digits: step >= 1 ? 0 : step >= 0.1 ? 1 : 2 }
  }

  function EmptyChart({ text }: { text: string }) {
    return (
      <View style={{ width: CH.w, height: CH.h, alignItems: 'center', justifyContent: 'center', backgroundColor: C.band, borderRadius: 3 }}>
        <Text style={{ fontSize: 7, color: C.muted }}>{text}</Text>
      </View>
    )
  }

  function Axes({ scale, plotTop, plotBottom }: { scale: ReturnType<typeof niceScale>; plotTop: number; plotBottom: number }) {
    return (
      <>
        {scale.ticks.map((t, i) => {
          const y = plotBottom - ((t - scale.lo) / (scale.hi - scale.lo)) * (plotBottom - plotTop)
          return (
            <React.Fragment key={i}>
              <Line x1={CH.left} x2={CH.w - CH.right} y1={y} y2={y} stroke={C.grid} strokeWidth={0.5} />
              <Text x={CH.left - 4} y={y + 2} fill={C.muted} textAnchor="end" style={{ fontSize: 6, fontFamily: 'Helvetica' }}>{fmtNum(t, scale.digits)}</Text>
            </React.Fragment>
          )
        })}
      </>
    )
  }

  /** Courbe : une valeur par point, libellés en abscisse, valeurs au-dessus des points. */
  function LineChart({ points, empty }: { points: { label: string; value: number }[]; empty: string }) {
    if (!points.length) return <EmptyChart text={empty} />
    const values = points.map(p => p.value)
    const scale = niceScale(Math.min(...values), Math.max(...values))
    const lo = scale.lo, hi = scale.hi
    const plotTop = CH.top, plotBottom = CH.h - CH.bottom
    const x = (i: number) => points.length === 1 ? (CH.left + CH.w - CH.right) / 2 : CH.left + 8 + (i * (CH.w - CH.right - CH.left - 16)) / (points.length - 1)
    const y = (v: number) => plotBottom - ((v - lo) / (hi - lo)) * (plotBottom - plotTop)
    const path = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
    return (
      <Svg width={CH.w} height={CH.h} viewBox={`0 0 ${CH.w} ${CH.h}`}>
        <Axes scale={scale} plotTop={plotTop} plotBottom={plotBottom} />
        <Line x1={CH.left} x2={CH.w - CH.right} y1={plotBottom} y2={plotBottom} stroke="#B8B8C8" strokeWidth={0.7} />
        {points.length > 1 && <Path d={path} stroke={C.ink} strokeWidth={1.4} fill="none" />}
        {points.map((p, i) => (
          <React.Fragment key={i}>
            <Circle cx={x(i)} cy={y(p.value)} r={2.8} fill={C.green} stroke={C.ink} strokeWidth={0.9} />
            <Text x={x(i)} y={y(p.value) - 6} fill={C.text} textAnchor="middle" style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold' }}>{fmtNum(p.value, 1)}</Text>
            <Text x={x(i)} y={CH.h - 6} fill={C.sub} textAnchor="middle" style={{ fontSize: 6, fontFamily: 'Helvetica' }}>{p.label}</Text>
          </React.Fragment>
        ))}
      </Svg>
    )
  }

  /** Histogramme : une barre par semaine. */
  function BarChart({ items, empty, digits = 0 }: { items: { label: string; value: number }[]; empty: string; digits?: number }) {
    if (!items.length || items.every(i => i.value === 0)) return <EmptyChart text={empty} />
    const scale = niceScale(0, Math.max(...items.map(i => i.value)), true)
    const hi = scale.hi
    const plotTop = CH.top, plotBottom = CH.h - CH.bottom
    const slot = (CH.w - CH.right - CH.left) / items.length
    const bw = Math.min(26, slot * 0.58)
    return (
      <Svg width={CH.w} height={CH.h} viewBox={`0 0 ${CH.w} ${CH.h}`}>
        <Axes scale={scale} plotTop={plotTop} plotBottom={plotBottom} />
        <Line x1={CH.left} x2={CH.w - CH.right} y1={plotBottom} y2={plotBottom} stroke="#B8B8C8" strokeWidth={0.7} />
        {items.map((it, i) => {
          const cx = CH.left + slot * i + slot / 2
          const h = (it.value / hi) * (plotBottom - plotTop)
          return (
            <React.Fragment key={i}>
              {it.value > 0 && <Rect x={cx - bw / 2} y={plotBottom - h} width={bw} height={h} fill={C.green} stroke={C.ink} strokeWidth={0.7} />}
              <Text x={cx} y={plotBottom - h - 3} fill={C.text} textAnchor="middle" style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold' }}>{fmtNum(it.value, digits)}</Text>
              <Text x={cx} y={CH.h - 6} fill={C.sub} textAnchor="middle" style={{ fontSize: 6, fontFamily: 'Helvetica' }}>{it.label}</Text>
            </React.Fragment>
          )
        })}
      </Svg>
    )
  }

  /** Évolution d'une mensuration : cercle vide au début du mois, cercle plein à la fin. */
  function MensurationRow({ m }: { m: ReportData['mensurations'][number] }) {
    const w = 96, h = 14
    const a = m.debut ?? m.fin ?? 0, b = m.fin ?? m.debut ?? 0
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const pos = (v: number) => hi === lo ? w / 2 : 8 + ((v - lo) / (hi - lo)) * (w - 16)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2.5, borderBottom: `0.5pt solid ${C.rowBdr}` }} wrap={false}>
        <Text style={{ fontSize: 7, color: C.sub, width: 62 }}>{m.label}</Text>
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={8} x2={w - 8} y1={h / 2} y2={h / 2} stroke="#B8B8C8" strokeWidth={0.8} />
          <Circle cx={pos(a)} cy={h / 2} r={3} fill="#FFFFFF" stroke={C.ink} strokeWidth={1} />
          {m.delta !== null && <Circle cx={pos(b)} cy={h / 2} r={3} fill={C.green} stroke={C.ink} strokeWidth={1} />}
        </Svg>
        <Text style={{ fontSize: 7, color: C.text, fontFamily: 'Helvetica-Bold', flex: 1, textAlign: 'right' }}>
          {m.delta === null ? `${fmtNum(m.fin)} ${m.unit}` : `${fmtNum(m.debut)} / ${fmtNum(m.fin)} ${m.unit}`}
        </Text>
        <Text style={{ fontSize: 6.5, color: C.sub, width: 40, textAlign: 'right' }}>{m.delta === null ? '' : m.delta === 0 ? '=' : fmtSigned(m.delta, '', 1)}</Text>
      </View>
    )
  }

  // ─── Synthèse, listes ─────────────────────────────────────────────────────────

  function StatBox({ value, label, sub }: { value: string; label: string; sub?: string }) {
    return (
      <View style={S.statBox}>
        <Text style={[S.statNum, { color: C.text }]}>{value}</Text>
        <Text style={S.statLabel}>{label}</Text>
        {sub ? <Text style={{ fontSize: 6, color: C.sub, marginTop: 1, textAlign: 'center' }}>{sub}</Text> : null}
      </View>
    )
  }

  function ListTitle({ color, title, note }: { color: string; title: string; note?: string }) {
    return (
      <View minPresenceAhead={46} wrap={false} style={[S.cardHeader, { backgroundColor: color + '0F', borderLeftWidth: 3, borderLeftColor: color, borderLeftStyle: 'solid', marginTop: 4, borderTop: `0.5pt solid ${C.border}` }]}>
        <View style={[S.cardHeaderDot, { backgroundColor: color }]} />
        <Text style={[S.cardTitle, { color: dkT(C, color) }]}>{title}</Text>
        {note ? <Text style={[S.cardNote, { color: C.muted }]}>{note}</Text> : null}
      </View>
    )
  }

  const TYPE_LABELS: Record<string, string> = { '1RM': '1RM estimé', CHARGE: 'Charge maximale', REPS: 'Répétitions maximales' }
  const STATUT_PAIEMENT: Record<string, string> = { PAYE: 'Payé', EN_ATTENTE: 'En attente', ANNULE: 'Annulé' }

  function Row({ cells, zebra }: { cells: React.ReactNode[]; zebra: boolean }) {
    return (
      <View wrap={false} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, backgroundColor: zebra ? C.band : '#FFFFFF', borderBottom: `0.5pt solid ${C.rowBdr}` }}>
        {cells}
      </View>
    )
  }


  function RapportContent({ data }: { data: RapportPDFData }) {
    const { client, coachNom, yearMonth, entry: e, prevEntry: ep, sessions, payments, message } = data
    // Sans données calculées (ancien appelant), le rapport est reconstruit avec ce que l'on a : séances et mesures.
    const report = data.report ?? buildReportData({
      client: { id: '', prenom: client.prenom, nom: client.nom, objectif: client.objectif ?? null },
      month: yearMonth, coach: coachNom ?? null, sessions, logs: [], exercises: [],
      progress: [e, ep].filter((x): x is ProgressEntryRow => x !== null),
    })
    const kpis = report.kpis

    const sexe = client.sexe as 'HOMME' | 'FEMME' | null
    const age  = client.age ?? null
    const coach = pdfSafe(coachNom ?? '')
    const fullName = pdfSafe(`${client.prenom} ${client.nom}`)
    const phone = pdfSafe(client.telephone)

    const paidPayments = payments.filter(p => p.statut === 'PAYE')
    const totalPaye    = paidPayments.reduce((s, p) => s + Number(p.montant), 0)

    const generatedAt = fmtLongDate(new Date())

    // ── Prévisions ──────────────────────────────────────────────────────────────
    const forecastRows: React.ReactNode[] = []

    if (e?.imc != null) {
      const cz = getImcZone(e.imc)
      const pv = forecastValue(e.imc, ep?.imc)
      const pz = pv != null ? getImcZone(pv) : null
      forecastRows.push(
        <ForecastRowPDF key="imc" label="IMC"
          currentZone={cz} currentVal={String(e.imc)} unit=""
          delta={ep?.imc != null ? parseFloat((e.imc - ep.imc).toFixed(1)) : null}
          predictedZone={pz} predictedVal={pv != null ? String(pv) : null}
          tendance={pz ? getTendance(cz.level, pz.level) : null}
        />
      )
    }
    if (e?.frequence_cardiaque_repos_bpm != null) {
      const cz = getFcReposZone(e.frequence_cardiaque_repos_bpm, sexe)
      const pv = forecastValue(e.frequence_cardiaque_repos_bpm, ep?.frequence_cardiaque_repos_bpm)
      const pz = pv != null ? getFcReposZone(Math.round(pv), sexe) : null
      forecastRows.push(
        <ForecastRowPDF key="fc-r" label="FC repos"
          currentZone={cz} currentVal={String(e.frequence_cardiaque_repos_bpm)} unit="bpm"
          delta={ep?.frequence_cardiaque_repos_bpm != null
            ? e.frequence_cardiaque_repos_bpm - ep.frequence_cardiaque_repos_bpm : null}
          predictedZone={pz} predictedVal={pv != null ? String(Math.round(pv)) : null}
          tendance={pz ? getTendance(cz.level, pz.level) : null}
        />
      )
    }
    if (e?.masse_grasse_pct != null) {
      const cz = getMasseGrasseZone(e.masse_grasse_pct, sexe)
      const pv = forecastValue(e.masse_grasse_pct, ep?.masse_grasse_pct)
      const pz = pv != null ? getMasseGrasseZone(pv, sexe) : null
      forecastRows.push(
        <ForecastRowPDF key="mg" label="% graisse"
          currentZone={cz} currentVal={String(e.masse_grasse_pct)} unit="%"
          delta={ep?.masse_grasse_pct != null
            ? parseFloat((e.masse_grasse_pct - ep.masse_grasse_pct).toFixed(1)) : null}
          predictedZone={pz} predictedVal={pv != null ? String(pv) : null}
          tendance={pz ? getTendance(cz.level, pz.level) : null}
        />
      )
    }
    if (e?.tour_taille_cm != null) {
      const cz = getTourTailleZone(e.tour_taille_cm, sexe)
      const pv = forecastValue(e.tour_taille_cm, ep?.tour_taille_cm)
      const pz = pv != null ? getTourTailleZone(pv, sexe) : null
      forecastRows.push(
        <ForecastRowPDF key="tt" label="Tour taille"
          currentZone={cz} currentVal={String(e.tour_taille_cm)} unit="cm"
          delta={ep?.tour_taille_cm != null
            ? parseFloat((e.tour_taille_cm - ep.tour_taille_cm).toFixed(1)) : null}
          predictedZone={pz} predictedVal={pv != null ? String(pv) : null}
          tendance={pz ? getTendance(cz.level, pz.level) : null}
        />
      )
    }
    if (e?.frequence_cardiaque_effort_bpm != null && age != null) {
      const cz = getFcEffortZone(e.frequence_cardiaque_effort_bpm, age)
      const pv = forecastValue(e.frequence_cardiaque_effort_bpm, ep?.frequence_cardiaque_effort_bpm)
      const pz = pv != null ? getFcEffortZone(Math.round(pv), age) : null
      forecastRows.push(
        <ForecastRowPDF key="fc-e" label="FC effort"
          currentZone={cz} currentVal={String(e.frequence_cardiaque_effort_bpm)} unit="bpm"
          delta={ep?.frequence_cardiaque_effort_bpm != null
            ? e.frequence_cardiaque_effort_bpm - ep.frequence_cardiaque_effort_bpm : null}
          predictedZone={pz} predictedVal={pv != null ? String(Math.round(pv)) : null}
          tendance={null}
        />
      )
    }

    const hasProgress = e !== null
    const hasCardio   = e?.frequence_cardiaque_repos_bpm != null || e?.frequence_cardiaque_effort_bpm != null
    const hasMensur   = e?.tour_taille_cm != null || e?.hanches_cm != null || e?.bras_cm != null || e?.cuisse_cm != null
    const hasCompo    = e?.poids_kg != null || e?.imc != null || e?.masse_grasse_pct != null
    const hasZones    = hasCompo || hasCardio || hasMensur
    const MAX_RECORDS_SHOWN = 30

    return (
      <Document
        title={pdfSafe(`Rapport ${fmtMonth(yearMonth)} - ${client.prenom} ${client.nom}`)}
        author={coach || 'CoachSen'}
      >
        <Page size="A4" style={S.page}>

          {/* ── En-tête réduit des pages suivantes ── */}
          <View fixed render={({ pageNumber }) => pageNumber > 1 ? (
            <View style={S.miniHead}>
              <View style={S.brandRow}>
                <View style={S.footDot} />
                <Text style={S.footBrand}>coachsen</Text>
              </View>
              <Text style={S.footerText}>Rapport de performance · {fullName} · {fmtMonth(yearMonth)}</Text>
            </View>
          ) : null} />

          {/* ── Bandeau de marque ── */}
          <View style={S.brandBand}>
            <View style={S.brandRow}>
              <View style={S.logoTile}>
                <Svg viewBox="0 0 512 512" style={{ width: 16, height: 16 }}>
                  <Path d="M296 40 104 296h122l-30 176 212-282H292z" fill={C.logoInk} />
                </Svg>
              </View>
              <Text style={S.brandName}>coachsen</Text>
              <View style={S.brandDot} />
            </View>
            <View>
              <Text style={S.bandTitle}>Rapport de performance</Text>
              <Text style={S.bandMonth}>{fmtMonth(yearMonth)}</Text>
              {coach !== '' && <Text style={S.bandCoach}>{coach}</Text>}
            </View>
          </View>
          <View style={S.brandRule} />

          {/* ── Titre : le client ── */}
          <View style={S.header}>
            <View style={{ flex: 1 }}>
              <Text style={S.clientName}>{fullName}</Text>
              {client.objectif ? <Text style={S.headerSub}>{OBJECTIF_LABELS[client.objectif] ?? client.objectif}</Text> : null}
            </View>
          </View>

          {/* ── Info band ── */}
          <View style={S.infoband}>
            <View>
              {client.objectif && (
                <Text style={S.infobandText}>
                  Objectif : {OBJECTIF_LABELS[client.objectif] ?? client.objectif}
                </Text>
              )}
              {client.taille_cm && (
                <Text style={S.infobandText}>Taille : {client.taille_cm} cm</Text>
              )}
            </View>
            <View>
              <Text style={S.infobandRight}>{phone}</Text>
              {(sexe ?? '') !== '' && (
                <Text style={[S.infobandRight, { marginTop: 1 }]}>
                  {sexe === 'HOMME' ? 'Homme' : 'Femme'}{age ? `  ·  ${age} ans` : ''}
                </Text>
              )}
            </View>
          </View>

          <View style={S.body}>

            {/* ── Synthèse du mois ── */}
            <View wrap={false}>
              <SectionCard color={C.green} title="Synthèse du mois" note={fmtMonth(yearMonth)}>
                <View style={S.statsGrid}>
                  <StatBox value={String(kpis.seances_effectuees)} label="Séances effectuées"
                    sub={kpis.seances_planifiees || kpis.seances_annulees ? `${kpis.seances_planifiees} prévues · ${kpis.seances_annulees} annulées` : undefined} />
                  <StatBox value={kpis.taux_presence !== null ? `${kpis.taux_presence} %` : '-'} label="Présence" />
                  <StatBox value={fmtNum(kpis.volume_kg, 0)} label="Volume (kg)" sub={`${kpis.series} série${kpis.series > 1 ? 's' : ''}`} />
                  <StatBox value={String(kpis.records)} label={kpis.records > 1 ? 'Records battus' : 'Record battu'} />
                  <StatBox value={kpis.poids_fin !== null ? `${fmtNum(kpis.poids_fin)} kg` : '-'} label="Poids fin de mois"
                    sub={kpis.delta_poids !== null ? `${fmtSigned(kpis.delta_poids, 'kg')} sur le mois` : undefined} />
                </View>
              </SectionCard>
            </View>

            {/* ── Message du coach ── */}
            {message ? (
              <View minPresenceAhead={90} style={[S.card, { borderLeftWidth: 3, borderLeftColor: C.green, borderLeftStyle: 'solid', backgroundColor: C.msgBg }]}>
                <View style={S.cardHeader}>
                  <View style={[S.cardHeaderDot, { backgroundColor: C.green }]} />
                  <Text style={[S.cardTitle, { color: C.text }]}>Message de votre coach</Text>
                </View>
                <View style={S.cardBody}>
                  <Text style={{ fontSize: 8.5, color: C.text, lineHeight: 1.5 }}>{message}</Text>
                  {coach !== '' && <Text style={{ fontSize: 7, color: C.sub, marginTop: 5, fontFamily: 'Helvetica-Bold' }}>{coach}</Text>}
                </View>
              </View>
            ) : null}

            {/* ── Courbes ── */}
            <View style={S.twoCol} wrap={false}>
              <View style={S.col}>
                <SectionCard color={C.blue} title="Poids sur 6 mois" note="kg, moyenne mensuelle">
                  <LineChart points={report.poids} empty="Aucune mesure de poids sur 6 mois" />
                </SectionCard>
              </View>
              <View style={S.col}>
                <SectionCard color={C.green} title="Volume par semaine" note="kg soulevés">
                  <BarChart items={report.weeks.map(w => ({ label: w.label, value: w.volume_kg }))} empty="Aucune série saisie ce mois-ci" />
                </SectionCard>
              </View>
            </View>
            <View style={S.twoCol} wrap={false}>
              <View style={S.col}>
                <SectionCard color={C.purple} title="Séances par semaine" note="séances effectuées">
                  <BarChart items={report.weeks.map(w => ({ label: w.label, value: w.seances_effectuees }))} empty="Aucune séance effectuée ce mois-ci" />
                </SectionCard>
              </View>
              <View style={S.col}>
                <SectionCard color={C.blue} title="Évolution des mensurations" note="cercle vide : début, plein : fin">
                  {report.mensurations.length
                    ? report.mensurations.map(m => <MensurationRow key={m.key} m={m} />)
                    : <EmptyChart text="Aucune mensuration ce mois-ci" />}
                </SectionCard>
              </View>
            </View>

            {/* ── Records battus ── */}
            {report.records.length > 0 && (
              <View>
                <ListTitle color={C.green} title="Records battus ce mois-ci" note={`${report.records.length} record${report.records.length > 1 ? 's' : ''}`} />
                {report.records.slice(0, MAX_RECORDS_SHOWN).map((r, i) => (
                  <Row key={i} zebra={i % 2 === 1} cells={[
                    <Text key="d" style={{ fontSize: 7, color: C.sub, width: 62 }}>{fmtDay(r.date)}</Text>,
                    <Text key="e" style={{ fontSize: 7.5, color: C.text, flex: 1, fontFamily: 'Helvetica-Bold', paddingRight: 6 }}>{pdfSafe(r.exercice)}</Text>,
                    <Text key="t" style={{ fontSize: 7, color: C.sub, width: 100 }}>{TYPE_LABELS[r.type] ?? r.type}</Text>,
                    <Text key="v" style={{ fontSize: 7.5, color: C.text, width: 60, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{fmtNum(r.value, 1)} {r.type === 'REPS' ? 'rép.' : 'kg'}</Text>,
                  ]} />
                ))}
                {report.records.length > MAX_RECORDS_SHOWN && (
                  <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 3, paddingHorizontal: 8 }}>+{report.records.length - MAX_RECORDS_SHOWN} autres records</Text>
                )}
              </View>
            )}

            {/* ── État & prévision ── */}
            {hasProgress && forecastRows.length > 0 && (
              <View wrap={false} style={{ marginTop: 8 }}>
                <SectionCard color={C.blue} title="État et prévision"
                  note="Projection du mois suivant, tendance linéaire">
                  {forecastRows}
                </SectionCard>
              </View>
            )}

            {/* ── Deux colonnes : composition + cardio | mensurations ── */}
            {hasZones && (
              <View style={S.twoCol} wrap={false}>
                <View style={S.col}>
                  {hasCompo && (
                    <SectionCard color={C.green} title="Composition corporelle">
                      {e!.poids_kg != null && (
                        <DataRow label="Poids" value={fmtNum(e!.poids_kg)} unit="kg"
                          d={deltaInfo(e!.poids_kg, ep?.poids_kg, 'kg', true)} />
                      )}
                      {e!.imc != null && (
                        <DataRow label="IMC" value={fmtNum(e!.imc)}
                          d={deltaInfo(e!.imc, ep?.imc, '', true)} />
                      )}
                      {e!.imc != null && (
                        <DataRow label="Zone IMC" value={getImcZone(e!.imc).label} />
                      )}
                      {e!.masse_grasse_pct != null && (
                        <DataRow label="% masse grasse" value={fmtNum(e!.masse_grasse_pct)} unit="%"
                          d={deltaInfo(e!.masse_grasse_pct, ep?.masse_grasse_pct, '%', true)} />
                      )}
                      {client.poids_initial_kg != null && (
                        <DataRow label="Poids initial" value={fmtNum(Number(client.poids_initial_kg))} unit="kg" />
                      )}
                    </SectionCard>
                  )}
                  {hasCardio && (
                    <SectionCard color={C.red} title="Cardio">
                      {e!.frequence_cardiaque_repos_bpm != null && (
                        <>
                          <DataRow label="FC repos" value={e!.frequence_cardiaque_repos_bpm} unit="bpm"
                            d={deltaInfo(e!.frequence_cardiaque_repos_bpm, ep?.frequence_cardiaque_repos_bpm, 'bpm', true)} />
                          <DataRow label="Zone" value={getFcReposZone(e!.frequence_cardiaque_repos_bpm, sexe).label} />
                        </>
                      )}
                      {e!.frequence_cardiaque_effort_bpm != null && (
                        <>
                          <DataRow label="FC effort" value={e!.frequence_cardiaque_effort_bpm} unit="bpm"
                            d={deltaInfo(e!.frequence_cardiaque_effort_bpm, ep?.frequence_cardiaque_effort_bpm, 'bpm')} />
                          {age != null && (
                            <DataRow label="Zone effort" value={getFcEffortZone(e!.frequence_cardiaque_effort_bpm, age).label} />
                          )}
                        </>
                      )}
                      {age != null && (
                        <DataRow label="FCmax (220 - âge)" value={220 - age} unit="bpm" />
                      )}
                    </SectionCard>
                  )}
                </View>
                <View style={S.col}>
                  {hasMensur && (
                    <SectionCard color={C.blue} title="Mensurations">
                      {e!.tour_taille_cm != null && (
                        <>
                          <DataRow label="Tour de taille" value={fmtNum(e!.tour_taille_cm)} unit="cm"
                            d={deltaInfo(e!.tour_taille_cm, ep?.tour_taille_cm, 'cm', true)} />
                          <DataRow label="Risque cardio" value={getTourTailleZone(e!.tour_taille_cm, sexe).label} />
                        </>
                      )}
                      {e!.hanches_cm != null && (
                        <DataRow label="Hanches" value={fmtNum(e!.hanches_cm)} unit="cm"
                          d={deltaInfo(e!.hanches_cm, ep?.hanches_cm, 'cm')} />
                      )}
                      {e!.bras_cm != null && (
                        <DataRow label="Bras" value={fmtNum(e!.bras_cm)} unit="cm"
                          d={deltaInfo(e!.bras_cm, ep?.bras_cm, 'cm')} />
                      )}
                      {e!.cuisse_cm != null && (
                        <DataRow label="Cuisse" value={fmtNum(e!.cuisse_cm)} unit="cm"
                          d={deltaInfo(e!.cuisse_cm, ep?.cuisse_cm, 'cm')} />
                      )}
                    </SectionCard>
                  )}
                </View>
              </View>
            )}

            {/* ── Séances du mois (toutes, sans coupure de ligne) ── */}
            {sessions.length > 0 && (
              <View>
                <ListTitle color={C.purple} title="Séances du mois"
                  note={`${sessions.length} séance${sessions.length > 1 ? 's' : ''}`} />
                {sessions.map((s, i) => (
                  <Row key={i} zebra={i % 2 === 1} cells={[
                    <Text key="d" style={{ fontSize: 7, color: C.sub, width: 62 }}>{fmtDay(s.date_heure)}</Text>,
                    <Text key="h" style={{ fontSize: 7, color: C.muted, width: 32 }}>{fmtTime(s.date_heure)}</Text>,
                    <Text key="t" style={{ fontSize: 7.5, color: C.text, flex: 1, paddingRight: 6 }}>{pdfSafe(s.titre)}</Text>,
                    <View key="s" style={{ width: 50, alignItems: 'flex-end' }}>
                      <Text style={[
                        S.badge,
                        s.statut === 'EFFECTUEE'
                          ? { color: C.inkDk,  backgroundColor: C.green  + '1A' }
                          : s.statut === 'ANNULEE'
                          ? { color: dk(C.red),    backgroundColor: C.red    + '1A' }
                          : { color: dk(C.purple), backgroundColor: C.purple + '1A' },
                      ]}>
                        {s.statut === 'EFFECTUEE' ? 'Faite' : s.statut === 'ANNULEE' ? 'Annulée' : 'Prévue'}
                      </Text>
                    </View>,
                  ]} />
                ))}
              </View>
            )}

            {/* ── Paiements ── */}
            {payments.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <ListTitle color={C.yellow} title="Paiements du mois"
                  note={totalPaye > 0 ? `Total encaissé : ${fmtAmount(totalPaye)} FCFA` : undefined} />
                {payments.map((p, i) => (
                  <Row key={i} zebra={i % 2 === 1} cells={[
                    <Text key="d" style={{ fontSize: 7, color: C.sub, width: 62 }}>{fmtDay(String(p.date_paiement))}</Text>,
                    <Text key="t" style={{ fontSize: 7.5, color: C.text, flex: 1, paddingRight: 6 }}>
                      {pdfSafe(p.description || METHODE_LABELS[String(p.methode)] || String(p.methode))}
                    </Text>,
                    <Text key="m" style={{ fontSize: 7, color: C.sub, width: 62 }}>{METHODE_LABELS[String(p.methode)] ?? ''}</Text>,
                    <Text key="s" style={{ fontSize: 7, color: C.sub, width: 52 }}>{STATUT_PAIEMENT[String(p.statut)] ?? ''}</Text>,
                    <Text key="a" style={{ fontSize: 7.5, color: C.text, width: 66, textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{fmtAmount(Number(p.montant))} FCFA</Text>,
                  ]} />
                ))}
              </View>
            )}

            {/* ── Notes ── */}
            {e?.notes ? (
              <View style={{ marginTop: 8 }}>
                <SectionCard color={C.muted} title="Notes du coach" breakable>
                  <Text style={{ fontSize: 8, color: C.sub, lineHeight: 1.5 }}>{pdfSafe(e.notes)}</Text>
                </SectionCard>
              </View>
            ) : null}

          </View>

          {/* ── Pied de page paginé ── */}
          <View style={S.footer} fixed>
            <View style={S.brandRow}>
              <View style={S.footDot} />
              <Text style={S.footBrand}>coachsen</Text>
            </View>
            <Text style={S.footerText}>{coach || 'CoachSen'} · Confidentiel · généré le {generatedAt}</Text>
            <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} sur ${totalPages}`} />
          </View>

        </Page>
      </Document>
    )
  }

  return RapportContent
}

const contents = new Map<PdfThemeId, ReturnType<typeof createRapport>>()

// ─── PDF Document ─────────────────────────────────────────────────────────────
export function RapportDocument({ data }: { data: RapportPDFData }) {
  const theme = parseTheme(data.theme)
  let Content = contents.get(theme)
  if (!Content) { Content = createRapport(theme); contents.set(theme, Content) }
  return <Content data={data} />
}
