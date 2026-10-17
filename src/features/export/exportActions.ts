'use server'

import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/session'
import { createServerSupabaseClient } from '@/config/supabase.server'
import type { ClientRow, SessionRow, PaymentRow } from '@/entities'

// ── CSV helpers ──────────────────────────────────────────────────────────────

function esc(val: unknown): string {
  const s = val == null ? '' : String(val)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function toCSV(headers: string[], rows: unknown[][]): string {
  const head = headers.map(esc).join(',')
  const body = rows.map(r => r.map(esc).join(',')).join('\n')
  return `﻿${head}\n${body}`  // BOM pour Excel
}

// ── Auth helper ──────────────────────────────────────────────────────────────

async function getCoachId(): Promise<string> {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return user.id
}

// ── Export actions ───────────────────────────────────────────────────────────

export async function exportClientsCSV(): Promise<string> {
  const coachId  = await getCoachId()
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('clients')
    .select('*')
    .eq('coach_id', coachId)
    .eq('actif', true)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as ClientRow[]
  return toCSV(
    ['Prénom', 'Nom', 'Téléphone', 'Email', 'Objectif', 'Sexe', 'Date naissance', 'Date inscription'],
    rows.map(c => [
      c.prenom,
      c.nom,
      c.telephone ?? '',
      c.email ?? '',
      c.objectif ?? '',
      c.sexe ?? '',
      c.date_naissance ?? '',
      c.created_at ? c.created_at.split('T')[0] : '',
    ])
  )
}

export async function exportSessionsCSV(): Promise<string> {
  const coachId  = await getCoachId()
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('sessions')
    .select('*, clients(nom, prenom)')
    .eq('coach_id', coachId)
    .order('date_heure', { ascending: false })

  type Row = SessionRow & { clients: { nom: string; prenom: string } }
  const rows = (data ?? []) as Row[]

  return toCSV(
    ['Client', 'Titre', 'Date', 'Heure', 'Durée (min)', 'Statut', 'Description', 'Notes'],
    rows.map(s => {
      const d = new Date(s.date_heure)
      return [
        `${s.clients.prenom} ${s.clients.nom}`,
        s.titre,
        d.toLocaleDateString('fr-FR'),
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        s.duree_minutes,
        s.statut,
        s.description ?? '',
        s.notes ?? '',
      ]
    })
  )
}

export async function exportPaymentsCSV(): Promise<string> {
  const coachId  = await getCoachId()
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('payments')
    .select('*, clients(nom, prenom)')
    .eq('coach_id', coachId)
    .order('date_paiement', { ascending: false })

  type Row = PaymentRow & { clients: { nom: string; prenom: string } }
  const rows = (data ?? []) as Row[]

  return toCSV(
    ['Client', 'Montant (FCFA)', 'Méthode', 'Statut', 'Date', 'Description'],
    rows.map(p => [
      `${p.clients.prenom} ${p.clients.nom}`,
      p.montant,
      p.methode,
      p.statut,
      p.date_paiement,
      p.description ?? '',
    ])
  )
}

export async function exportAllJSON(): Promise<string> {
  const coachId  = await getCoachId()
  const supabase = createServerSupabaseClient()

  const [
    { data: clients },
    { data: sessions },
    { data: payments },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('coach_id', coachId),
    supabase.from('sessions').select('*').eq('coach_id', coachId),
    supabase.from('payments').select('*').eq('coach_id', coachId),
  ])

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version:    '1.0',
    clients:    clients ?? [],
    sessions:   sessions ?? [],
    payments:   payments ?? [],
  }, null, 2)
}
