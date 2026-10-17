import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { Pencil, Phone, Mail, Calendar, Ruler, Weight, CalendarPlus, CreditCard } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { clientDao } from '@/dao/clientDao'
import { sessionDao } from '@/dao/sessionDao'
import { paymentDao } from '@/dao/paymentDao'
import { profileDao } from '@/dao/profileDao'
import { DeleteClientButton } from '@/features/clients/DeleteClientButton'
import { ExportClientPDFButton } from '@/features/clients/ExportClientPDFButton'
import { UpcomingSessions } from '@/features/dashboard/UpcomingSessions'
import { OBJECTIF_LABELS } from '@/config/constants'
import { formatDate } from '@/utils/format'
import type { LucideIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props { params: { id: string } }

export async function generateMetadata() {
  return { title: 'Fiche client' }
}

const PALETTES = [
  ['#00FF85','#00CFFF'],['#00CFFF','#7B6FFF'],['#FFD600','#FF6B35'],
  ['#FF3B5C','#FF6B35'],['#7B6FFF','#00CFFF'],['#00FF85','#FFD600'],
]
function avatarGrad(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [c1, c2] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
}

export default async function ClientDetailPage({ params }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [client, upcomingSessions, allSessions, clientPayments, coach] = await Promise.all([
    clientDao.findById(params.id, user.id),
    sessionDao.findUpcoming(user.id, 3).then(s => s.filter(s => s.client_id === params.id)),
    sessionDao.findByClient(params.id, user.id),
    paymentDao.findByClient(params.id, user.id),
    profileDao.findById(user.id),
  ])

  if (!client) notFound()

  const fullName = `${client.prenom} ${client.nom}`
  const initials = `${client.prenom[0]}${client.nom[0]}`.toUpperCase()
  const grad = avatarGrad(fullName)

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      {/* Header card */}
      <div className="tc-card p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-black text-black"
            style={{ background: grad, boxShadow: '0 0 24px rgba(0,255,133,0.25)' }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-white">{fullName}</h1>
            {client.objectif && (
              <span
                className="inline-block mt-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ background: 'rgba(0,255,133,0.12)', border: '1px solid rgba(0,255,133,0.30)', color: '#00FF85' }}
              >
                {OBJECTIF_LABELS[client.objectif] ?? client.objectif}
              </span>
            )}
          </div>
        </div>
        {/* Action buttons — own row so they never overflow on narrow screens */}
        <div
          className="mt-3 pt-3 flex gap-2 justify-end flex-wrap"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <ExportClientPDFButton
            client={client}
            sessions={allSessions}
            payments={clientPayments}
            coachName={coach ? `${coach.prenom} ${coach.nom}` : ''}
          />
          <Link
            href={`/clients/${client.id}/edit`}
            className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold transition-all hover:scale-105"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#9090B8' }}
          >
            <Pencil size={14} /> Modifier
          </Link>
          <DeleteClientButton clientId={client.id} clientName={fullName} />
        </div>
      </div>

      {/* Infos */}
      <div className="tc-card p-4 space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Informations</h2>
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
          <InfoRow icon={Phone} label="Téléphone" value={client.telephone} color="#00FF85" />
          {client.email && <InfoRow icon={Mail} label="Email" value={client.email} color="#00CFFF" />}
          {client.date_naissance && (
            <InfoRow icon={Calendar} label="Naissance" value={formatDate(client.date_naissance)} color="#FFD600" />
          )}
          {client.sexe && (
            <InfoRow icon={Calendar} label="Sexe" value={client.sexe === 'HOMME' ? 'Homme' : 'Femme'} color="#7B6FFF" />
          )}
          {client.taille_cm && (
            <InfoRow icon={Ruler} label="Taille" value={`${client.taille_cm} cm`} color="#00CFFF" />
          )}
          {client.poids_initial_kg && (
            <InfoRow icon={Weight} label="Poids initial" value={`${client.poids_initial_kg} kg`} color="#FF6B35" />
          )}
        </div>
      </div>

      {/* Actions rapides */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/sessions/new?client=${client.id}`}
          className="tc-card flex items-center justify-center gap-2 p-3.5 text-sm font-bold transition-all hover:scale-[1.02]"
          style={{ borderColor: 'rgba(0,207,255,0.30)', color: '#00CFFF' }}
        >
          <CalendarPlus size={15} style={{ color: '#00CFFF' }} />
          + Séance
        </Link>
        <Link
          href={`/payments/new?client=${client.id}`}
          className="tc-card flex items-center justify-center gap-2 p-3.5 text-sm font-bold transition-all hover:scale-[1.02]"
          style={{ borderColor: 'rgba(0,255,133,0.30)', color: '#00FF85' }}
        >
          <CreditCard size={15} style={{ color: '#00FF85' }} />
          + Paiement
        </Link>
      </div>

      {/* Séances à venir */}
      {upcomingSessions.length > 0 && (
        <UpcomingSessions sessions={upcomingSessions} />
      )}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string; color: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="mt-0.5 shrink-0" style={{ color }} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-white truncate">{value}</p>
      </div>
    </div>
  )
}
