import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/entities/database.types'
import { callbackDestination } from '@/lib/authRoutes'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const applicationOrigin = process.env.FRONTEND_ORIGIN
    ? new URL(process.env.FRONTEND_ORIGIN).origin
    : origin
  const code = searchParams.get('code')
  const next = callbackDestination(searchParams.get('next'))

  if (code) {
    const cookieStore = cookies()

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${applicationOrigin}${next}`)
    }
  }

  return NextResponse.redirect(`${applicationOrigin}/login?error=auth_callback_error`)
}
