'use client'

const PALETTE = {
  green:  { hex: '#00FF85', rgb: '0,255,133',   anim: 'dot-pulse 2s ease-in-out infinite' },
  red:    { hex: '#FF3B5C', rgb: '255,59,92',   anim: 'live-dot-red 1.5s ease-in-out infinite' },
  cyan:   { hex: '#00CFFF', rgb: '0,207,255',   anim: 'dot-pulse 2s ease-in-out infinite' },
  yellow: { hex: '#FFD600', rgb: '255,214,0',   anim: 'dot-pulse 3s ease-in-out infinite' },
  purple: { hex: '#7B6FFF', rgb: '123,111,255', anim: 'dot-pulse 2.5s ease-in-out infinite' },
}

interface Props {
  color?:  keyof typeof PALETTE
  label:   string
  size?:   'xs' | 'sm'
}

export function LivePulse({ color = 'green', label, size = 'xs' }: Props) {
  const { hex, rgb, anim } = PALETTE[color]
  const dotSize = size === 'xs' ? 6 : 8
  const textCls = size === 'xs' ? 'text-[9px]' : 'text-[11px]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-black uppercase tracking-widest ${textCls}`}
      style={{ color: hex }}
    >
      <span
        className="inline-block shrink-0 rounded-full"
        style={{
          width:     dotSize,
          height:    dotSize,
          background: hex,
          boxShadow:  `0 0 8px rgba(${rgb},0.80)`,
          animation:  anim,
        }}
      />
      {label}
    </span>
  )
}
