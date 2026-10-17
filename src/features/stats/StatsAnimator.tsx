'use client'
import { useGsapCards } from '@/hooks/useGsapCards'
export function StatsAnimator({ children }: { children: React.ReactNode }) {
  const ref = useGsapCards()
  return <div ref={ref} className="space-y-5 pb-24 lg:pb-6">{children}</div>
}
