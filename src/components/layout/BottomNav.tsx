'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { navItems } from '@/config/navigation'

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
      style={{
        background:           'rgba(5,5,15,0.96)',
        borderTop:            '1px solid rgba(255,255,255,0.08)',
        backdropFilter:       'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom:        'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-stretch justify-around px-1 pt-1 pb-1">
        {navItems.slice(0, 5).map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl min-h-[52px] transition-all duration-150"
              style={
                isActive
                  ? {
                      background: 'rgba(0,255,133,0.10)',
                      color: '#00FF85',
                    }
                  : { color: '#9090B8' }
              }
            >
              <item.icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.8}
                aria-hidden
              />
              <span
                className={cn(
                  'text-[10px] font-semibold leading-none truncate max-w-full',
                  isActive ? 'text-[#00FF85]' : 'text-[#9090B8]'
                )}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
