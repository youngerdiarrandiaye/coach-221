'use client'

/**
 * MetricNorms — référentiels médicaux/sportifs par métrique.
 * Affiche les zones de normalité en chips colorés.
 * Sources : OMS, ACSM, Harvard Health.
 */

type Sexe = 'HOMME' | 'FEMME' | null | undefined

interface Zone {
  label:  string
  range:  string
  color:  string   // text + border
  bg:     string   // background rgba
  dot:    string   // dot color
}

// ─── Données de référence ─────────────────────────────────────────────────────

const IMC_ZONES: Zone[] = [
  { label: 'Sous-poids', range: '< 18.5',     color: '#4488FF', bg: 'rgba(68,136,255,0.13)',  dot: '#4488FF' },
  { label: 'Normal',     range: '18.5 – 24.9', color: '#00CC66', bg: 'rgba(0,204,102,0.13)',   dot: '#00CC66' },
  { label: 'Surpoids',   range: '25 – 29.9',   color: '#FFD600', bg: 'rgba(255,214,0,0.13)',   dot: '#FFD600' },
  { label: 'Obésité',    range: '≥ 30',         color: '#FF3B5C', bg: 'rgba(255,59,92,0.13)',   dot: '#FF3B5C' },
]

const FC_REPOS_H: Zone[] = [
  { label: 'Athlète',     range: '< 50 bpm',  color: '#00FF85', bg: 'rgba(0,255,133,0.12)',  dot: '#00FF85' },
  { label: 'Excellent',   range: '50–55',      color: '#00CC66', bg: 'rgba(0,204,102,0.12)',  dot: '#00CC66' },
  { label: 'Bien',        range: '56–61',      color: '#00CFFF', bg: 'rgba(0,207,255,0.12)',  dot: '#00CFFF' },
  { label: 'Moyen',       range: '62–65',      color: '#FFD600', bg: 'rgba(255,214,0,0.12)',  dot: '#FFD600' },
  { label: 'Insuffisant', range: '≥ 66',       color: '#FF3B5C', bg: 'rgba(255,59,92,0.12)',  dot: '#FF3B5C' },
]
const FC_REPOS_F: Zone[] = [
  { label: 'Athlète',     range: '< 55 bpm',  color: '#00FF85', bg: 'rgba(0,255,133,0.12)',  dot: '#00FF85' },
  { label: 'Excellent',   range: '55–59',      color: '#00CC66', bg: 'rgba(0,204,102,0.12)',  dot: '#00CC66' },
  { label: 'Bien',        range: '60–64',      color: '#00CFFF', bg: 'rgba(0,207,255,0.12)',  dot: '#00CFFF' },
  { label: 'Moyen',       range: '65–69',      color: '#FFD600', bg: 'rgba(255,214,0,0.12)',  dot: '#FFD600' },
  { label: 'Insuffisant', range: '≥ 70',       color: '#FF3B5C', bg: 'rgba(255,59,92,0.12)',  dot: '#FF3B5C' },
]

const FC_EFFORT_ZONES: Zone[] = [
  { label: 'Z1 · Récup.',    range: '50–60%', color: '#4488FF', bg: 'rgba(68,136,255,0.12)',  dot: '#4488FF' },
  { label: 'Z2 · Endurance', range: '60–70%', color: '#00CC66', bg: 'rgba(0,204,102,0.12)',   dot: '#00CC66' },
  { label: 'Z3 · Aérobie',   range: '70–80%', color: '#FFD600', bg: 'rgba(255,214,0,0.12)',   dot: '#FFD600' },
  { label: 'Z4 · Anaérobie', range: '80–90%', color: '#FF8C3B', bg: 'rgba(255,140,59,0.12)',  dot: '#FF8C3B' },
  { label: 'Z5 · Max',       range: '90–100%',color: '#FF3B5C', bg: 'rgba(255,59,92,0.12)',   dot: '#FF3B5C' },
]

const GRAISSE_H: Zone[] = [
  { label: 'Athlète',    range: '6–13%',   color: '#00FF85', bg: 'rgba(0,255,133,0.12)',  dot: '#00FF85' },
  { label: 'Fitness',    range: '14–17%',  color: '#00CC66', bg: 'rgba(0,204,102,0.12)',  dot: '#00CC66' },
  { label: 'Acceptable', range: '18–24%',  color: '#FFD600', bg: 'rgba(255,214,0,0.12)',  dot: '#FFD600' },
  { label: 'Obèse',      range: '≥ 25%',   color: '#FF3B5C', bg: 'rgba(255,59,92,0.12)',  dot: '#FF3B5C' },
]
const GRAISSE_F: Zone[] = [
  { label: 'Athlète',    range: '14–20%',  color: '#00FF85', bg: 'rgba(0,255,133,0.12)',  dot: '#00FF85' },
  { label: 'Fitness',    range: '21–24%',  color: '#00CC66', bg: 'rgba(0,204,102,0.12)',  dot: '#00CC66' },
  { label: 'Acceptable', range: '25–31%',  color: '#FFD600', bg: 'rgba(255,214,0,0.12)',  dot: '#FFD600' },
  { label: 'Obèse',      range: '≥ 32%',   color: '#FF3B5C', bg: 'rgba(255,59,92,0.12)',  dot: '#FF3B5C' },
]

// Tour de taille — risque cardio-vasculaire (OMS)
const TAILLE_H: Zone[] = [
  { label: 'Risque faible', range: '< 94 cm',    color: '#00CC66', bg: 'rgba(0,204,102,0.12)',  dot: '#00CC66' },
  { label: 'Risque élevé',  range: '94–102 cm',  color: '#FFD600', bg: 'rgba(255,214,0,0.12)',  dot: '#FFD600' },
  { label: 'Risque majeur', range: '> 102 cm',   color: '#FF3B5C', bg: 'rgba(255,59,92,0.12)',  dot: '#FF3B5C' },
]
const TAILLE_F: Zone[] = [
  { label: 'Risque faible', range: '< 80 cm',    color: '#00CC66', bg: 'rgba(0,204,102,0.12)',  dot: '#00CC66' },
  { label: 'Risque élevé',  range: '80–88 cm',   color: '#FFD600', bg: 'rgba(255,214,0,0.12)',  dot: '#FFD600' },
  { label: 'Risque majeur', range: '> 88 cm',    color: '#FF3B5C', bg: 'rgba(255,59,92,0.12)',  dot: '#FF3B5C' },
]

// ─── Zone chip ────────────────────────────────────────────────────────────────

function ZoneChip({ z }: { z: Zone }) {
  return (
    <div
      className="flex flex-col items-center rounded-xl px-2.5 py-1.5 shrink-0 text-center"
      style={{ background: z.bg, border: `1px solid ${z.color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full mb-1 shrink-0" style={{ background: z.dot }} />
      <span className="text-[10px] font-black leading-tight whitespace-nowrap" style={{ color: z.color }}>
        {z.label}
      </span>
      <span className="text-[9px] leading-tight mt-0.5 tabular-nums" style={{ color: `${z.color}BB` }}>
        {z.range}
      </span>
    </div>
  )
}

// ─── Row de zones ─────────────────────────────────────────────────────────────

function ZoneRow({ label, zones }: { label?: string; zones: Zone[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {label && (
        <span className="text-[10px] font-black shrink-0 w-4" style={{ color: '#6A6A9A' }}>
          {label}
        </span>
      )}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {zones.map(z => <ZoneChip key={z.label} z={z} />)}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  type:  'poids' | 'imc' | 'mensurations' | 'masse_grasse' | 'fc_repos' | 'fc_effort'
  sexe?: Sexe
  age?:  number | null
}

export function MetricNorms({ type, sexe, age }: Props) {
  const isH = sexe === 'HOMME'
  const isF = sexe === 'FEMME'

  // ── IMC ────────────────────────────────────────────────────────────────────
  if (type === 'imc') {
    return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Zones OMS
        </p>
        <ZoneRow zones={IMC_ZONES} />
      </div>
    )
  }

  // ── FC Repos ───────────────────────────────────────────────────────────────
  if (type === 'fc_repos') {
    if (isH) return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Référence homme · bpm
        </p>
        <ZoneRow zones={FC_REPOS_H} />
      </div>
    )
    if (isF) return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Référence femme · bpm
        </p>
        <ZoneRow zones={FC_REPOS_F} />
      </div>
    )
    // Pas de genre renseigné → afficher H et F
    return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Référence ACSM · bpm
        </p>
        <ZoneRow label="♂" zones={FC_REPOS_H} />
        <ZoneRow label="♀" zones={FC_REPOS_F} />
      </div>
    )
  }

  // ── FC Effort ──────────────────────────────────────────────────────────────
  if (type === 'fc_effort') {
    const fcmax = age ? 220 - age : null
    return (
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center gap-3">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
            Zones d’intensité (% FCmax)
          </p>
          {fcmax && (
            <span
              className="rounded-lg px-2 py-0.5 text-[10px] font-black tabular-nums"
              style={{ background: 'rgba(255,59,92,0.15)', color: '#FF3B5C', border: '1px solid rgba(255,59,92,0.30)' }}
            >
              FCmax ≈ {fcmax} bpm
            </span>
          )}
        </div>
        <ZoneRow zones={FC_EFFORT_ZONES} />
        {!fcmax && (
          <p className="text-[9px]" style={{ color: '#3A3A5A' }}>
            FCmax estimée = 220 − âge (Haskell &amp; Fox)
          </p>
        )}
      </div>
    )
  }

  // ── Masse grasse ───────────────────────────────────────────────────────────
  if (type === 'masse_grasse') {
    if (isH) return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Référence homme · % graisse
        </p>
        <ZoneRow zones={GRAISSE_H} />
      </div>
    )
    if (isF) return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Référence femme · % graisse
        </p>
        <ZoneRow zones={GRAISSE_F} />
      </div>
    )
    return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Composition corporelle · % graisse
        </p>
        <ZoneRow label="♂" zones={GRAISSE_H} />
        <ZoneRow label="♀" zones={GRAISSE_F} />
      </div>
    )
  }

  // ── Mensurations (focus : tour de taille cardio) ────────────────────────────
  if (type === 'mensurations') {
    if (isH) return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Tour de taille — risque cardiovasculaire · homme
        </p>
        <ZoneRow zones={TAILLE_H} />
      </div>
    )
    if (isF) return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Tour de taille — risque cardiovasculaire · femme
        </p>
        <ZoneRow zones={TAILLE_F} />
      </div>
    )
    return (
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#3A3A5A' }}>
          Tour de taille — risque cardiovasculaire (OMS)
        </p>
        <ZoneRow label="♂" zones={TAILLE_H} />
        <ZoneRow label="♀" zones={TAILLE_F} />
      </div>
    )
  }

  // ── Poids (renvoie vers IMC) ────────────────────────────────────────────────
  return (
    <div className="pt-1">
      <p className="text-[10px]" style={{ color: '#4A4A6A' }}>
        Le poids seul est indicatif — consulter l’onglet{' '}
        <span style={{ color: '#00CFFF', fontWeight: 700 }}>IMC</span>{' '}
        pour l’interprétation par catégorie.
      </p>
    </div>
  )
}
