'use client'

/**
 * MetricIcon — animated SVG icons for progress metrics.
 * Uses SVG SMIL animations (no CSS keyframes needed).
 *
 * poids        → balance scale with rocking needle
 * imc          → speedometer gauge with sweeping needle
 * mensurations → measuring tape extending
 * masse_grasse → droplet filling with color
 */

interface Props {
  type: 'poids' | 'imc' | 'mensurations' | 'masse_grasse'
  size?: number
}

// ─── Balance scale ─────────────────────────────────────────────────────────

function ScaleIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <filter id="glow-green">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Socle */}
      <rect x="4" y="20.5" width="16" height="2" rx="1" fill="#00CC66" opacity="0.85" />
      <rect x="7" y="19.5" width="10" height="1.5" rx="0.75" fill="#00FF85" opacity="0.5" />

      {/* Colonne centrale */}
      <rect x="11.2" y="12" width="1.6" height="8" rx="0.8" fill="#00CC66" opacity="0.7" />

      {/* Pivot */}
      <circle cx="12" cy="11.5" r="1.5" fill="#00FF85" filter="url(#glow-green)" />

      {/* Bras de la balance — se balance */}
      <g style={{ transformOrigin: '12px 11.5px' }}>
        <animateTransform
          attributeName="transform" type="rotate"
          values="0 12 11.5; -16 12 11.5; 0 12 11.5; 14 12 11.5; 0 12 11.5"
          dur="3.5s" repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.5 0 0.5 1; 0.5 0 0.5 1; 0.5 0 0.5 1; 0.5 0 0.5 1"
          keyTimes="0; 0.25; 0.5; 0.75; 1"
        />
        <line x1="4" y1="11.5" x2="20" y2="11.5" stroke="#00FF85" strokeWidth="1.6" strokeLinecap="round"
          filter="url(#glow-green)" />
        {/* Plateau gauche */}
        <line x1="4" y1="11.5" x2="4" y2="14.5" stroke="#00CC66" strokeWidth="1.2" strokeLinecap="round" />
        <ellipse cx="4" cy="14.8" rx="2.8" ry="0.9" fill="#00CC66" opacity="0.8" />
        {/* Plateau droit */}
        <line x1="20" y1="11.5" x2="20" y2="14.5" stroke="#00CC66" strokeWidth="1.2" strokeLinecap="round" />
        <ellipse cx="20" cy="14.8" rx="2.8" ry="0.9" fill="#00CC66" opacity="0.8" />
      </g>
    </svg>
  )
}

// ─── IMC Speedometer ────────────────────────────────────────────────────────

function GaugeIcon({ size }: { size: number }) {
  // Demi-cercle de 180°, rayon 9, centré en (12, 16)
  // Zones : bleu (sous-poids) | vert (normal) | jaune (surpoids) | rouge (obésité)
  const cx = 12, cy = 16, r = 9

  // Arc helper en coordonnées SVG
  function arc(startDeg: number, endDeg: number) {
    const s = (startDeg - 180) * (Math.PI / 180)
    const e = (endDeg   - 180) * (Math.PI / 180)
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
    return `M${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2}`
  }

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <filter id="glow-blue">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Arc fond */}
      <path d={arc(0, 180)} fill="none" stroke="#1E1E3A" strokeWidth="3.5" strokeLinecap="round" />

      {/* Zone bleue — sous-poids */}
      <path d={arc(0, 38)} fill="none" stroke="#4488FF" strokeWidth="3.5" strokeLinecap="round" opacity="0.8" />
      {/* Zone verte — normal */}
      <path d={arc(38, 110)} fill="none" stroke="#00CC66" strokeWidth="3.5" opacity="0.9" />
      {/* Zone jaune — surpoids */}
      <path d={arc(110, 148)} fill="none" stroke="#FFD600" strokeWidth="3.5" opacity="0.85" />
      {/* Zone rouge — obésité */}
      <path d={arc(148, 180)} fill="none" stroke="#FF3B5C" strokeWidth="3.5" strokeLinecap="round" opacity="0.8" />

      {/* Aiguille — sweep de 0° (sous-poids) vers zone normale */}
      <g style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <animateTransform
          attributeName="transform" type="rotate"
          values="-90 12 16; -35 12 16; -90 12 16"
          dur="2.8s" repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
          keyTimes="0; 0.55; 1"
        />
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 1}
          stroke="#00CFFF" strokeWidth="1.8" strokeLinecap="round"
          filter="url(#glow-blue)" />
      </g>

      {/* Centre pivot */}
      <circle cx={cx} cy={cy} r="1.4" fill="#00CFFF" filter="url(#glow-blue)" />

      {/* Base */}
      <line x1="3" y1="16" x2="21" y2="16" stroke="#1E1E3A" strokeWidth="1" />
    </svg>
  )
}

// ─── Measuring tape ──────────────────────────────────────────────────────────

function RulerIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <filter id="glow-cyan">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="ruler-clip">
          <rect x="2" y="7" width="20" height="10" rx="2" />
        </clipPath>
      </defs>

      {/* Corps de la règle */}
      <rect x="2" y="7" width="20" height="10" rx="2"
        fill="#00CFFF" opacity="0.12" stroke="#00CFFF" strokeWidth="1.2" strokeOpacity="0.7" />

      {/* Graduations fixes */}
      {[5, 8, 11, 14, 17, 20].map(x => (
        <line key={x} x1={x} y1="7" x2={x} y2={x % 6 === 5 ? "12" : "10"}
          stroke="#00CFFF" strokeWidth={x % 6 === 5 ? "1.2" : "0.8"} strokeOpacity="0.6" />
      ))}
      {[6.5, 9.5, 12.5, 15.5, 18.5].map(x => (
        <line key={x} x1={x} y1="7" x2={x} y2="9.5"
          stroke="#00CFFF" strokeWidth="0.6" strokeOpacity="0.4" />
      ))}

      {/* Curseur animé qui glisse */}
      <g clipPath="url(#ruler-clip)">
        <rect y="7" width="4" height="10" fill="#00CFFF" opacity="0.25" rx="1"
          filter="url(#glow-cyan)">
          <animate attributeName="x" values="2; 18; 2" dur="3s"
            repeatCount="indefinite" calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0; 0.5; 1" />
        </rect>
        <line y1="7" y2="17" stroke="#00CFFF" strokeWidth="1.5" strokeOpacity="0.9"
          filter="url(#glow-cyan)">
          <animate attributeName="x1" values="4; 20; 4" dur="3s"
            repeatCount="indefinite" calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0; 0.5; 1" />
          <animate attributeName="x2" values="4; 20; 4" dur="3s"
            repeatCount="indefinite" calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0; 0.5; 1" />
        </line>
      </g>

      {/* Accolades de mesure */}
      <g opacity="0.7" filter="url(#glow-cyan)">
        <polyline points="2,4 2,6 22,6 22,4" fill="none" stroke="#00CFFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

// ─── Body fat droplet ────────────────────────────────────────────────────────

function DropletIcon({ size }: { size: number }) {
  // Chemin goutte (teardrop) dans viewBox 24x24
  const dropPath = 'M12,3 C10,7 4,12 4,16.5 a8,8 0 0,0 16,0 C20,12 14,7 12,3 Z'

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <clipPath id="droplet-clip">
          <path d={dropPath} />
        </clipPath>
        <filter id="glow-purple">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="drop-fill-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9B6FFF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#5B2FCC" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Fond de la goutte */}
      <path d={dropPath} fill="#7B6FFF" opacity="0.12"
        stroke="#7B6FFF" strokeWidth="1.2" strokeOpacity="0.6" />

      {/* Remplissage animé qui monte et descend */}
      <g clipPath="url(#droplet-clip)">
        <rect x="0" width="24" height="24" fill="url(#drop-fill-grad)" opacity="0.75">
          <animate attributeName="y" values="16; 10; 16" dur="2.8s"
            repeatCount="indefinite" calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0; 0.5; 1" />
        </rect>
        {/* Vague de surface */}
        <ellipse cx="12" rx="8" ry="1.5" fill="#9B6FFF" opacity="0.5">
          <animate attributeName="cy" values="16; 10; 16" dur="2.8s"
            repeatCount="indefinite" calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" keyTimes="0; 0.5; 1" />
        </ellipse>
      </g>

      {/* Contour de la goutte au-dessus */}
      <path d={dropPath} fill="none" stroke="#7B6FFF" strokeWidth="1.2"
        strokeOpacity="0.9" filter="url(#glow-purple)" />

      {/* Reflet */}
      <ellipse cx="9.5" cy="11" rx="1.2" ry="2" fill="white" opacity="0.25" transform="rotate(-20 9.5 11)" />
    </svg>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function MetricIcon({ type, size = 24 }: Props) {
  switch (type) {
    case 'poids':        return <ScaleIcon  size={size} />
    case 'imc':          return <GaugeIcon  size={size} />
    case 'mensurations': return <RulerIcon  size={size} />
    case 'masse_grasse': return <DropletIcon size={size} />
  }
}

// Meta-data for each metric (banner content)
export const METRIC_META: Record<
  'poids' | 'imc' | 'mensurations' | 'masse_grasse',
  { title: string; desc: string; color: string }
> = {
  poids: {
    title: 'Suivi du poids corporel',
    desc:  'Mesure à jeun le matin pour une précision maximale',
    color: '#00FF85',
  },
  imc: {
    title: 'Indice de Masse Corporelle',
    desc:  'Normal entre 18.5 et 24.9 — rapport poids / taille²',
    color: '#00CFFF',
  },
  mensurations: {
    title: 'Mensurations corporelles',
    desc:  'Tour de taille, hanches, bras et cuisse en cm',
    color: '#00CFFF',
  },
  masse_grasse: {
    title: '% Masse grasse',
    desc:  'Composition corporelle — indicateur clé de santé métabolique',
    color: '#7B6FFF',
  },
}
