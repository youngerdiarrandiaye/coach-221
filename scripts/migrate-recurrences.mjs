// scripts/migrate-recurrences.mjs
// Crée la table session_recurrences + colonne recurrence_id sur sessions
// Usage : node scripts/migrate-recurrences.mjs
// Prérequis : DATABASE_URL dans .env.local

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Client } = pg
const __dir = dirname(fileURLToPath(import.meta.url))

// ── Charger .env.local ────────────────────────────────────
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

const dbUrl = env.DATABASE_URL
if (!dbUrl) {
  const proj = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://','').replace('.supabase.co','')
  console.error(`
❌  DATABASE_URL manquant dans .env.local

Ajoute cette ligne dans .env.local :
  DATABASE_URL=postgresql://postgres.${proj}:[MOT_DE_PASSE]@aws-0-REGION.pooler.supabase.com:6543/postgres

Trouve ton URL dans :
  Supabase Dashboard → Settings → Database → Connection string → Transaction pooler
  (Remplace [YOUR-PASSWORD] par ton mot de passe de base de données)
`)
  process.exit(1)
}

// ── Migration SQL ─────────────────────────────────────────
const SQL = `
CREATE TABLE IF NOT EXISTS public.session_recurrences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
  titre           TEXT NOT NULL,
  description     TEXT,
  duree_minutes   INTEGER NOT NULL DEFAULT 60 CHECK (duree_minutes BETWEEN 5 AND 480),
  heure           TEXT NOT NULL,
  jours           INTEGER[] NOT NULL,
  date_debut      DATE NOT NULL,
  date_fin        DATE,
  actif           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'session_recurrences' AND indexname = 'idx_recurrences_coach_id'
  ) THEN
    CREATE INDEX idx_recurrences_coach_id  ON public.session_recurrences(coach_id);
    CREATE INDEX idx_recurrences_client_id ON public.session_recurrences(client_id);
    CREATE INDEX idx_recurrences_actif     ON public.session_recurrences(coach_id, actif);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_updated_at_recurrences()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recurrences_updated_at ON public.session_recurrences;
CREATE TRIGGER trg_recurrences_updated_at
  BEFORE UPDATE ON public.session_recurrences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_recurrences();

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS recurrence_id UUID
    REFERENCES public.session_recurrences(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'sessions' AND indexname = 'idx_sessions_recurrence'
  ) THEN
    CREATE INDEX idx_sessions_recurrence ON public.sessions(recurrence_id);
  END IF;
END $$;

ALTER TABLE public.session_recurrences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'session_recurrences' AND policyname = 'recurrences: coach full access'
  ) THEN
    CREATE POLICY "recurrences: coach full access" ON public.session_recurrences
      FOR ALL
      USING    (auth.uid() = coach_id)
      WITH CHECK (auth.uid() = coach_id);
  END IF;
END $$;
`

// ── Connexion et exécution ────────────────────────────────
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

try {
  console.log('🔌  Connexion à la base de données…')
  await client.connect()
  console.log('✅  Connecté')

  console.log('⚙️   Exécution de la migration…')
  await client.query(SQL)

  console.log('✅  Table session_recurrences créée')
  console.log('✅  Colonne recurrence_id ajoutée à sessions')
  console.log('✅  RLS activé')
  console.log('🎉  Migration terminée — relance l\'application')
} catch (err) {
  console.error('❌  Erreur :', err.message)
  process.exit(1)
} finally {
  await client.end()
}
