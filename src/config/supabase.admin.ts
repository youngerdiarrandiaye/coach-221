import { createClient } from '@supabase/supabase-js'

/** Client à droits complets (contourne le RLS) : serveur uniquement. Une configuration absente échoue franchement. */
export const createAdminSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Configuration Supabase incomplète : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
