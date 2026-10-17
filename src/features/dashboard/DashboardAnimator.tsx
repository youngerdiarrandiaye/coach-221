'use client'

import { useGsapCards } from '@/hooks/useGsapCards'

export function DashboardAnimator({ children }: { children: React.ReactNode }) {
  const ref = useGsapCards()
  return (
    <div ref={ref} className="space-y-4 pb-24 lg:pb-6">
      {children}
    </div>
  )
}
