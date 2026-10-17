'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dumbbell, Menu, User } from 'lucide-react'
import { navItems } from '@/config/navigation'
import { useAuthStore } from '@/store/authStore'
import { useSidebarStore } from '@/store/sidebarStore'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { NotificationBell } from '@/features/notifications/NotificationBell'

export function Navbar() {
  const pathname = usePathname()
  const profile  = useAuthStore((s) => s.profile)
  const toggle   = useSidebarStore((s) => s.toggle)

  const currentPage = navItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  )

  const initials =
    (profile?.prenom?.[0] ?? '') + (profile?.nom?.[0] ?? '')

  return (
    <header
      className="sticky top-0 z-40 flex h-14 items-center justify-between px-4"
      style={{
        background:           'rgba(5,5,15,0.88)',
        borderBottom:         '1px solid rgba(255,255,255,0.07)',
        backdropFilter:       'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo + titre */}
      <div className="flex items-center gap-2.5">
        {/* Hamburger — mobile uniquement */}
        <button
          onClick={toggle}
          className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          aria-label="Ouvrir le menu"
        >
          <Menu size={18} style={{ color: '#9090B8' }} />
        </button>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            background:  'linear-gradient(135deg, #00FF85 0%, #00D166 100%)',
            boxShadow:   '0 0 14px rgba(0,255,133,0.35)',
          }}
        >
          <Dumbbell size={15} className="text-black" strokeWidth={2.5} />
        </div>
        <h1 className="text-sm font-black text-white tracking-tight">
          {currentPage?.label ?? 'TerangaCoach'}
        </h1>
      </div>

      {/* Search */}
      <GlobalSearch />

      {/* Notifications */}
      <NotificationBell />

      {/* Avatar — min 44px touch target */}
      <Link
        href="/profile"
        aria-label="Mon profil"
        className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold transition-opacity active:opacity-70 overflow-hidden"
        style={{
          background: profile?.avatar_url ? undefined : 'rgba(0,255,133,0.15)',
          border:     '1px solid rgba(0,255,133,0.30)',
          color:      '#00FF85',
          boxShadow:  '0 0 10px rgba(0,255,133,0.15)',
        }}
      >
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="Profil" className="h-full w-full object-cover" />
        ) : (
          initials || <User size={14} />
        )}
      </Link>
    </header>
  )
}
