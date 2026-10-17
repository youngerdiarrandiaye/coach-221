-- Après schema.sql, recurrences.sql et add_progress_metrics.sql.
-- Transaction : une incohérence existante annule toute cette migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nom, prenom)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nom', ''), COALESCE(NEW.raw_user_meta_data->>'prenom', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Une seule relation PostgREST vers clients, avec propriété composite.
DO $$
DECLARE table_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.clients'::regclass AND conname = 'clients_id_coach_key') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_id_coach_key UNIQUE (id, coach_id);
  END IF;
  FOREACH table_name IN ARRAY ARRAY['sessions', 'payments', 'progress_entries', 'coach_notes', 'session_recurrences'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_client_id_fkey');
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (client_id, coach_id) REFERENCES public.clients(id, coach_id) ON DELETE CASCADE', table_name, table_name || '_client_id_fkey');
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "sessions: recurrence ownership" ON public.sessions;
CREATE POLICY "sessions: recurrence ownership" ON public.sessions AS RESTRICTIVE
FOR ALL TO authenticated USING (true)
WITH CHECK (recurrence_id IS NULL OR EXISTS (
  SELECT 1 FROM public.session_recurrences r
  WHERE r.id = recurrence_id AND r.coach_id = sessions.coach_id AND r.client_id = sessions.client_id
));

-- Règle et séances insérées dans la même transaction, avec fin explicite.
CREATE OR REPLACE FUNCTION public.create_session_recurrence(
  p_client_id uuid, p_titre text, p_description text, p_duree integer,
  p_heure text, p_jours integer[], p_date_debut date, p_date_fin date
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  series_id uuid;
  dates timestamptz[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND coach_id = auth.uid()) THEN
    RAISE EXCEPTION 'Client introuvable' USING ERRCODE = '42501';
  END IF;
  IF p_date_debut IS NULL OR p_date_fin IS NULL OR p_date_fin < p_date_debut OR p_date_fin - p_date_debut > 366
    OR p_heure IS NULL OR p_heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR p_duree IS NULL OR p_duree NOT BETWEEN 5 AND 480
    OR p_titre IS NULL OR length(trim(p_titre)) NOT BETWEEN 2 AND 100
    OR COALESCE(cardinality(p_jours), 0) NOT BETWEEN 1 AND 7
    OR EXISTS (SELECT 1 FROM unnest(p_jours) d WHERE d IS NULL OR d NOT BETWEEN 0 AND 6)
  THEN RAISE EXCEPTION 'Paramètres de récurrence invalides' USING ERRCODE = '22023'; END IF;

  SELECT array_agg(scheduled ORDER BY scheduled) INTO dates FROM (
    SELECT ((p_date_debut + day_offset) + p_heure::time) AT TIME ZONE 'Africa/Dakar' AS scheduled
    FROM generate_series(0, p_date_fin - p_date_debut) AS day_offset
    WHERE extract(dow FROM p_date_debut + day_offset)::integer = ANY(p_jours)
  ) candidates WHERE scheduled > now();
  IF COALESCE(cardinality(dates), 0) = 0 THEN
    RAISE EXCEPTION 'Aucune séance future dans cette période' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.session_recurrences (coach_id, client_id, titre, description, duree_minutes, heure, jours, date_debut, date_fin)
  VALUES (auth.uid(), p_client_id, p_titre, p_description, p_duree, p_heure, p_jours, p_date_debut, p_date_fin)
  RETURNING id INTO series_id;
  INSERT INTO public.sessions (coach_id, client_id, recurrence_id, titre, description, duree_minutes, date_heure, statut)
  SELECT auth.uid(), p_client_id, series_id, p_titre, p_description, p_duree, scheduled, 'PLANIFIEE'
  FROM unnest(dates) AS scheduled;
  RETURN series_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_session_recurrence(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.session_recurrences WHERE id = p_id AND coach_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Série introuvable' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.sessions WHERE recurrence_id = p_id AND coach_id = auth.uid() AND statut = 'PLANIFIEE' AND date_heure > now();
  DELETE FROM public.session_recurrences WHERE id = p_id AND coach_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.create_session_recurrence(uuid,text,text,integer,text,integer[],date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_session_recurrence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_session_recurrence(uuid,text,text,integer,text,integer[],date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_session_recurrence(uuid) TO authenticated;

-- Réservation unique par séance et horaire, accessible au cron seulement.
-- Aucun nouvel envoi automatique après timeout (acceptation Meta incertaine).
CREATE TABLE IF NOT EXISTS public.session_reminders (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed', 'unknown')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, scheduled_for)
);
ALTER TABLE public.session_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_reminders FROM anon, authenticated;
GRANT ALL ON public.session_reminders TO service_role;

-- Agrégats indépendants : les jointures multiples multipliaient les montants.
-- security_invoker applique les politiques de l'appelant également à la vue.
CREATE OR REPLACE VIEW public.dashboard_stats WITH (security_invoker = true) AS
SELECT p.id AS coach_id,
  (SELECT count(*) FROM public.clients c WHERE c.coach_id = p.id AND c.actif) AS total_clients_actifs,
  (SELECT count(*) FROM public.sessions s WHERE s.coach_id = p.id
    AND s.date_heure >= date_trunc('week', now() AT TIME ZONE 'Africa/Dakar') AT TIME ZONE 'Africa/Dakar'
    AND s.date_heure < (date_trunc('week', now() AT TIME ZONE 'Africa/Dakar') + interval '7 days') AT TIME ZONE 'Africa/Dakar') AS seances_semaine,
  (SELECT COALESCE(sum(pay.montant), 0) FROM public.payments pay WHERE pay.coach_id = p.id AND pay.statut = 'PAYE'
    AND pay.date_paiement >= date_trunc('month', now() AT TIME ZONE 'Africa/Dakar')::date
    AND pay.date_paiement < (date_trunc('month', now() AT TIME ZONE 'Africa/Dakar') + interval '1 month')::date) AS paiements_mois,
  (SELECT count(*) FROM public.sessions s WHERE s.coach_id = p.id AND s.statut = 'PLANIFIEE' AND s.date_heure > now()) AS seances_a_venir
FROM public.profiles p;

COMMIT;
