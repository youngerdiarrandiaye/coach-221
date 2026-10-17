'use client'

import { useEffect } from 'react'

interface Props {
  opacity?: number
}

export function DashboardBg({ opacity = 0.18 }: Props) {
  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null
    if (!main) return

    // Overlay sombre adapté au ton chaud de l'image (coucher de soleil)
    const darkness = 1 - opacity
    main.style.backgroundImage = [
      `linear-gradient(160deg, rgba(3,3,9,${darkness}) 0%, rgba(8,5,3,${darkness - 0.04}) 50%, rgba(3,3,9,${darkness}) 100%)`,
      "url('/images/dashboard-bg.png')",
    ].join(', ')
    main.style.backgroundSize       = 'cover, cover'
    main.style.backgroundPosition   = 'center 40%, center 40%'
    main.style.backgroundRepeat     = 'no-repeat, no-repeat'
    main.style.backgroundAttachment = 'fixed, fixed'

    return () => {
      main.style.backgroundImage      = ''
      main.style.backgroundSize       = ''
      main.style.backgroundPosition   = ''
      main.style.backgroundRepeat     = ''
      main.style.backgroundAttachment = ''
    }
  }, [opacity])

  return null
}
