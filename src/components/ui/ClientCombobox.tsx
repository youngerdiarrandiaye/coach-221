'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X, Check } from 'lucide-react'

const PALETTES = [
  ['#00FF85','#00CFFF'],['#00CFFF','#7B6FFF'],['#FFD600','#FF6B35'],
  ['#FF3B5C','#FF6B35'],['#7B6FFF','#00CFFF'],['#00FF85','#FFD600'],
]
function avatarGrad(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [c1, c2] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
}

export interface ClientComboboxOption {
  id:        string
  nom:       string
  prenom:    string
  telephone: string
}

interface Props {
  clients:    ClientComboboxOption[]
  value:      string
  onChange:   (value: string) => void
  hasError?:  boolean
}

export function ClientCombobox({ clients, value, onChange, hasError }: Props) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const containerRef        = useRef<HTMLDivElement>(null)
  const inputRef            = useRef<HTMLInputElement>(null)

  const selected = clients.find((c) => c.id === value) ?? null

  // Fermer sur clic extérieur
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Filtrage : par prénom+nom OU téléphone (ignore espaces dans le tel)
  const filtered = query.trim().length === 0
    ? []
    : clients.filter((c) => {
        const q    = query.toLowerCase().trim()
        const name = `${c.prenom} ${c.nom}`.toLowerCase()
        const tel  = c.telephone.replace(/\s/g, '').toLowerCase()
        const qTel = q.replace(/\s/g, '')
        return name.includes(q) || tel.includes(qTel)
      })

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (value) onChange('') // efface la sélection si l'utilisateur re-tape
    setQuery(val)
    setOpen(true)
  }

  function handleSelect(c: ClientComboboxOption) {
    onChange(c.id)
    setQuery('')
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function handleFocus() {
    if (!selected) setOpen(true)
  }

  // Ce que l'input affiche
  const displayValue = selected ? `${selected.prenom} ${selected.nom}` : query

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="relative">
        {/* Icône gauche */}
        {selected ? (
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-lg text-[10px] font-black text-black pointer-events-none"
            style={{ background: avatarGrad(`${selected.prenom}${selected.nom}`) }}
          >
            {selected.prenom[0]}{selected.nom[0]}
          </div>
        ) : (
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
        )}

        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="Rechercher par nom ou téléphone…"
          autoComplete="off"
          className="h-11 w-full rounded-2xl border bg-card text-sm text-white placeholder:text-muted-foreground outline-none transition-colors pl-10 pr-9"
          style={{
            borderColor: hasError
              ? 'rgb(var(--destructive))'
              : open
              ? 'hsl(var(--primary))'
              : 'hsl(var(--border))',
          }}
        />

        {/* Bouton effacer */}
        {(selected || query) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && query.trim().length > 0 && (
        <div
          className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted-foreground text-center">
              Aucun résultat pour &quot;{query}&quot;
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(c) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <div
                      className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl text-xs font-black text-black"
                      style={{ background: avatarGrad(`${c.prenom}${c.nom}`) }}
                    >
                      {c.prenom[0]}{c.nom[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{c.prenom} {c.nom}</p>
                      <p className="text-xs text-muted-foreground">{c.telephone}</p>
                    </div>
                    {value === c.id && (
                      <Check size={14} className="shrink-0" style={{ color: '#00FF85' }} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
