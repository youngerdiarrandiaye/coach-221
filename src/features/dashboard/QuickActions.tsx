'use client'

import Link from 'next/link'
import { UserPlus, CalendarPlus, BadgeDollarSign } from 'lucide-react'
import type { MouseEvent } from 'react'

function addRipple(e: MouseEvent<HTMLAnchorElement>) {
  const el  = e.currentTarget
  const dot = document.createElement('span')
  const rect = el.getBoundingClientRect()
  dot.className = 'tc-btn-ripple-dot'
  dot.style.left = `${e.clientX - rect.left}px`
  dot.style.top  = `${e.clientY - rect.top}px`
  el.appendChild(dot)
  dot.addEventListener('animationend', () => dot.remove(), { once: true })
}

const ACTIONS = [
  {
    href:     '/clients/new',
    label:    'Nouveau\nclient',
    icon:     UserPlus,
    color:    '#00FF85',
    bg:       'linear-gradient(155deg, rgba(0,255,133,0.16) 0%, rgba(0,255,133,0.04) 100%)',
    border:   'rgba(0,255,133,0.28)',
    glow:     'rgba(0,255,133,0.22)',
    iconBg:   'rgba(0,255,133,0.14)',
  },
  {
    href:     '/sessions/new',
    label:    'Nouvelle\nséance',
    icon:     CalendarPlus,
    color:    '#00CFFF',
    bg:       'linear-gradient(155deg, rgba(0,207,255,0.16) 0%, rgba(0,207,255,0.04) 100%)',
    border:   'rgba(0,207,255,0.28)',
    glow:     'rgba(0,207,255,0.22)',
    iconBg:   'rgba(0,207,255,0.14)',
  },
  {
    href:     '/payments/new',
    label:    'Saisir\npaiement',
    icon:     BadgeDollarSign,
    color:    '#FFD600',
    bg:       'linear-gradient(155deg, rgba(255,214,0,0.16) 0%, rgba(255,214,0,0.04) 100%)',
    border:   'rgba(255,214,0,0.28)',
    glow:     'rgba(255,214,0,0.22)',
    iconBg:   'rgba(255,214,0,0.14)',
  },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-2.5" data-animate="card">
      {ACTIONS.map(({ href, label, icon: Icon, color, bg, border, glow, iconBg }) => (
        <Link
          key={href}
          href={href}
          onMouseDown={addRipple}
          className="group tc-btn-ripple flex flex-col items-center justify-center gap-2.5 rounded-2xl p-3 text-center"
          style={{
            background:  bg,
            border:      `1px solid ${border}`,
            boxShadow:   `0 2px 16px ${glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
            minHeight:   '90px',
            transition:  'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.3s cubic-bezier(0.25,0.46,0.45,0.94)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.transform  = 'scale(1.04) translateY(-2px)'
            el.style.boxShadow  = `0 6px 28px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.transform  = ''
            el.style.boxShadow  = `0 2px 16px ${glow}, inset 0 1px 0 rgba(255,255,255,0.05)`
          }}
        >
          {/* Icône */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: iconBg,
              border:     `1px solid ${border}`,
              boxShadow:  `0 0 14px ${glow}`,
            }}
          >
            <Icon size={18} style={{ color }} strokeWidth={2} />
          </div>

          {/* Label */}
          <span
            className="text-[11px] font-black leading-tight whitespace-pre-line"
            style={{ color }}
          >
            {label}
          </span>
        </Link>
      ))}
    </div>
  )
}
