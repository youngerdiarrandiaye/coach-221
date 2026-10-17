/**
 * Classification par zones médicales/sportives et prévision linéaire simple.
 * Utilisé côté serveur (pas de React).
 * Sources : OMS, ACSM, Haskell & Fox.
 */

export interface MetricZone {
  label:  string
  color:  string   // hex
  bg:     string   // rgba
  level:  0 | 1 | 2 | 3  // 0=optimal, 1=bon, 2=attention, 3=critique
}

type Sexe = 'HOMME' | 'FEMME' | null | undefined

// ─── Classificateurs ──────────────────────────────────────────────────────────

export function getImcZone(imc: number): MetricZone {
  if (imc < 18.5) return { label: 'Sous-poids',  color: '#4488FF', bg: 'rgba(68,136,255,0.15)',  level: 2 }
  if (imc < 25)   return { label: 'Normal',       color: '#00CC66', bg: 'rgba(0,204,102,0.15)',   level: 0 }
  if (imc < 30)   return { label: 'Surpoids',     color: '#FFD600', bg: 'rgba(255,214,0,0.15)',   level: 2 }
  if (imc < 35)   return { label: 'Obésité mod.', color: '#FF8C3B', bg: 'rgba(255,140,59,0.15)',  level: 3 }
  return               { label: 'Obésité sév.', color: '#FF3B5C', bg: 'rgba(255,59,92,0.15)',   level: 3 }
}

export function getFcReposZone(bpm: number, sexe?: Sexe): MetricZone {
  const f = sexe === 'FEMME'
  if (bpm < (f ? 55 : 50)) return { label: 'Athlète',     color: '#00FF85', bg: 'rgba(0,255,133,0.13)',  level: 0 }
  if (bpm < (f ? 60 : 56)) return { label: 'Excellent',   color: '#00CC66', bg: 'rgba(0,204,102,0.13)',  level: 0 }
  if (bpm < (f ? 65 : 62)) return { label: 'Bien',        color: '#00CFFF', bg: 'rgba(0,207,255,0.13)',  level: 1 }
  if (bpm < (f ? 70 : 66)) return { label: 'Moyen',       color: '#FFD600', bg: 'rgba(255,214,0,0.13)',  level: 2 }
  return                         { label: 'Insuffisant', color: '#FF3B5C', bg: 'rgba(255,59,92,0.13)',  level: 3 }
}

export function getMasseGrasseZone(pct: number, sexe?: Sexe): MetricZone {
  const f = sexe === 'FEMME'
  if (f) {
    if (pct <= 20) return { label: 'Athlète',    color: '#00FF85', bg: 'rgba(0,255,133,0.13)',  level: 0 }
    if (pct <= 24) return { label: 'Fitness',    color: '#00CC66', bg: 'rgba(0,204,102,0.13)',  level: 0 }
    if (pct <= 31) return { label: 'Acceptable', color: '#FFD600', bg: 'rgba(255,214,0,0.13)',  level: 1 }
    return               { label: 'Obèse',       color: '#FF3B5C', bg: 'rgba(255,59,92,0.13)',  level: 3 }
  }
  if (pct <= 13) return { label: 'Athlète',    color: '#00FF85', bg: 'rgba(0,255,133,0.13)',  level: 0 }
  if (pct <= 17) return { label: 'Fitness',    color: '#00CC66', bg: 'rgba(0,204,102,0.13)',  level: 0 }
  if (pct <= 24) return { label: 'Acceptable', color: '#FFD600', bg: 'rgba(255,214,0,0.13)',  level: 1 }
  return               { label: 'Obèse',       color: '#FF3B5C', bg: 'rgba(255,59,92,0.13)',  level: 3 }
}

export function getTourTailleZone(cm: number, sexe?: Sexe): MetricZone {
  const f = sexe === 'FEMME'
  if (f) {
    if (cm < 80)  return { label: 'Idéal',        color: '#00CC66', bg: 'rgba(0,204,102,0.13)',  level: 0 }
    if (cm <= 88) return { label: 'Élevé',         color: '#FFD600', bg: 'rgba(255,214,0,0.13)',  level: 2 }
    return               { label: 'Risque majeur', color: '#FF3B5C', bg: 'rgba(255,59,92,0.13)',  level: 3 }
  }
  if (cm < 94)   return { label: 'Idéal',        color: '#00CC66', bg: 'rgba(0,204,102,0.13)',  level: 0 }
  if (cm <= 102) return { label: 'Élevé',         color: '#FFD600', bg: 'rgba(255,214,0,0.13)',  level: 2 }
  return               { label: 'Risque majeur', color: '#FF3B5C', bg: 'rgba(255,59,92,0.13)',  level: 3 }
}

export function getFcEffortZone(bpm: number, age: number): MetricZone {
  const pct = (bpm / (220 - age)) * 100
  if (pct < 60) return { label: 'Z1 · Récup.',    color: '#4488FF', bg: 'rgba(68,136,255,0.13)', level: 0 }
  if (pct < 70) return { label: 'Z2 · Endurance', color: '#00CC66', bg: 'rgba(0,204,102,0.13)',  level: 0 }
  if (pct < 80) return { label: 'Z3 · Aérobie',   color: '#FFD600', bg: 'rgba(255,214,0,0.13)',  level: 1 }
  if (pct < 90) return { label: 'Z4 · Anaérobie', color: '#FF8C3B', bg: 'rgba(255,140,59,0.13)', level: 2 }
  return               { label: 'Z5 · Max',       color: '#FF3B5C', bg: 'rgba(255,59,92,0.13)',  level: 3 }
}

// ─── Prévision linéaire ───────────────────────────────────────────────────────

/** Prédit la valeur du mois suivant par extrapolation linéaire : next = current + (current − prev) */
export function forecastValue(current: number | null | undefined, prev: number | null | undefined): number | null {
  if (current == null || prev == null) return null
  return parseFloat((current + (current - prev)).toFixed(1))
}

/** Tendance globale basée sur comparaison de levels de zone */
export type Tendance = 'amélioration' | 'stable' | 'attention'

export function getTendance(currentLevel: number, predictedLevel: number): Tendance {
  if (predictedLevel < currentLevel)  return 'amélioration'
  if (predictedLevel > currentLevel)  return 'attention'
  return 'stable'
}

export const TENDANCE_META: Record<Tendance, { icon: string; color: string; label: string }> = {
  amélioration: { icon: '↗',  color: '#00CC66', label: 'En amélioration' },
  stable:       { icon: '→',  color: '#9090B8', label: 'Stable'          },
  attention:    { icon: '⚠',  color: '#FF8C3B', label: 'À surveiller'    },
}
