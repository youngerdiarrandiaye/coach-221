'use server'

import { getServerUser } from '@/lib/session'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { formatCFA } from '@/utils/format'
import {
  OBJECTIF_LABELS,
  STATUT_SESSION_LABELS,
  STATUT_PAYMENT_LABELS,
  METHODE_LABELS,
} from '@/config/constants'

export interface SearchResult {
  id: string
  href: string
  title: string
  subtitle: string
  category: 'client' | 'session' | 'payment'
  badge?: string
  badgeColor?: string
}

export interface SearchResults {
  clients: SearchResult[]
  sessions: SearchResult[]
  payments: SearchResult[]
  total: number
}

const STATUT_SESSION_COLORS: Record<string, string> = {
  PLANIFIEE: '#00CFFF',
  EFFECTUEE: '#00FF85',
  ANNULEE:   '#FF3B5C',
}

const STATUT_PAYMENT_COLORS: Record<string, string> = {
  PAYE:       '#00FF85',
  EN_ATTENTE: '#FFD600',
  ANNULE:     '#FF3B5C',
}

export async function globalSearchAction(query: string): Promise<SearchResults> {
  const empty: SearchResults = { clients: [], sessions: [], payments: [], total: 0 }
  if (!query || query.trim().length < 2) return empty

  const user = await getServerUser()
  if (!user) return empty

  const q = query.trim()
  const supabase = createServerSupabaseClient()

  // 1. Search clients — also get their IDs for cross-entity search
  const { data: clientsRaw } = await supabase
    .from('clients')
    .select('id, nom, prenom, telephone, objectif')
    .eq('coach_id', user.id)
    .eq('actif', true)
    .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,telephone.ilike.%${q}%`)
    .limit(4)

  const clientIds = (clientsRaw ?? []).map((c) => c.id)

  // 2. Sessions: by titre OR by matched client IDs
  const sessionsPromise = clientIds.length > 0
    ? supabase
        .from('sessions')
        .select('id, titre, date_heure, statut, clients(nom, prenom)')
        .eq('coach_id', user.id)
        .or(`titre.ilike.%${q}%,client_id.in.(${clientIds.join(',')})`)
        .order('date_heure', { ascending: false })
        .limit(4)
    : supabase
        .from('sessions')
        .select('id, titre, date_heure, statut, clients(nom, prenom)')
        .eq('coach_id', user.id)
        .ilike('titre', `%${q}%`)
        .order('date_heure', { ascending: false })
        .limit(4)

  // 3. Payments: by description OR by matched client IDs
  const paymentsPromise = clientIds.length > 0
    ? supabase
        .from('payments')
        .select('id, montant, date_paiement, statut, methode, description, clients(nom, prenom)')
        .eq('coach_id', user.id)
        .or(`description.ilike.%${q}%,client_id.in.(${clientIds.join(',')})`)
        .order('date_paiement', { ascending: false })
        .limit(4)
    : supabase
        .from('payments')
        .select('id, montant, date_paiement, statut, methode, description, clients(nom, prenom)')
        .eq('coach_id', user.id)
        .ilike('description', `%${q}%`)
        .order('date_paiement', { ascending: false })
        .limit(4)

  const [{ data: sessionsRaw }, { data: paymentsRaw }] = await Promise.all([
    sessionsPromise,
    paymentsPromise,
  ])

  // Map to SearchResult
  const clients: SearchResult[] = (clientsRaw ?? []).map((c) => ({
    id:       c.id,
    href:     `/clients/${c.id}`,
    title:    `${c.prenom} ${c.nom}`,
    subtitle: c.telephone + (c.objectif ? ` · ${OBJECTIF_LABELS[c.objectif] ?? c.objectif}` : ''),
    category: 'client',
  }))

  const sessions: SearchResult[] = (sessionsRaw ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = s.clients as any
    return {
      id:         s.id,
      href:       `/sessions/${s.id}`,
      title:      s.titre,
      subtitle:   `${client.prenom} ${client.nom} · ${new Date(s.date_heure).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      category:   'session',
      badge:      STATUT_SESSION_LABELS[s.statut],
      badgeColor: STATUT_SESSION_COLORS[s.statut],
    }
  })

  const payments: SearchResult[] = (paymentsRaw ?? []).map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = p.clients as any
    return {
      id:         p.id,
      href:       `/payments/${p.id}`,
      title:      `${client.prenom} ${client.nom}`,
      subtitle:   `${formatCFA(p.montant as number)} · ${METHODE_LABELS[p.methode] ?? p.methode} · ${new Date(p.date_paiement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`,
      category:   'payment',
      badge:      STATUT_PAYMENT_LABELS[p.statut],
      badgeColor: STATUT_PAYMENT_COLORS[p.statut],
    }
  })

  return {
    clients,
    sessions,
    payments,
    total: clients.length + sessions.length + payments.length,
  }
}
