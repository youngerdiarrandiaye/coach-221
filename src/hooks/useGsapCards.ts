'use client'

import { useEffect, useRef } from 'react'

export function useGsapCards() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ctx: { revert: () => void } | null = null

    import('gsap').then(({ gsap }) => {
      if (!ref.current) return

      ctx = gsap.context(() => {
        gsap.fromTo(
          '[data-animate="card"]',
          { opacity: 0, y: 40, scale: 0.96 },
          {
            opacity:    1,
            y:          0,
            scale:      1,
            duration:   0.60,
            stagger:    0.15,
            ease:       'power3.out',
            clearProps: 'transform',
          }
        )
        gsap.fromTo(
          '[data-animate="text"]',
          { opacity: 0, y: 20 },
          {
            opacity:    1,
            y:          0,
            duration:   0.50,
            stagger:    0.08,
            ease:       'power3.out',
            delay:      0.05,
            clearProps: 'transform',
          }
        )
      }, ref)

      // ── Scroll reveal via IntersectionObserver ──
      const scrollEls = ref.current?.querySelectorAll('[data-scroll]') ?? []
      if (scrollEls.length > 0) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return
              gsap.fromTo(
                entry.target,
                { opacity: 0, y: 32 },
                { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', clearProps: 'transform' }
              )
              observer.unobserve(entry.target)
            })
          },
          { threshold: 0.12 }
        )
        scrollEls.forEach((el) => {
          gsap.set(el, { opacity: 0 })
          observer.observe(el)
        })

        return () => observer.disconnect()
      }
    })

    return () => {
      if (ctx) ctx.revert()
    }
  }, [])

  return ref
}
