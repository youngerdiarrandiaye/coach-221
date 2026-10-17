import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import lazyLoad from 'next/dynamic'
import type { Metadata } from 'next'
import { ArrowLeft, FileBarChart2 } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { progressDao } from '@/dao/progressDao'
import { DeleteProgressButton } from '@/features/progress/DeleteProgressButton'
import { IMC_LABELS, OBJECTIF_LABELS } from '@/config/constants'
import { Skeleton } from '@/components/ui/skeleton'

const ProgressTabs = lazyLoad(
  () => import('@/features/progress/ProgressTabs').then((m) => ({ default: m.ProgressTabs })),
  { ssr: false, loading: () => <div className="tc-card p-4"><Skeleton className="h-48 w-full rounded-lg" /></div> }
)

const AddProgressForm = lazyLoad(
  () => import('@/features/progress/AddProgressForm').then((m) => ({ default: m.AddProgressForm })),
  { ssr: false, loading: () => <Skeleton className="h-14 w-full rounded-xl" /> }
)

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Progression client' }
}

interface Props {
  params: { clientId: string }
}

function getImcLabel(imc: number): string {
  return IMC_LABELS.find((l) => imc < l.max)?.label ?? 'N/A'
}

function getImcColor(imc: number): string {
  if (imc < 18.5) return 'text-blue-400'
  if (imc < 25)   return 'text-green-400'
  if (imc < 30)   return 'text-yellow-400'
  return 'text-red-400'
}

export default async function ClientProgressPage({ params }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [client, entries] = await Promise.all([
    clientDao.findById(params.clientId, user.id),
    progressDao.findByClient(params.clientId, user.id),
  ])

  if (!client) notFound()

  const latest   = entries.length > 0 ? entries[entries.length - 1] : null
  const first    = entries.length > 0 ? entries[0] : null
  const evolution = latest?.poids_kg !== null && first?.poids_kg !== null && latest && first && entries.length > 1
    ? latest.poids_kg! - first.poids_kg!
    : null

  // Âge calculé depuis date_naissance
  const clientAge = (() => {
    if (!client.date_naissance) return null
    const b = new Date(client.date_naissance)
    const t = new Date()
    let age = t.getFullYear() - b.getFullYear()
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
    return age
  })()

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/progress"
          className="flex h-10 w-10 items-center justify-center rounded-2xl transition-all hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <ArrowLeft size={16} style={{ color: '#9090B8' }} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">{client.prenom} {client.nom}</h1>
          {client.objectif && (
            <p className="text-xs text-muted">{OBJECTIF_LABELS[client.objectif] ?? client.objectif}</p>
          )}
        </div>
        <Link
          href={`/progress/${client.id}/rapport`}
          className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold transition-all hover:scale-105 shrink-0"
          style={{ background: 'rgba(0,255,133,0.10)', border: '1px solid rgba(0,255,133,0.28)', color: '#00FF85' }}
        >
          <FileBarChart2 size={13} />
          <span className="hidden xs:inline">Rapport</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="tc-card p-3 text-center">
          <p className="text-xs text-muted mb-1">Poids initial</p>
          <p className="text-base font-bold text-foreground">
            {client.poids_initial_kg ? `${client.poids_initial_kg} kg` : '—'}
          </p>
        </div>
        <div className="tc-card p-3 text-center">
          <p className="text-xs text-muted mb-1">Poids actuel</p>
          <p className="text-base font-bold text-foreground">
            {latest?.poids_kg !== null && latest ? `${latest.poids_kg} kg` : '—'}
          </p>
        </div>
        <div className="tc-card p-3 text-center">
          <p className="text-xs text-muted mb-1">Évolution</p>
          <p className={`text-base font-bold ${evolution === null ? 'text-muted' : evolution < 0 ? 'text-green-400' : evolution > 0 ? 'text-red-400' : 'text-foreground'}`}>
            {evolution === null ? '—' : evolution === 0 ? '0 kg' : `${evolution > 0 ? '+' : ''}${evolution.toFixed(1)} kg`}
          </p>
        </div>
      </div>

      {/* IMC actuel */}
      {latest?.imc !== null && latest?.imc !== undefined && (
        <div className="tc-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">IMC actuel</p>
            <p className={`text-2xl font-bold ${getImcColor(latest.imc!)}`}>{latest.imc}</p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-medium ${getImcColor(latest.imc!)}`}>{getImcLabel(latest.imc!)}</p>
            {client.taille_cm && <p className="text-xs text-muted">Taille : {client.taille_cm} cm</p>}
          </div>
        </div>
      )}

      {/* Graphiques par métrique */}
      {entries.length >= 2 && (
        <ProgressTabs
          entries={entries}
          poidsInitial={client.poids_initial_kg}
          clientSexe={client.sexe}
          clientAge={clientAge}
        />
      )}

      {/* Ajouter mesure */}
      <AddProgressForm clientId={client.id} />

      {/* Historique */}
      {entries.length > 0 && (
        <div className="tc-card overflow-hidden">
          <div className="p-4 pb-0">
            <h2 className="text-sm font-semibold text-foreground">Historique ({entries.length})</h2>
          </div>
          <ul className="divide-y divide-border mt-3">
            {[...entries].reverse().map((entry, idx) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {entry.poids_kg !== null ? `${entry.poids_kg} kg` : '—'}
                    </span>
                    {entry.imc !== null && (
                      <span className={`text-xs font-medium ${getImcColor(entry.imc!)}`}>
                        IMC {entry.imc}
                      </span>
                    )}
                    {idx === 0 && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                        Dernier
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {new Date(entry.mesure_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </p>
                </div>
                <DeleteProgressButton entryId={entry.id} clientId={client.id} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {entries.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          Aucune mesure — utilisez le formulaire ci-dessus pour commencer le suivi.
        </p>
      )}
    </div>
  )
}
