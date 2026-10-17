-- ============================================================
-- TerangaCoach — Schéma SQL complet
-- Exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- recherche full-text

-- ============================================================
-- 1. ENUMS
-- ============================================================
CREATE TYPE session_status   AS ENUM ('PLANIFIEE', 'EFFECTUEE', 'ANNULEE');
CREATE TYPE payment_status   AS ENUM ('PAYE', 'EN_ATTENTE', 'ANNULE');
CREATE TYPE payment_method   AS ENUM ('ESPECES', 'WAVE', 'ORANGE_MONEY');
CREATE TYPE client_objectif  AS ENUM (
  'PERTE_DE_POIDS', 'PRISE_DE_MASSE', 'CARDIO',
  'TONIFICATION', 'REMISE_EN_FORME', 'REEDUCATION', 'AUTRE'
);
CREATE TYPE client_sexe      AS ENUM ('HOMME', 'FEMME');

-- ============================================================
-- 2. TRIGGER FUNCTION — updated_at automatique
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. TABLE : profiles
-- Créé automatiquement à l'inscription (trigger sur auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  nom           TEXT NOT NULL DEFAULT '',
  prenom        TEXT NOT NULL DEFAULT '',
  telephone     TEXT,
  specialite    TEXT,
  zone          TEXT,
  description   TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-création du profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. TABLE : clients
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  prenom            TEXT NOT NULL,
  telephone         TEXT NOT NULL,
  email             TEXT,
  date_naissance    DATE,
  sexe              client_sexe,
  taille_cm         NUMERIC(5,1) CHECK (taille_cm BETWEEN 50 AND 250),
  poids_initial_kg  NUMERIC(5,1) CHECK (poids_initial_kg BETWEEN 20 AND 500),
  objectif          client_objectif,
  avatar_url        TEXT,
  actif             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_coach_id ON public.clients(coach_id);
CREATE INDEX idx_clients_actif    ON public.clients(coach_id, actif);
CREATE INDEX idx_clients_search   ON public.clients USING gin (
  (to_tsvector('french', nom || ' ' || prenom || ' ' || COALESCE(telephone, '')))
);

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. TABLE : sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titre           TEXT NOT NULL,
  description     TEXT,
  date_heure      TIMESTAMPTZ NOT NULL,
  duree_minutes   INTEGER NOT NULL DEFAULT 60 CHECK (duree_minutes BETWEEN 5 AND 480),
  statut          session_status NOT NULL DEFAULT 'PLANIFIEE',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_coach_id   ON public.sessions(coach_id);
CREATE INDEX idx_sessions_client_id  ON public.sessions(client_id);
CREATE INDEX idx_sessions_date       ON public.sessions(coach_id, date_heure DESC);
CREATE INDEX idx_sessions_statut     ON public.sessions(coach_id, statut);

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. TABLE : progress_entries
-- ============================================================
CREATE TABLE IF NOT EXISTS public.progress_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  poids_kg      NUMERIC(5,1) CHECK (poids_kg BETWEEN 20 AND 500),
  imc           NUMERIC(4,1),
  notes         TEXT,
  mesure_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Calcul automatique de l'IMC à partir du poids et de la taille du client
CREATE OR REPLACE FUNCTION calculate_imc()
RETURNS TRIGGER AS $$
DECLARE
  v_taille NUMERIC;
BEGIN
  SELECT taille_cm INTO v_taille FROM public.clients WHERE id = NEW.client_id;
  IF NEW.poids_kg IS NOT NULL AND v_taille IS NOT NULL AND v_taille > 0 THEN
    NEW.imc := ROUND((NEW.poids_kg / POWER(v_taille / 100.0, 2))::NUMERIC, 1);
  ELSE
    NEW.imc := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_progress_imc
  BEFORE INSERT OR UPDATE ON public.progress_entries
  FOR EACH ROW EXECUTE FUNCTION calculate_imc();

CREATE INDEX idx_progress_client_id ON public.progress_entries(client_id);
CREATE INDEX idx_progress_coach_id  ON public.progress_entries(coach_id);
CREATE INDEX idx_progress_date      ON public.progress_entries(client_id, mesure_date DESC);

-- ============================================================
-- 7. TABLE : payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  montant         NUMERIC(10,0) NOT NULL CHECK (montant > 0),
  methode         payment_method NOT NULL,
  statut          payment_status NOT NULL DEFAULT 'PAYE',
  description     TEXT,
  date_paiement   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_coach_id     ON public.payments(coach_id);
CREATE INDEX idx_payments_client_id    ON public.payments(client_id);
CREATE INDEX idx_payments_date         ON public.payments(coach_id, date_paiement DESC);
CREATE INDEX idx_payments_statut       ON public.payments(coach_id, statut);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. TABLE : coach_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coach_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contenu     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_client_id ON public.coach_notes(client_id);

CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.coach_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_notes    ENABLE ROW LEVEL SECURITY;

-- profiles : chaque coach voit et modifie uniquement son profil
CREATE POLICY "profiles: own read"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles: own update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- clients
CREATE POLICY "clients: coach full access" ON public.clients
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- sessions
CREATE POLICY "sessions: coach full access" ON public.sessions
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- progress_entries
CREATE POLICY "progress: coach full access" ON public.progress_entries
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- payments
CREATE POLICY "payments: coach full access" ON public.payments
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- coach_notes
CREATE POLICY "notes: coach full access" ON public.coach_notes
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

-- ============================================================
-- 10. STORAGE — Buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true,  5242880,  ARRAY['image/jpeg','image/png','image/webp']),
  ('exports', 'exports', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies : avatars (public read, owner write)
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

-- Storage policies : exports (owner only)
CREATE POLICY "exports: owner access"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'exports' AND auth.uid()::TEXT = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'exports' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

-- ============================================================
-- 11. VUE : dashboard_stats (optimise les requêtes dashboard)
-- ============================================================
CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT
  p.id                                                   AS coach_id,
  COUNT(DISTINCT c.id) FILTER (WHERE c.actif = TRUE)     AS total_clients_actifs,
  COUNT(DISTINCT s.id) FILTER (
    WHERE s.date_heure >= date_trunc('week', NOW())
    AND   s.date_heure <  date_trunc('week', NOW()) + INTERVAL '7 days'
  )                                                      AS seances_semaine,
  COALESCE(SUM(pay.montant) FILTER (
    WHERE pay.statut = 'PAYE'
    AND   date_trunc('month', pay.date_paiement) = date_trunc('month', CURRENT_DATE)
  ), 0)                                                  AS paiements_mois,
  COUNT(DISTINCT s2.id) FILTER (
    WHERE s2.statut = 'PLANIFIEE' AND s2.date_heure > NOW()
  )                                                      AS seances_a_venir
FROM public.profiles p
LEFT JOIN public.clients c         ON c.coach_id = p.id
LEFT JOIN public.sessions s        ON s.coach_id = p.id
LEFT JOIN public.sessions s2       ON s2.coach_id = p.id
LEFT JOIN public.payments pay      ON pay.coach_id = p.id
GROUP BY p.id;
