import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Pencil, ArrowLeft, Clock, CalendarDays, User, RotateCcw } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { sessionDao } from '@/dao/sessionDao'
import { StatusButtons } from '@/features/sessions/StatusButtons'
import { DeleteSessionButton } from '@/features/sessions/DeleteSessionButton'
import { formatDate, formatTime } from '@/utils/format'
import { STATUT_SESSION_LABELS } from '@/config/constants'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Séance' }
}

interface Props {
  params: { id: string }
}

const STATUT_STYLES: Record<string, React.CSSProperties> = {
  PLANIFIEE: { background: 'rgba(0,207,255,0.12)', border: '1px solid rgba(0,207,255,0.40)', color: '#00CFFF' },
  EFFECTUEE: { background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.40)', color: '#00FF85' },
  ANNULEE:   { background: 'rgba(255,59,92,0.12)',  border: '1px solid rgba(255,59,92,0.40)',  color: '#FF3B5C' },
}

function InfoRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 sm:w-28 shrink-0 text-xs text-muted-foreground pt-0.5 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-sm text-white">{children}</span>
    </div>
  )
}

export default async function SessionDetailPage({ params }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const session = await sessionDao.findById(params.id, user.id)
  if (!session) notFound()

  const dt = new Date(session.date_heure)

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/sessions"
          className="flex h-10 w-10 items-center justify-center rounded-2xl transition-all hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <ArrowLeft size={16} style={{ color: '#9090B8' }} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-xl font-black text-white">{session.titre}</h1>
          {session.recurrence_id && (
            <Link
              href={`/sessions/recurrences`}
              className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-bold transition-opacity hover:opacity-80"
              style={{ color: '#7B6FFF' }}
            >
              <RotateCcw size={10} />
              Série récurrente
            </Link>
          )}
        </div>
        <Link
          href={`/sessions/${session.id}/edit`}
          className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold transition-all hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#9090B8' }}
        >
          <Pencil size={14} /> Modifier
        </Link>
      </div>

      {/* Badge date + statut */}
      <div className="tc-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-center"
              style={{ background: 'linear-gradient(135deg,#00CFFF 0%,#7B6FFF 100%)', boxShadow: '0 0 18px rgba(0,207,255,0.30)' }}
            >
              <span className="text-[10px] font-medium leading-none text-black/70">
                {dt.toLocaleDateString('fr-FR', { month: 'short' })}
              </span>
              <span className="text-lg font-black leading-none text-black">
                {dt.getDate()}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{formatDate(session.date_heure)}</p>
              <p className="font-bold text-white">{formatTime(session.date_heure)} · {session.duree_minutes} min</p>
            </div>
          </div>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={STATUT_STYLES[session.statut]}
          >
            {STATUT_SESSION_LABELS[session.statut]}
          </span>
        </div>
        <StatusButtons sessionId={session.id} currentStatus={session.statut} />
      </div>

      {/* Informations */}
      <div className="tc-card p-4 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Informations</h2>

        <InfoRow label="Client" icon={<User size={12} style={{ color: '#00FF85' }} />}>
          <Link
            href={`/clients/${session.client_id}`}
            className="flex items-center gap-1.5 font-semibold transition-colors hover:underline"
            style={{ color: '#00FF85' }}
          >
            {session.clients.prenom} {session.clients.nom}
          </Link>
        </InfoRow>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

        <InfoRow label="Date" icon={<CalendarDays size={12} style={{ color: '#00CFFF' }} />}>
          {formatDate(session.date_heure)}
        </InfoRow>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

        <InfoRow label="Durée" icon={<Clock size={12} style={{ color: '#FFD600' }} />}>
          {formatTime(session.date_heure)} · {session.duree_minutes} min
        </InfoRow>
      </div>

      {/* Description */}
      {session.description && (
        <div className="tc-card p-4 space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Description</h2>
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{session.description}</p>
        </div>
      )}

      {/* Notes */}
      {session.notes && (
        <div className="tc-card p-4 space-y-2" style={{ borderColor: 'rgba(0,207,255,0.20)' }}>
          <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#00CFFF' }}>Notes post-séance</h2>
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{session.notes}</p>
        </div>
      )}

      {/* Danger zone */}
      <div className="flex justify-end pt-2">
        <DeleteSessionButton sessionId={session.id} sessionTitre={session.titre} />
      </div>
    </div>
  )
}
