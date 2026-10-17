-- ============================================================
-- TerangaCoach — Séances récurrentes
-- Exécuter dans : Supabase Dashboard > SQL Editor (après schema.sql)
-- ============================================================

-- TABLE : session_recurrences
CREATE TABLE IF NOT EXISTS public.session_recurrences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
  titre           TEXT NOT NULL,
  description     TEXT,
  duree_minutes   INTEGER NOT NULL DEFAULT 60 CHECK (duree_minutes BETWEEN 5 AND 480),
  heure           TEXT NOT NULL,        -- ex: "09:00"
  jours           INTEGER[] NOT NULL,   -- [1,3,5] = Lun,Mer,Ven (0=Dim,1=Lun…6=Sam)
  date_debut      DATE NOT NULL,
  date_fin        DATE,                 -- NULL = ouvert (16 semaines calculées côté app)
  actif           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurrences_coach_id  ON public.session_recurrences(coach_id);
CREATE INDEX IF NOT EXISTS idx_recurrences_client_id ON public.session_recurrences(client_id);
CREATE INDEX IF NOT EXISTS idx_recurrences_actif     ON public.session_recurrences(coach_id, actif);

CREATE TRIGGER trg_recurrences_updated_at
  BEFORE UPDATE ON public.session_recurrences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ajout de recurrence_id sur sessions
-- ON DELETE SET NULL : la suppression de la règle conserve les séances passées
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS recurrence_id UUID
    REFERENCES public.session_recurrences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_recurrence ON public.sessions(recurrence_id);

-- RLS
ALTER TABLE public.session_recurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurrences: coach full access" ON public.session_recurrences
  FOR ALL
  USING    (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);
