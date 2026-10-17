-- Fiabilisation CoachSen : limitation de débit, suivi des crons, idempotence, audit, effacement d'un client,
-- titres proposés et maintenance (rétention).
-- À jouer après schema.sql, recurrences.sql et les migrations précédentes (jusqu'à 20261014_agenda.sql).
-- Idempotente : peut être rejouée sans erreur. Aucune donnée existante n'est supprimée ou modifiée.
-- Retour arrière documenté : supabase/migrations/down/20261015_hardening_down.sql (à ne pas jouer automatiquement).
--
-- Tables de service (rate_limits, cron_runs, idempotency_keys, audit_log) : RLS activée SANS politique et aucun droit
-- pour anon/authenticated ; elles ne sont utilisées que par le serveur avec la clé de service (jamais par un navigateur).
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Limitation de débit (fenêtre fixe, incrément atomique)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text        NOT NULL CHECK (char_length(key) BETWEEN 1 AND 200),
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_start timestamptz;
  v_count integer;
BEGIN
  IF p_key IS NULL OR char_length(p_key) NOT BETWEEN 1 AND 200
     OR p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 86400
     OR p_max IS NULL OR p_max NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'Paramètres de limitation invalides' USING ERRCODE = '22023';
  END IF;
  v_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.rate_limits AS r (key, window_start, count) VALUES (p_key, v_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO v_count;
  allowed := v_count <= p_max;
  retry_after := CASE WHEN allowed THEN 0
    ELSE greatest(1, ceil(extract(epoch FROM (v_start + make_interval(secs => p_window_seconds) - now())))::integer) END;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Suivi des tâches planifiées
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job         text        NOT NULL CHECK (char_length(job) BETWEEN 1 AND 60),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok          boolean     NOT NULL DEFAULT false,
  checked     integer     NOT NULL DEFAULT 0,
  sent        integer     NOT NULL DEFAULT 0,
  failed      integer     NOT NULL DEFAULT 0,
  error       text        CHECK (error IS NULL OR char_length(error) <= 200)
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job_started ON public.cron_runs (job, started_at DESC);

-- Dernière exécution terminée par tâche (pour la sonde de disponibilité).
CREATE OR REPLACE FUNCTION public.cron_last_runs()
RETURNS TABLE (job text, last_run_at timestamptz, last_ok boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT DISTINCT ON (c.job) c.job, COALESCE(c.finished_at, c.started_at), c.ok
  FROM public.cron_runs c
  WHERE c.finished_at IS NOT NULL
  ORDER BY c.job, c.finished_at DESC
$$;

-- ---------------------------------------------------------------------------
-- 3. Idempotence des écritures (status NULL = en cours de traitement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  coach_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key          uuid        NOT NULL,
  route        text        NOT NULL CHECK (char_length(route) BETWEEN 1 AND 100),
  request_hash text        NOT NULL CHECK (char_length(request_hash) BETWEEN 1 AND 128),
  response     jsonb,
  status       integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON public.idempotency_keys (created_at);

-- Réservation atomique d'une clé. Résultats : new (le traitement nous appartient), replay (réponse mémorisée),
-- mismatch (même clé, autre requête), pending (un traitement identique est en cours).
-- Un traitement resté « en cours » plus de 2 minutes (serveur interrompu) est repris.
CREATE OR REPLACE FUNCTION public.idempotency_begin(p_coach uuid, p_key uuid, p_route text, p_hash text)
RETURNS TABLE (outcome text, http_status integer, body jsonb)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  r public.idempotency_keys%ROWTYPE;
BEGIN
  LOOP
    INSERT INTO public.idempotency_keys AS k (coach_id, key, route, request_hash) VALUES (p_coach, p_key, p_route, p_hash)
    ON CONFLICT (coach_id, key) DO NOTHING;
    IF FOUND THEN
      outcome := 'new'; http_status := NULL; body := NULL; RETURN NEXT; RETURN;
    END IF;
    SELECT * INTO r FROM public.idempotency_keys k WHERE k.coach_id = p_coach AND k.key = p_key FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF; -- libérée entre-temps : on retente l'insertion
    IF r.route <> p_route OR r.request_hash <> p_hash THEN
      outcome := 'mismatch'; http_status := NULL; body := NULL; RETURN NEXT; RETURN;
    END IF;
    IF r.status IS NOT NULL THEN
      outcome := 'replay'; http_status := r.status; body := r.response; RETURN NEXT; RETURN;
    END IF;
    IF r.created_at < now() - interval '2 minutes' THEN
      UPDATE public.idempotency_keys k SET created_at = now() WHERE k.coach_id = p_coach AND k.key = p_key;
      outcome := 'new'; http_status := NULL; body := NULL; RETURN NEXT; RETURN;
    END IF;
    outcome := 'pending'; http_status := NULL; body := NULL; RETURN NEXT; RETURN;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.idempotency_complete(p_coach uuid, p_key uuid, p_status integer, p_response jsonb)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.idempotency_keys SET status = p_status, response = p_response
  WHERE coach_id = p_coach AND key = p_key AND status IS NULL
$$;

-- Libère une clé dont le traitement a échoué (jamais une réponse déjà mémorisée).
CREATE OR REPLACE FUNCTION public.idempotency_release(p_coach uuid, p_key uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  DELETE FROM public.idempotency_keys WHERE coach_id = p_coach AND key = p_key AND status IS NULL
$$;

-- ---------------------------------------------------------------------------
-- 4. Journal d'audit (aucune donnée personnelle : identifiants et compteurs seulement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action     text        NOT NULL CHECK (char_length(action) BETWEEN 1 AND 60),
  entity     text        NOT NULL CHECK (char_length(entity) BETWEEN 1 AND 60),
  entity_id  uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  counts     jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_log_coach_date ON public.audit_log (coach_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Effacement définitif d'un client (une seule transaction)
--    SECURITY DEFINER, justifié : écrire dans audit_log, fermée aux navigateurs. Toutes les suppressions sont
--    filtrées explicitement sur coach_id = auth.uid() ; le client doit appartenir au coach appelant (CS404 sinon).
--    La confirmation (prénom + nom) est comparée sans tenir compte de la casse ni des espaces superflus.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erase_client_data(p_client_id uuid, p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_coach uuid := auth.uid();
  v_client public.clients%ROWTYPE;
  v_counts jsonb;
  n_workouts integer; n_progress integer; n_payments integer; n_notes integer; n_exceptions integer;
  n_reminders integer; n_push integer; n_sessions integer; n_recurrences integer;
BEGIN
  IF v_coach IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id AND coach_id = v_coach FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable' USING ERRCODE = 'CS404'; END IF;
  IF p_confirmation IS NULL
     OR lower(regexp_replace(btrim(p_confirmation), '\s+', ' ', 'g'))
        <> lower(regexp_replace(btrim(v_client.prenom || ' ' || v_client.nom), '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'Confirmation incorrecte : saisissez le prénom et le nom exacts du client.' USING ERRCODE = '22023';
  END IF;

  WITH d AS (DELETE FROM public.workout_logs WHERE coach_id = v_coach AND client_id = p_client_id RETURNING 1)
    SELECT count(*) INTO n_workouts FROM d;
  WITH d AS (DELETE FROM public.progress_entries WHERE coach_id = v_coach AND client_id = p_client_id RETURNING 1)
    SELECT count(*) INTO n_progress FROM d;
  WITH d AS (DELETE FROM public.payments WHERE coach_id = v_coach AND client_id = p_client_id RETURNING 1)
    SELECT count(*) INTO n_payments FROM d;
  WITH d AS (DELETE FROM public.coach_notes WHERE coach_id = v_coach AND client_id = p_client_id RETURNING 1)
    SELECT count(*) INTO n_notes FROM d;
  WITH d AS (DELETE FROM public.session_recurrence_exceptions e WHERE e.coach_id = v_coach
      AND e.recurrence_id IN (SELECT r.id FROM public.session_recurrences r WHERE r.coach_id = v_coach AND r.client_id = p_client_id)
      RETURNING 1)
    SELECT count(*) INTO n_exceptions FROM d;
  WITH d AS (DELETE FROM public.session_reminders x
      WHERE x.session_id IN (SELECT s.id FROM public.sessions s WHERE s.coach_id = v_coach AND s.client_id = p_client_id)
      RETURNING 1)
    SELECT count(*) INTO n_reminders FROM d;
  WITH d AS (DELETE FROM public.push_sent x WHERE x.coach_id = v_coach
      AND x.session_id IN (SELECT s.id FROM public.sessions s WHERE s.coach_id = v_coach AND s.client_id = p_client_id)
      RETURNING 1)
    SELECT count(*) INTO n_push FROM d;
  WITH d AS (DELETE FROM public.sessions WHERE coach_id = v_coach AND client_id = p_client_id RETURNING 1)
    SELECT count(*) INTO n_sessions FROM d;
  WITH d AS (DELETE FROM public.session_recurrences WHERE coach_id = v_coach AND client_id = p_client_id RETURNING 1)
    SELECT count(*) INTO n_recurrences FROM d;
  DELETE FROM public.clients WHERE id = p_client_id AND coach_id = v_coach;

  v_counts := jsonb_build_object(
    'sessions', n_sessions, 'payments', n_payments, 'progress', n_progress, 'workouts', n_workouts,
    'recurrences', n_recurrences, 'recurrence_exceptions', n_exceptions, 'reminders', n_reminders + n_push,
    'notes', n_notes, 'client', 1);
  INSERT INTO public.audit_log (coach_id, action, entity, entity_id, counts)
  VALUES (v_coach, 'client.erase', 'client', p_client_id, v_counts);
  RETURN v_counts;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Titres de séance les plus fréquents du coach (sans charger l'historique)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_title_suggestions(p_limit integer DEFAULT 20)
RETURNS TABLE (titre text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Paramètres invalides : limite de 1 à 50' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT s.titre FROM public.sessions s
  WHERE s.coach_id = auth.uid() AND btrim(s.titre) <> ''
  GROUP BY s.titre
  ORDER BY count(*) DESC, max(s.date_heure) DESC, s.titre
  LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6 bis. Valeurs proposées pour un client : dernier paiement, dernière séance, dernière mesure
--        (une seule requête, sans charger l'historique ; client d'un autre coach = CS404).
--        Dernière séance : la plus récente passée et non annulée, sinon la dernière créée.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_defaults(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_coach uuid := auth.uid();
  v_pay jsonb; v_ses jsonb; v_prog jsonb;
BEGIN
  IF v_coach IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = v_coach) THEN
    RAISE EXCEPTION 'Client introuvable' USING ERRCODE = 'CS404';
  END IF;
  SELECT jsonb_build_object('montant', p.montant, 'methode', p.methode, 'statut', p.statut, 'date_paiement', p.date_paiement)
    INTO v_pay FROM public.payments p
    WHERE p.coach_id = v_coach AND p.client_id = p_client_id AND p.statut <> 'ANNULE'
    ORDER BY p.date_paiement DESC, p.created_at DESC LIMIT 1;
  SELECT jsonb_build_object('titre', s.titre, 'duree_minutes', s.duree_minutes, 'date_heure', s.date_heure)
    INTO v_ses FROM public.sessions s
    WHERE s.coach_id = v_coach AND s.client_id = p_client_id AND s.statut <> 'ANNULEE'
    ORDER BY (s.date_heure <= now()) DESC, CASE WHEN s.date_heure <= now() THEN s.date_heure END DESC, s.created_at DESC LIMIT 1;
  SELECT jsonb_build_object('mesure_date', e.mesure_date, 'poids_kg', e.poids_kg,
      'frequence_cardiaque_repos_bpm', e.frequence_cardiaque_repos_bpm, 'frequence_cardiaque_effort_bpm', e.frequence_cardiaque_effort_bpm,
      'tour_taille_cm', e.tour_taille_cm, 'hanches_cm', e.hanches_cm, 'bras_cm', e.bras_cm, 'cuisse_cm', e.cuisse_cm,
      'masse_grasse_pct', e.masse_grasse_pct)
    INTO v_prog FROM public.progress_entries e
    WHERE e.coach_id = v_coach AND e.client_id = p_client_id
    ORDER BY e.mesure_date DESC, e.created_at DESC LIMIT 1;
  RETURN jsonb_build_object('last_payment', v_pay, 'last_session', v_ses, 'last_progress', v_prog);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Maintenance : rétention des données techniques (jamais de données métier des coachs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_purge(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  n_rum integer; n_rate integer; n_idem integer; n_cron integer; n_push integer;
BEGIN
  WITH d AS (DELETE FROM public.rum_events WHERE created_at < p_now - interval '90 days' RETURNING 1) SELECT count(*) INTO n_rum FROM d;
  WITH d AS (DELETE FROM public.rate_limits WHERE window_start < p_now - interval '2 days' RETURNING 1) SELECT count(*) INTO n_rate FROM d;
  WITH d AS (DELETE FROM public.idempotency_keys WHERE created_at < p_now - interval '7 days' RETURNING 1) SELECT count(*) INTO n_idem FROM d;
  WITH d AS (DELETE FROM public.cron_runs WHERE started_at < p_now - interval '30 days' RETURNING 1) SELECT count(*) INTO n_cron FROM d;
  WITH d AS (DELETE FROM public.push_sent p USING public.sessions s
      WHERE s.id = p.session_id AND s.date_heure + make_interval(mins => s.duree_minutes) < p_now - interval '30 days'
      RETURNING 1) SELECT count(*) INTO n_push FROM d;
  RETURN jsonb_build_object('rum_events', n_rum, 'rate_limits', n_rate, 'idempotency_keys', n_idem, 'cron_runs', n_cron, 'push_sent', n_push);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Droits : tables de service fermées aux navigateurs, fonctions de service réservées à la clé de service
-- ---------------------------------------------------------------------------
ALTER TABLE public.rate_limits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;
-- Aucune politique : ni anon ni authenticated n'ont accès.
REVOKE ALL ON public.rate_limits, public.cron_runs, public.idempotency_keys, public.audit_log FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cron_last_runs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.idempotency_begin(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.idempotency_complete(uuid,uuid,integer,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.idempotency_release(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maintenance_purge(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erase_client_data(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.session_title_suggestions(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_defaults(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erase_client_data(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_title_suggestions(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_defaults(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.rate_limits, public.cron_runs, public.idempotency_keys, public.audit_log TO service_role;
    GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text,integer,integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.cron_last_runs() TO service_role;
    GRANT EXECUTE ON FUNCTION public.idempotency_begin(uuid,uuid,text,text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.idempotency_complete(uuid,uuid,integer,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION public.idempotency_release(uuid,uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.maintenance_purge(timestamptz) TO service_role;
    -- Le cron de maintenance purge ces tables techniques (rum_events, push_sent) ; sessions pour la jointure.
    GRANT SELECT, DELETE ON public.rum_events, public.push_sent TO service_role;
    GRANT SELECT ON public.sessions TO service_role;
  END IF;
END;
$$;

COMMIT;
