import { cache } from 'react'
import { createServerSupabaseClient } from '@/config/supabase.server'

// React.cache déduplique les appels dans un même arbre de rendu serveur.
// Layout + Page appellent getServerUser() → une seule requête réseau.
export const getServerUser = cache(async () => {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
