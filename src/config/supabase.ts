import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/entities/database.types'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('placeholder')

export const createClient = () =>
  createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON)
