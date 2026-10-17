'use client'

/**
 * HeartBeat — animated heart for cardio metrics.
 *
 * mode "repos"   → slow double-beat (60 BPM), soft glow
 * mode "effort"  → rapid double-beat (150 BPM), intense glow + ECG sweep line
 */

interface Props {
  mode:  'repos' | 'effort'
  size?: number
  /** Show ECG sweep line (only meaningful for effort mode) */
  ecg?:  boolean
}

// Classic ECG (QRS complex) path in a 200×40 viewBox.
// Flat → P-wave → Q → R spike → S → T-wave → flat
const ECG_PATH =
  'M0,20 L20,20 L24,17 L28,20 L32,20 L35,30 L42,2 L49,36 L54,20 L68,20 L74,13 L80,20 L200,20'

export function HeartBeat({ mode, size = 24, ecg = false }: Props) {
  const isFast = mode === 'effort'

  // Animation durations
  const beatDuration   = isFast ? '0.45s' : '1.25s'
  const glowDuration   = isFast ? '0.45s' : '1.25s'
  const beatAnimation  = isFast ? 'heartbeat-fast' : 'heartbeat-slow'
  const glowAnimation  = isFast ? 'heartglow-fast' : 'heartglow-slow'

  // Colors
  const heartColor = isFast ? '#FF1E3C' : '#FF3B5C'
  const ringColor  = 'rgba(255,30,55,0.55)'
  const ecgColor   = '#FF3B5C'

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Ring qui explose au battement (effort seulement) */}
      {isFast && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:    ringColor,
            borderRadius:  '50%',
            transformOrigin: 'center',
            animation:     `effort-ring ${beatDuration} ease-out infinite`,
          }}
        />
      )}

      {/* Cœur SVG animé */}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{
          position:        'relative',
          transformOrigin: 'center 55%',
          animation:       `${beatAnimation} ${beatDuration} ease-in-out infinite,
                            ${glowAnimation} ${glowDuration} ease-in-out infinite`,
        }}
      >
        <path
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          fill={heartColor}
        />
      </svg>

      {/* Ligne ECG superposée (optionnelle) */}
      {ecg && (
        <svg
          viewBox="0 0 200 40"
          width={size * 3.5}
          height={size * 0.8}
          style={{
            position: 'absolute',
            left:     size * 1.1,
            top:      '50%',
            transform: 'translateY(-50%)',
            overflow:  'visible',
          }}
        >
          <path
            d={ECG_PATH}
            fill="none"
            stroke={ecgColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="400"
            style={{ animation: `ecg-sweep ${beatDuration} ease-in-out infinite` }}
          />
        </svg>
      )}
    </span>
  )
}
