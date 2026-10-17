'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dumbbell, LogOut, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navItems } from '@/config/navigation'
import { logoutAction } from '@/features/auth/actions'
import { useAuthStore } from '@/store/authStore'
import { useSidebarStore } from '@/store/sidebarStore'

export function Sidebar() {
  const pathname = usePathname()
  const profile  = useAuthStore((s) => s.profile)
  const isOpen   = useSidebarStore((s) => s.isOpen)
  const close    = useSidebarStore((s) => s.close)

  // Fermer au changement de route
  useEffect(() => { close() }, [pathname, close])

  // Bloquer le scroll du body quand le menu est ouvert
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else        document.body.style.overflow = ''
    return ()  => { document.body.style.overflow = '' }
  }, [isOpen])

  const initials = (profile?.prenom?.[0] ?? '') + (profile?.nom?.[0] ?? '')

  return (
    <>
      {/* Backdrop mobile */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={close}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-64 flex-col transition-transform duration-300 ease-out',
          'lg:translate-x-0 lg:z-40',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          background:  '#030309',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Logo + bouton fermer (mobile) */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, #00FF85 0%, #00D166 100%)', boxShadow: '0 0 18px rgba(0,255,133,0.35)' }}
          >
            <Dumbbell size={19} className="text-black" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-black tracking-tight text-white">TerangaCoach</span>
            <span className="block text-[10px] text-[#9090B8] font-medium">Coaching & Suivi</span>
          </div>
          <button
            onClick={close}
            className="lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10 active:bg-white/15"
            aria-label="Fermer le menu"
          >
            <X size={16} style={{ color: '#9090B8' }} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 min-h-0 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                  isActive ? 'text-[#00FF85]' : 'text-[#9090B8] hover:text-white hover:bg-white/5'
                )}
                style={
                  isActive
                    ? { background: 'rgba(0,255,133,0.10)', borderLeft: '2px solid #00FF85', boxShadow: 'inset 0 0 20px rgba(0,255,133,0.04)' }
                    : { borderLeft: '2px solid transparent' }
                }
              >
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Profil + déconnexion */}
        <div className="shrink-0 px-3 py-4 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <Link
            href="/profile"
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150',
              pathname.startsWith('/profile') ? 'bg-primary/10 text-[#00FF85]' : 'hover:bg-white/5'
            )}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold overflow-hidden"
              style={{
                background: profile?.avatar_url ? undefined : 'rgba(0,255,133,0.15)',
                border:     '1px solid rgba(0,255,133,0.28)',
                color:      '#00FF85',
              }}
            >
              {profile?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                : (initials || <User size={14} />)
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {profile ? `${profile.prenom} ${profile.nom}` : '…'}
              </p>
              <p className="truncate text-xs text-[#9090B8]">{profile?.email ?? ''}</p>
            </div>
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#9090B8] transition-all hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut size={18} aria-hidden />
              Déconnexion
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
