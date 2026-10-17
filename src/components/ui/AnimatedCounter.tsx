'use client'

import { useEffect, useRef, useState } from 'react'

type CounterType = 'number' | 'currency'

interface AnimatedCounterProps {
  value: number
  duration?: number
  type?: CounterType
  prefix?: string
  suffix?: string
  className?: string
}

function formatDisplay(n: number, type: CounterType, prefix: string, suffix: string): string {
  const base = type === 'currency'
    ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' FCFA'
    : n.toLocaleString('fr-FR')
  return `${prefix}${base}${suffix}`
}

export function AnimatedCounter({
  value,
  duration = 1200,
  type = 'number',
  prefix = '',
  suffix = '',
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const start     = 0
    const startTime = performance.now()

    const step = (now: number) => {
      const elapsed  = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4)
      setDisplay(Math.round(start + (value - start) * ease))
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return (
    <span className={className}>
      {formatDisplay(display, type, prefix, suffix)}
    </span>
  )
}
