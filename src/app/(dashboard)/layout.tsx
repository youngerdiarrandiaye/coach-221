import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/config/supabase.server'
import { profileDao } from '@/dao/profileDao'
import { Providers } from '@/lib/providers'
import { AppShell } from '@/components/layout/AppShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user = null
  let profile = null

  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    redirect('/login')
  }

  if (!user) redirect('/login')

  try {
    profile = await profileDao.findById(user.id)
  } catch {
    // Profile unavailable — render shell without profile data
  }

  return (
    <Providers>
      <AppShell profile={profile}>
        {children}
      </AppShell>
    </Providers>
  )
}
