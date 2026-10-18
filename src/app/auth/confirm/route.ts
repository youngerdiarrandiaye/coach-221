import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/entities/database.types'
import { callbackDestination } from '@/lib/authRoutes'

/**
 * Confirmation par e-mail avec un jeton (token_hash) : confirmation d'inscription, réinitialisation de mot de passe,
 * invitation. Contrairement à l'échange de code (/auth/callback, qui exige le même navigateur que la demande), ce lien
 * marche depuis n'importe quel appareil : on clique dans la messagerie et la session s'ouvre directement.
 * Le lien est celui des modèles d'e-mail (deploy/mail/*.html) : {{ .SiteURL }}/auth/confirm?token_hash=…&type=…&next=…
 */
const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const applicationOrigin = process.env.FRONTEND_ORIGIN ? new URL(process.env.FRONTEND_ORIGIN).origin : origin
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = callbackDestination(searchParams.get('next'))

  if (tokenHash && type && TYPES.includes(type)) {
    const cookieStore = cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: cookiesToSet => {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      },
    )
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${applicationOrigin}${next}`)
  }

  return NextResponse.redirect(`${applicationOrigin}/login?error=lien_invalide`)
}
