import { AsyncLocalStorage } from 'node:async_hooks'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { hardenSessionCookie } from '@/lib/sessionCookie'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Le générique Database est omis volontairement : @supabase/ssr 0.12.x ne
// propage pas correctement le type vers supabase-js, ce qui fait résoudre
// Update/Insert en `never`. La sécurité des types est assurée par les Row
// types dans chaque DAO (typage explicite des retours).
const sessionClient = () => {
  const cookieStore = cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, hardenSessionCookie(options))
        )
      },
    },
  })
}

type ServerClient = ReturnType<typeof sessionClient>

/**
 * Lecture au nom d'un client (espace client) : le compte d'un client n'a aucun droit sur les tables du coach (le RLS ne
 * lui montre rien, voulu). Pendant l'exécution de `run`, les DAO utilisent donc le client à droits complets fourni par
 * `elevated`. À n'appeler QUE depuis src/server/clientSpace.ts, après avoir établi le compte client depuis la session ;
 * l'identifiant du client et celui du coach passés aux DAO viennent de ce compte, jamais de la requête.
 */
const elevatedClient = new AsyncLocalStorage<ServerClient>()
export const runWithElevatedClient = <T>(client: unknown, run: () => Promise<T>): Promise<T> => elevatedClient.run(client as ServerClient, run)

export const createServerSupabaseClient = (): ServerClient => elevatedClient.getStore() ?? sessionClient()
