// scripts/setup-storage.mjs
// Crée automatiquement le bucket Supabase Storage "avatars"
// Usage : node scripts/setup-storage.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Charger .env.local
const env = {}
try {
  const raw = readFileSync(join(__dir, '..', '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  console.error('❌  .env.local introuvable')
  process.exit(1)
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log('🔌  Connexion à', url)

// ── Créer le bucket "avatars" ──────────────────────────────
const { error } = await supabase.storage.createBucket('avatars', {
  public:           true,
  fileSizeLimit:    5 * 1024 * 1024, // 5 Mo
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
})

if (error) {
  if (error.message.toLowerCase().includes('already exists') ||
      error.message.toLowerCase().includes('duplicate')) {
    console.log('✅  Bucket "avatars" existe déjà — rien à faire')
  } else {
    console.error('❌  Erreur création bucket :', error.message)
    process.exit(1)
  }
} else {
  console.log('✅  Bucket "avatars" créé (public, 5 Mo max, JPEG/PNG/WebP)')
}

// ── Vérification ──────────────────────────────────────────
const { data: bucket, error: getErr } = await supabase.storage.getBucket('avatars')
if (!getErr && bucket) {
  console.log('📦  Statut :', bucket.public ? 'public ✓' : 'privé ✗')
}

console.log('🎉  Setup Storage terminé')
