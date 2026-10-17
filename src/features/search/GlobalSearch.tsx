'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search, Users, CalendarDays, CreditCard,
  X, Loader2, ArrowRight, CornerDownLeft,
} from 'lucide-react'
import { globalSearchAction, type SearchResults, type SearchResult } from './globalSearchAction'

const CATEGORY_CONFIG = {
  client: {
    label: 'Clients',
    icon:  Users,
    color: '#00FF85',
    href:  '/clients',
  },
  session: {
    label: 'Séances',
    icon:  CalendarDays,
    color: '#00CFFF',
    href:  '/sessions',
  },
  payment: {
    label: 'Paiements',
    icon:  CreditCard,
    color: '#FFD600',
    href:  '/payments',
  },
} as const

export function GlobalSearch() {
  const [isOpen, setIsOpen]           = useState(false)
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<SearchResults | null>(null)
  const [loading, setLoading]         = useState(false)
  const [selectedIndex, setSelected]  = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const router   = useRouter()

  const allResults = useMemo<SearchResult[]>(() => {
    if (!results) return []
    return [...results.clients, ...results.sessions, ...results.payments]
  }, [results])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setResults(null)
    setSelected(-1)
  }, [])

  // CMD+K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 60)
  }, [isOpen])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Debounced search (300 ms)
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults(null)
      setSelected(-1)
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      const r = await globalSearchAction(query.trim())
      setResults(r)
      setSelected(-1)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { close(); return }
    if (!allResults.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((i) => Math.min(i + 1, allResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      router.push(allResults[selectedIndex].href)
      close()
    }
  }

  const hasResults  = results && results.total > 0
  const noResults   = results && results.total === 0 && query.length >= 2 && !loading
  const showEmpty   = !query || query.length < 2

  return (
    <>
      {/* ── Trigger button ─────────────────────────── */}
      <button
        onClick={() => setIsOpen(true)}
        className="shrink-0 flex items-center gap-2 rounded-2xl px-3 py-1.5 transition-all duration-200 hover:scale-[1.02]"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border:     '1px solid rgba(255,255,255,0.10)',
          color:      '#9090B8',
        }}
        aria-label="Rechercher (⌘K)"
      >
        <Search size={14} />
        <span className="hidden sm:inline text-xs">Rechercher…</span>
        <kbd
          className="hidden sm:inline rounded px-1.5 py-0.5 text-[10px] font-mono"
          style={{ background: 'rgba(255,255,255,0.07)', color: '#6A6A9A' }}
        >
          ⌘K
        </kbd>
      </button>

      {/* ── Overlay ──────────────────────────────────── */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50"
            style={{
              background:           'rgba(3,3,9,0.82)',
              backdropFilter:       'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={close}
          />

          {/* Modal */}
          <div
            className="fixed left-0 right-0 z-50 mx-auto w-full px-4"
            style={{ top: '8%', maxWidth: '620px' }}
          >
            <div
              className="w-full overflow-hidden"
              style={{
                background: 'linear-gradient(160deg,rgba(15,15,35,0.99) 0%,rgba(10,10,25,1) 100%)',
                border:     '1px solid rgba(0,255,133,0.22)',
                borderRadius: '1.5rem',
                boxShadow:
                  '0 32px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,255,133,0.06), inset 0 1px 0 rgba(255,255,255,0.06)',
                animation: 'slide-up-fade 0.18s cubic-bezier(0.25,0.46,0.45,0.94)',
              }}
            >
              {/* ── Input row ── */}
              <div
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
              >
                {loading
                  ? <Loader2 size={18} className="shrink-0 animate-spin" style={{ color: '#00FF85' }} />
                  : <Search size={18} className="shrink-0" style={{ color: '#5A5A8A' }} />
                }
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Rechercher clients, séances, paiements…"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-muted-foreground outline-none"
                />
                <button
                  onClick={close}
                  className="shrink-0 flex h-7 w-7 items-center justify-center rounded-xl transition-colors hover:bg-white/10"
                  style={{ color: '#6A6A9A' }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* ── Results body ── */}
              <div className="max-h-[65vh] overflow-y-auto p-2">

                {/* Empty placeholder */}
                {showEmpty && (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: 'rgba(0,255,133,0.07)', border: '1px solid rgba(0,255,133,0.14)' }}
                    >
                      <Search size={22} style={{ color: '#00FF85' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/60">Tapez pour rechercher</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Clients · Séances · Paiements</p>
                    </div>
                    <div className="flex gap-3 mt-1">
                      {(['client', 'session', 'payment'] as const).map((cat) => {
                        const cfg = CATEGORY_CONFIG[cat]
                        const Icon = cfg.icon
                        return (
                          <Link
                            key={cat}
                            href={cfg.href}
                            onClick={close}
                            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all hover:scale-105"
                            style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}25`, color: cfg.color }}
                          >
                            <Icon size={11} /> {cfg.label}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* No results */}
                {noResults && (
                  <div className="py-12 text-center">
                    <p className="text-sm font-semibold text-white/50">Aucun résultat pour</p>
                    <p className="text-sm text-white mt-0.5">&ldquo;{query}&rdquo;</p>
                  </div>
                )}

                {/* Result sections */}
                {hasResults && (
                  <div className="space-y-2">
                    {(['clients', 'sessions', 'payments'] as const).map((cat) => {
                      const items = results[cat]
                      if (!items.length) return null

                      const cfg = CATEGORY_CONFIG[items[0].category]
                      const Icon = cfg.icon

                      const baseIndex =
                        cat === 'clients'  ? 0 :
                        cat === 'sessions' ? results.clients.length :
                        results.clients.length + results.sessions.length

                      return (
                        <div key={cat}>
                          {/* Section header */}
                          <div className="flex items-center justify-between px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <Icon size={11} style={{ color: cfg.color }} />
                              <span
                                className="text-[10px] font-black uppercase tracking-widest"
                                style={{ color: cfg.color }}
                              >
                                {cfg.label}
                              </span>
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                                style={{ background: `${cfg.color}18`, color: cfg.color }}
                              >
                                {items.length}
                              </span>
                            </div>
                            <Link
                              href={`${cfg.href}?q=${encodeURIComponent(query)}`}
                              onClick={close}
                              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-white transition-colors"
                            >
                              Tout voir <ArrowRight size={10} />
                            </Link>
                          </div>

                          {/* Items */}
                          {items.map((item, itemIdx) => {
                            const flatIdx  = baseIndex + itemIdx
                            const isSelected = selectedIndex === flatIdx
                            const ItemIcon = CATEGORY_CONFIG[item.category].icon
                            const color    = CATEGORY_CONFIG[item.category].color

                            return (
                              <Link
                                key={item.id}
                                href={item.href}
                                onClick={close}
                                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-all duration-100"
                                style={{
                                  background: isSelected ? 'rgba(0,255,133,0.07)' : 'transparent',
                                  border:     `1px solid ${isSelected ? 'rgba(0,255,133,0.18)' : 'transparent'}`,
                                }}
                                onMouseEnter={() => setSelected(flatIdx)}
                              >
                                <div
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                                  style={{ background: `${color}12`, border: `1px solid ${color}22` }}
                                >
                                  <ItemIcon size={15} style={{ color }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                                </div>
                                {item.badge && (
                                  <span
                                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                    style={{
                                      background: `${item.badgeColor}14`,
                                      border:     `1px solid ${item.badgeColor}32`,
                                      color:      item.badgeColor,
                                    }}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                                {isSelected && (
                                  <CornerDownLeft size={12} className="shrink-0" style={{ color: '#00FF85' }} />
                                )}
                              </Link>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Keyboard hint footer */}
                {(hasResults || noResults) && (
                  <div
                    className="flex items-center justify-center gap-4 px-2 py-3 mt-2"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {[
                      { key: '↑↓', label: 'naviguer' },
                      { key: '↵',  label: 'ouvrir' },
                      { key: 'Esc', label: 'fermer' },
                    ].map(({ key, label }) => (
                      <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                        <kbd
                          className="rounded px-1 py-0.5 font-mono text-[9px]"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#6A6A9A' }}
                        >
                          {key}
                        </kbd>
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
