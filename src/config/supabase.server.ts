import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Le générique Database est omis volontairement : @supabase/ssr 0.12.x ne
// propage pas correctement le type vers supabase-js, ce qui fait résoudre
// Update/Insert en `never`. La sécurité des types est assurée par les Row
// types dans chaque DAO (typage explicite des retours).
export const createServerSupabaseClient = () => {
  const cookieStore = cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      },
    },
  })
}
