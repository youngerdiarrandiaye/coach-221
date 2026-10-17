-- Carnet d'entraînement, exercices et mesure d'usage réel (RUM).
-- Après schema.sql, recurrences.sql, add_progress_metrics.sql et 20260909_reliability.sql.
-- Idempotente : peut être rejouée sans erreur. Transaction : tout ou rien.
BEGIN;

-- Cibles des clés étrangères composites (propriété par coach).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sessions'::regclass AND conname = 'sessions_id_coach_client_key') THEN
    ALTER TABLE public.sessions ADD CONSTRAINT sessions_id_coach_client_key UNIQUE (id, coach_id, client_id);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.exercises (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nom               text NOT NULL CHECK (char_length(nom) BETWEEN 2 AND 80),
  groupe_musculaire text CHECK (groupe_musculaire IS NULL OR char_length(groupe_musculaire) BETWEEN 1 AND 40),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercises_id_coach_key UNIQUE (id, coach_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_coach_nom ON public.exercises (coach_id, lower(nom));

CREATE TABLE IF NOT EXISTS public.workout_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL,
  session_id    uuid,
  exercice_id   uuid NOT NULL,
  log_date      date NOT NULL,
  serie_numero  integer NOT NULL CHECK (serie_numero BETWEEN 1 AND 50),
  reps          integer NOT NULL CHECK (reps BETWEEN 1 AND 100),
  charge_kg     numeric(6,2) NOT NULL CHECK (charge_kg >= 0 AND charge_kg <= 1000),
  rpe           numeric(3,1) CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  notes         text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_logs_client_id_fkey FOREIGN KEY (client_id, coach_id)
    REFERENCES public.clients(id, coach_id) ON DELETE CASCADE,
  CONSTRAINT workout_logs_exercice_id_fkey FOREIGN KEY (exercice_id, coach_id)
    REFERENCES public.exercises(id, coach_id) ON DELETE CASCADE,
  -- session_id NULL : la contrainte n'est pas évaluée (MATCH SIMPLE).
  CONSTRAINT workout_logs_session_id_fkey FOREIGN KEY (session_id, coach_id, client_id)
    REFERENCES public.sessions(id, coach_id, client_id) ON DELETE SET NULL (session_id)
);
CREATE INDEX IF NOT EXISTS idx_workout_logs_client_date ON public.workout_logs (coach_id, client_id, log_date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercice ON public.workout_logs (coach_id, exercice_id);

-- Aucune donnée personnelle : seulement nom d'événement, tâche, chemin et mesures.
CREATE TABLE IF NOT EXISTS public.rum_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  task        text CHECK (task IS NULL OR char_length(task) <= 60),
  path        text CHECK (path IS NULL OR char_length(path) <= 120),
  clicks      integer CHECK (clicks IS NULL OR clicks BETWEEN 0 AND 50),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 600000),
  value       numeric,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rum_events_coach_date ON public.rum_events (coach_id, created_at DESC);

ALTER TABLE public.exercises    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rum_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercises: coach full access" ON public.exercises;
CREATE POLICY "exercises: coach full access" ON public.exercises
  FOR ALL TO authenticated USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
DROP POLICY IF EXISTS "workout_logs: coach full access" ON public.workout_logs;
CREATE POLICY "workout_logs: coach full access" ON public.workout_logs
  FOR ALL TO authenticated USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
DROP POLICY IF EXISTS "rum_events: coach full access" ON public.rum_events;
CREATE POLICY "rum_events: coach full access" ON public.rum_events
  FOR ALL TO authenticated USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

REVOKE ALL ON public.exercises, public.workout_logs, public.rum_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises, public.workout_logs, public.rum_events TO authenticated;

-- Saisie atomique de 1 à 20 séries : numérotation à la suite des séries existantes
-- du même client, exercice et jour. SECURITY INVOKER : RLS et FK composites s'appliquent.
CREATE OR REPLACE FUNCTION public.create_workout_logs(
  p_client_id uuid, p_log_date date, p_exercice_id uuid, p_session_id uuid,
  p_notes text, p_sets jsonb
) RETURNS SETOF public.workout_logs LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  start_no integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF p_sets IS NULL OR jsonb_typeof(p_sets) <> 'array' OR jsonb_array_length(p_sets) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Séries invalides' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(max(serie_numero), 0) INTO start_no FROM public.workout_logs
  WHERE coach_id = auth.uid() AND client_id = p_client_id AND exercice_id = p_exercice_id AND log_date = p_log_date;
  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.workout_logs (coach_id, client_id, session_id, exercice_id, log_date, serie_numero, reps, charge_kg, rpe, notes)
    SELECT auth.uid(), p_client_id, p_session_id, p_exercice_id, p_log_date, start_no + s.ord::integer,
           (s.elem->>'reps')::integer, (s.elem->>'charge_kg')::numeric, (s.elem->>'rpe')::numeric,
           CASE WHEN s.ord = 1 THEN p_notes END
    FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS s(elem, ord)
    RETURNING *
  )
  SELECT * FROM ins ORDER BY serie_numero;
END;
$$;
REVOKE ALL ON FUNCTION public.create_workout_logs(uuid,date,uuid,uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workout_logs(uuid,date,uuid,uuid,text,jsonb) TO authenticated;

COMMIT;
