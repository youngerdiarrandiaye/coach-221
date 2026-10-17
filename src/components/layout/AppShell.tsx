'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Sidebar }   from './Sidebar'
import { BottomNav } from './BottomNav'
import { Navbar }    from './Navbar'
import { useAuthStore } from '@/store/authStore'
import type { ProfileRow } from '@/entities'

interface AppShellProps {
  children: React.ReactNode
  profile:  ProfileRow | null
}

export function AppShell({ children, profile }: AppShellProps) {
  const setProfile = useAuthStore((s) => s.setProfile)

  useEffect(() => {
    setProfile(profile)
  }, [profile, setProfile])

  return (
    <div className="min-h-dvh bg-background">
      {/* Texture de bruit CSS */}
      <div className="noise-overlay" aria-hidden />

      <Sidebar />

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Navbar />
        <main
          className="flex-1 min-w-0 px-4 py-5 lg:py-6 lg:pb-8"
          style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          {children}
        </main>
      </div>

      <BottomNav />

      {/* Toast notifications globales */}
      <Toaster
        position="top-center"
        expand
        visibleToasts={4}
        toastOptions={{
          style: {
            fontFamily: 'inherit',
            fontSize:   '0.875rem',
          },
        }}
      />
    </div>
  )
}
