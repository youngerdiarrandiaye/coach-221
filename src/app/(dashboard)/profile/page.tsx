import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Mail, Shield, Camera } from 'lucide-react'
import { getServerUser } from '@/lib/session'
import { profileDao } from '@/dao/profileDao'
import { clientDao } from '@/dao/clientDao'
import { sessionDao } from '@/dao/sessionDao'
import { ProfileForm } from '@/features/profile/ProfileForm'
import { SignOutButton } from '@/features/profile/SignOutButton'
import { AvatarUpload } from '@/features/profile/AvatarUpload'
import { APP_VERSION } from '@/config/constants'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Mon profil' }

const PALETTES = [
  ['#00FF85','#00CFFF'],['#00CFFF','#7B6FFF'],['#FFD600','#FF6B35'],
  ['#FF3B5C','#FF6B35'],['#7B6FFF','#00CFFF'],['#00FF85','#FFD600'],
]
function avatarGrad(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [c1, c2] = PALETTES[h % PALETTES.length]
  return `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
}

export default async function ProfilePage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [profile, clientCount, sessionCount] = await Promise.all([
    profileDao.findById(user.id),
    clientDao.findAll(user.id).then((c) => c.length),
    sessionDao.countThisWeek(user.id),
  ])

  if (!profile) redirect('/login')

  const initials = `${profile.prenom[0] ?? ''}${profile.nom[0] ?? ''}`.toUpperCase()
  const grad = avatarGrad(`${profile.prenom}${profile.nom}`)

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24 lg:pb-6">
      <h1 className="text-xl font-black text-white">Mon profil</h1>

      {/* Avatar + identité */}
      <div className="tc-card p-5 flex items-center gap-4" style={{ borderColor: 'rgba(0,255,133,0.18)' }}>
        <AvatarUpload
          avatarUrl={profile.avatar_url}
          initials={initials}
          grad={grad}
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-white truncate">{profile.prenom} {profile.nom}</p>
          {profile.specialite && (
            <p className="text-sm font-semibold truncate" style={{ color: '#00FF85' }}>{profile.specialite}</p>
          )}
          {profile.zone && (
            <p className="text-xs text-muted-foreground truncate">{profile.zone}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
            <Camera size={10} className="inline" style={{ color: '#00FF85' }} />
            Appuyez sur la photo pour la modifier
          </p>
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 gap-3">
        <div className="tc-card p-4 text-center" style={{ borderColor: 'rgba(0,255,133,0.18)' }}>
          <p className="text-3xl font-black" style={{ color: '#00FF85', textShadow: '0 0 20px rgba(0,255,133,0.40)' }}>
            {clientCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Client{clientCount > 1 ? 's' : ''}</p>
        </div>
        <div className="tc-card p-4 text-center" style={{ borderColor: 'rgba(0,207,255,0.18)' }}>
          <p className="text-3xl font-black" style={{ color: '#00CFFF', textShadow: '0 0 20px rgba(0,207,255,0.40)' }}>
            {sessionCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Séances cette semaine</p>
        </div>
      </div>

      {/* Email (lecture seule) */}
      <div className="tc-card p-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
        >
          <Mail size={15} style={{ color: '#9090B8' }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="text-sm text-white truncate">{profile.email}</p>
        </div>
        <Shield size={14} style={{ color: '#4A4A7A' }} className="shrink-0" />
      </div>

      {/* Formulaire */}
      <div className="tc-card p-5">
        <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Modifier le profil</h2>
        <ProfileForm profile={profile} />
      </div>

      {/* Déconnexion */}
      <div className="tc-card p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Session</h2>
        <SignOutButton />
      </div>

      {/* Version */}
      <p className="text-center text-xs text-muted-foreground">
        TerangaCoach v{APP_VERSION}
      </p>
    </div>
  )
}
