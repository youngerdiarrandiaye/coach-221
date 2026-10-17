-- Agenda CoachSen : conflits horaires, versions, récurrences étendues et exceptions.
-- À jouer après schema.sql, recurrences.sql et les migrations précédentes (y compris 20261013_push_reminders.sql).
-- Idempotente : peut être rejouée sans erreur. Aucune donnée n'est supprimée ; les séances existantes
-- ne sont ni déplacées ni annulées (leurs chevauchements éventuels sont conservés, jamais bloquants).
-- Retour arrière documenté : supabase/migrations/down/20261014_agenda_down.sql (à ne pas jouer automatiquement).
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Colonnes et contraintes
-- ---------------------------------------------------------------------------
ALTER TABLE public.session_recurrences
  ADD COLUMN IF NOT EXISTS frequence text NOT NULL DEFAULT 'HEBDOMADAIRE',
  ADD COLUMN IF NOT EXISTS intervalle integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nb_occurrences integer;

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS occurrence_date date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.session_recurrences'::regclass AND conname = 'session_recurrences_frequence_check') THEN
    ALTER TABLE public.session_recurrences ADD CONSTRAINT session_recurrences_frequence_check
      CHECK (frequence IN ('QUOTIDIENNE', 'HEBDOMADAIRE', 'MENSUELLE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.session_recurrences'::regclass AND conname = 'session_recurrences_intervalle_check') THEN
    ALTER TABLE public.session_recurrences ADD CONSTRAINT session_recurrences_intervalle_check
      CHECK (intervalle BETWEEN 1 AND 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.session_recurrences'::regclass AND conname = 'session_recurrences_nb_occurrences_check') THEN
    ALTER TABLE public.session_recurrences ADD CONSTRAINT session_recurrences_nb_occurrences_check
      CHECK (nb_occurrences IS NULL OR nb_occurrences BETWEEN 1 AND 200);
  END IF;
  -- Propriété composite : une exception ne peut référencer que la série du même coach.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.session_recurrences'::regclass AND conname = 'session_recurrences_id_coach_key') THEN
    ALTER TABLE public.session_recurrences ADD CONSTRAINT session_recurrences_id_coach_key UNIQUE (id, coach_id);
  END IF;
END;
$$;

-- Occurrences des séries existantes : jour Dakar de l'horaire actuel. updated_at est conservé
-- (le trigger est suspendu dans cette transaction). Les doublons éventuels restent à NULL.
ALTER TABLE public.sessions DISABLE TRIGGER trg_sessions_updated_at;
UPDATE public.sessions s SET occurrence_date = x.d
FROM (
  SELECT id, recurrence_id, (date_heure AT TIME ZONE 'Africa/Dakar')::date AS d,
         row_number() OVER (PARTITION BY recurrence_id, (date_heure AT TIME ZONE 'Africa/Dakar')::date ORDER BY created_at, id) AS rn
  FROM public.sessions WHERE recurrence_id IS NOT NULL AND occurrence_date IS NULL
) x
WHERE s.id = x.id AND x.rn = 1
  AND NOT EXISTS (SELECT 1 FROM public.sessions o WHERE o.recurrence_id = x.recurrence_id AND o.occurrence_date = x.d);
ALTER TABLE public.sessions ENABLE TRIGGER trg_sessions_updated_at;

-- Une occurrence = (série, jour d'origine) : jamais deux fois, même en créations simultanées.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_recurrence_occurrence
  ON public.sessions (recurrence_id, occurrence_date)
  WHERE recurrence_id IS NOT NULL AND occurrence_date IS NOT NULL;
-- Recherche de chevauchements : séances occupant le calendrier d'un coach.
CREATE INDEX IF NOT EXISTS idx_sessions_agenda_active
  ON public.sessions (coach_id, date_heure) WHERE statut <> 'ANNULEE';
-- Lecture par période avec filtre client.
CREATE INDEX IF NOT EXISTS idx_sessions_coach_client_date
  ON public.sessions (coach_id, client_id, date_heure);

-- ---------------------------------------------------------------------------
-- 2. Exceptions de série (occurrence modifiée, annulée, supprimée ou ignorée seule)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_recurrence_exceptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurrence_id   uuid NOT NULL,
  coach_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('MODIFIEE', 'ANNULEE', 'SUPPRIMEE', 'IGNOREE')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_recurrence_exceptions_unique UNIQUE (recurrence_id, occurrence_date),
  CONSTRAINT session_recurrence_exceptions_series_fkey FOREIGN KEY (recurrence_id, coach_id)
    REFERENCES public.session_recurrences (id, coach_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recurrence_exceptions_coach ON public.session_recurrence_exceptions (coach_id);

ALTER TABLE public.session_recurrence_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recurrence_exceptions: coach full access" ON public.session_recurrence_exceptions;
CREATE POLICY "recurrence_exceptions: coach full access" ON public.session_recurrence_exceptions
  FOR ALL TO authenticated USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
REVOKE ALL ON public.session_recurrence_exceptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_recurrence_exceptions TO authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.session_recurrence_exceptions TO service_role;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Détection des conflits horaires
--    Règle : début_a < fin_b ET début_b < fin_a ; la fin est exclusive ; ANNULEE ignorée.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_conflict_ids(
  p_coach uuid, p_debut timestamptz, p_duree integer, p_exclude uuid DEFAULT NULL
) RETURNS uuid[] LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE(array_agg(x.id ORDER BY x.date_heure, x.id), ARRAY[]::uuid[]) FROM (
    SELECT s.id, s.date_heure FROM public.sessions s
    WHERE s.coach_id = p_coach AND s.statut <> 'ANNULEE'
      AND (p_exclude IS NULL OR s.id <> p_exclude)
      AND s.date_heure < p_debut + make_interval(mins => p_duree)
      AND s.date_heure > p_debut - interval '480 minutes'
      AND s.date_heure + make_interval(mins => s.duree_minutes) > p_debut
    ORDER BY s.date_heure, s.id LIMIT 20
  ) x
$$;

-- Fiches des séances (propriétaire seulement : RLS + filtre explicite sur auth.uid()).
CREATE OR REPLACE FUNCTION public.agenda_session_summaries(p_ids uuid[])
RETURNS TABLE (id uuid, titre text, client_id uuid, client text, date_heure timestamptz, duree_minutes integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT s.id, s.titre, s.client_id, btrim(c.prenom || ' ' || c.nom), s.date_heure, s.duree_minutes
  FROM public.sessions s
  JOIN public.clients c ON c.id = s.client_id AND c.coach_id = s.coach_id
  WHERE s.id = ANY (COALESCE(p_ids, ARRAY[]::uuid[])) AND s.coach_id = auth.uid()
  ORDER BY s.date_heure, s.id
$$;

CREATE OR REPLACE FUNCTION public.agenda_find_conflicts(p_debut timestamptz, p_duree integer, p_exclude uuid DEFAULT NULL)
RETURNS TABLE (id uuid, titre text, client_id uuid, client text, date_heure timestamptz, duree_minutes integer)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF p_debut IS NULL OR p_duree IS NULL OR p_duree NOT BETWEEN 5 AND 480 THEN
    RAISE EXCEPTION 'Horaire ou durée invalide' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM public.agenda_session_summaries(public.agenda_conflict_ids(auth.uid(), p_debut, p_duree, p_exclude));
END;
$$;

-- Garde d'intégrité : verrou consultatif par coach (créations simultanées sérialisées), puis contrôle.
-- Ne s'applique qu'aux lignes créées ou dont l'horaire, la durée ou le retour au calendrier change :
-- les chevauchements déjà présents ne bloquent rien et ne sont jamais modifiés.
CREATE OR REPLACE FUNCTION public.agenda_guard_session_conflicts()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE ids uuid[];
BEGIN
  IF NEW.statut = 'ANNULEE' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.date_heure = OLD.date_heure AND NEW.duree_minutes = OLD.duree_minutes
     AND NEW.coach_id = OLD.coach_id AND OLD.statut <> 'ANNULEE' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('coachsen:agenda:' || NEW.coach_id::text, 0));
  ids := public.agenda_conflict_ids(NEW.coach_id, NEW.date_heure, NEW.duree_minutes, NEW.id);
  IF cardinality(ids) > 0 THEN
    RAISE EXCEPTION 'Cette séance chevauche une autre séance.' USING ERRCODE = '23P01', DETAIL = 'conflits:' || array_to_string(ids, ',');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_agenda_conflicts ON public.sessions;
CREATE TRIGGER trg_sessions_agenda_conflicts
  BEFORE INSERT OR UPDATE OF date_heure, duree_minutes, statut, coach_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.agenda_guard_session_conflicts();

-- ---------------------------------------------------------------------------
-- 4. Rappels : un nouvel horaire doit pouvoir être rappelé à nouveau.
--    session_reminders (WhatsApp) est déjà réservé par (séance, horaire). push_sent l'est par (séance, délai) :
--    sans purge, un déplacement après un rappel push resterait silencieux. SECURITY DEFINER justifié :
--    push_sent n'a aucune politique (accès serveur seulement) ; la fonction ne supprime que les lignes de la séance modifiée.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_reset_push_reservations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.push_sent WHERE session_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agenda_reset_push_reservations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sessions_reset_push ON public.sessions;
CREATE TRIGGER trg_sessions_reset_push
  AFTER UPDATE OF date_heure ON public.sessions
  FOR EACH ROW WHEN (OLD.date_heure IS DISTINCT FROM NEW.date_heure)
  EXECUTE FUNCTION public.agenda_reset_push_reservations();

-- ---------------------------------------------------------------------------
-- 5. Modification avec contrôle de version et portée
--    Codes : CS404 introuvable, CS409 version périmée, CS410 historique protégé, 23P01 conflit, 22023 paramètres.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_update_session(p_id uuid, p_scope text, p_expected timestamptz, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  s public.sessions%ROWTYPE;
  r public.sessions%ROWTYPE;
  scope text := upper(COALESCE(p_scope, 'ONE'));
  new_start timestamptz;
  new_len integer;
  delta_s double precision;
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF scope NOT IN ('ONE', 'FOLLOWING', 'ALL') OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Paramètres de modification invalides' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('coachsen:agenda:' || auth.uid()::text, 0));
  SELECT * INTO s FROM public.sessions WHERE id = p_id AND coach_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'CS404'; END IF;
  IF p_expected IS NULL OR s.updated_at <> p_expected THEN
    RAISE EXCEPTION 'Cette séance a été modifiée entre-temps. Rechargez-la avant de l’enregistrer.' USING ERRCODE = 'CS409';
  END IF;
  new_start := CASE WHEN p_patch ? 'date_heure' THEN (p_patch ->> 'date_heure')::timestamptz ELSE s.date_heure END;
  new_len := CASE WHEN p_patch ? 'duree_minutes' THEN (p_patch ->> 'duree_minutes')::integer ELSE s.duree_minutes END;
  IF new_start IS NULL OR new_len IS NULL OR new_len NOT BETWEEN 5 AND 480
     OR (p_patch ? 'titre' AND length(btrim(COALESCE(p_patch ->> 'titre', ''))) NOT BETWEEN 2 AND 100) THEN
    RAISE EXCEPTION 'Paramètres de modification invalides' USING ERRCODE = '22023';
  END IF;

  IF s.recurrence_id IS NULL OR scope = 'ONE' THEN
    IF s.statut = 'EFFECTUEE' AND (new_start <> s.date_heure OR new_len <> s.duree_minutes) THEN
      RAISE EXCEPTION 'Une séance effectuée fait partie de l’historique : son horaire ne peut plus être modifié.' USING ERRCODE = 'CS410';
    END IF;
    UPDATE public.sessions SET
      titre = CASE WHEN p_patch ? 'titre' THEN btrim(p_patch ->> 'titre') ELSE titre END,
      description = CASE WHEN p_patch ? 'description' THEN p_patch ->> 'description' ELSE description END,
      notes = CASE WHEN p_patch ? 'notes' THEN p_patch ->> 'notes' ELSE notes END,
      date_heure = new_start, duree_minutes = new_len
    WHERE id = s.id;
    n := 1;
    IF s.recurrence_id IS NOT NULL AND s.occurrence_date IS NOT NULL THEN
      INSERT INTO public.session_recurrence_exceptions (recurrence_id, coach_id, occurrence_date, kind)
      VALUES (s.recurrence_id, s.coach_id, s.occurrence_date, 'MODIFIEE') ON CONFLICT (recurrence_id, occurrence_date) DO NOTHING;
    END IF;
  ELSE
    delta_s := extract(epoch FROM (new_start - s.date_heure));
    -- Ordre choisi pour qu'un décalage rigide ne heurte jamais une occurrence sœur pas encore déplacée.
    FOR r IN
      SELECT t.* FROM public.sessions t
      WHERE t.recurrence_id = s.recurrence_id AND t.coach_id = auth.uid() AND t.statut = 'PLANIFIEE'
        AND (t.date_heure > now() OR t.id = s.id) AND (scope = 'ALL' OR t.date_heure >= s.date_heure)
      ORDER BY CASE WHEN delta_s > 0 THEN -extract(epoch FROM t.date_heure) ELSE extract(epoch FROM t.date_heure) END
      FOR UPDATE
    LOOP
      UPDATE public.sessions SET
        titre = CASE WHEN p_patch ? 'titre' THEN btrim(p_patch ->> 'titre') ELSE titre END,
        description = CASE WHEN p_patch ? 'description' THEN p_patch ->> 'description' ELSE description END,
        notes = CASE WHEN p_patch ? 'notes' AND r.id = s.id THEN p_patch ->> 'notes' ELSE notes END,
        date_heure = r.date_heure + make_interval(secs => delta_s),
        duree_minutes = CASE WHEN p_patch ? 'duree_minutes' THEN new_len ELSE duree_minutes END
      WHERE id = r.id;
      n := n + 1;
    END LOOP;
    IF s.statut <> 'PLANIFIEE' AND p_patch ? 'notes' THEN
      UPDATE public.sessions SET notes = p_patch ->> 'notes' WHERE id = s.id;
    END IF;
    IF scope = 'ALL' THEN
      UPDATE public.session_recurrences SET
        titre = CASE WHEN p_patch ? 'titre' THEN btrim(p_patch ->> 'titre') ELSE titre END,
        description = CASE WHEN p_patch ? 'description' THEN p_patch ->> 'description' ELSE description END,
        duree_minutes = CASE WHEN p_patch ? 'duree_minutes' THEN new_len ELSE duree_minutes END,
        heure = CASE WHEN p_patch ? 'date_heure' THEN to_char(new_start AT TIME ZONE 'Africa/Dakar', 'HH24:MI') ELSE heure END
      WHERE id = s.recurrence_id AND coach_id = auth.uid();
    END IF;
  END IF;
  RETURN jsonb_build_object('updated', n, 'id', p_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Changement de statut avec portée (annulation de série)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_set_session_status(p_id uuid, p_statut text, p_scope text DEFAULT 'ONE')
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  s public.sessions%ROWTYPE;
  scope text := upper(COALESCE(p_scope, 'ONE'));
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF scope NOT IN ('ONE', 'FOLLOWING', 'ALL') OR p_statut IS NULL OR p_statut NOT IN ('PLANIFIEE', 'EFFECTUEE', 'ANNULEE') THEN
    RAISE EXCEPTION 'Paramètres de statut invalides' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('coachsen:agenda:' || auth.uid()::text, 0));
  SELECT * INTO s FROM public.sessions WHERE id = p_id AND coach_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'CS404'; END IF;
  IF s.recurrence_id IS NULL THEN scope := 'ONE'; END IF;
  IF scope <> 'ONE' AND p_statut <> 'ANNULEE' THEN
    RAISE EXCEPTION 'La portée ne s’applique qu’à l’annulation d’une série.' USING ERRCODE = '22023';
  END IF;

  IF scope = 'ONE' THEN
    UPDATE public.sessions SET statut = p_statut::public.session_status WHERE id = s.id;
    n := 1;
    IF s.recurrence_id IS NOT NULL AND s.occurrence_date IS NOT NULL THEN
      IF p_statut = 'ANNULEE' THEN
        INSERT INTO public.session_recurrence_exceptions (recurrence_id, coach_id, occurrence_date, kind)
        VALUES (s.recurrence_id, s.coach_id, s.occurrence_date, 'ANNULEE')
        ON CONFLICT (recurrence_id, occurrence_date) DO UPDATE SET kind = 'ANNULEE';
      ELSE
        DELETE FROM public.session_recurrence_exceptions
        WHERE recurrence_id = s.recurrence_id AND occurrence_date = s.occurrence_date AND kind = 'ANNULEE' AND coach_id = auth.uid();
      END IF;
    END IF;
  ELSE
    WITH upd AS (
      UPDATE public.sessions t SET statut = 'ANNULEE'
      WHERE t.recurrence_id = s.recurrence_id AND t.coach_id = auth.uid() AND t.statut = 'PLANIFIEE'
        AND (t.date_heure > now() OR t.id = s.id) AND (scope = 'ALL' OR t.date_heure >= s.date_heure)
      RETURNING t.recurrence_id, t.coach_id, t.occurrence_date
    ), ex AS (
      INSERT INTO public.session_recurrence_exceptions (recurrence_id, coach_id, occurrence_date, kind)
      SELECT recurrence_id, coach_id, occurrence_date, 'ANNULEE' FROM upd WHERE occurrence_date IS NOT NULL
      ON CONFLICT (recurrence_id, occurrence_date) DO UPDATE SET kind = 'ANNULEE'
    )
    SELECT count(*) INTO n FROM upd;
  END IF;
  RETURN jsonb_build_object('updated', n, 'id', p_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Suppression avec portée (l'historique EFFECTUEE est conservé)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_delete_session(p_id uuid, p_scope text DEFAULT 'ONE')
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  s public.sessions%ROWTYPE;
  scope text := upper(COALESCE(p_scope, 'ONE'));
  n integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF scope NOT IN ('ONE', 'FOLLOWING', 'ALL') THEN RAISE EXCEPTION 'Portée invalide' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('coachsen:agenda:' || auth.uid()::text, 0));
  SELECT * INTO s FROM public.sessions WHERE id = p_id AND coach_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Séance introuvable' USING ERRCODE = 'CS404'; END IF;

  IF s.recurrence_id IS NULL OR scope = 'ONE' THEN
    IF s.recurrence_id IS NOT NULL AND s.statut = 'EFFECTUEE' THEN
      RAISE EXCEPTION 'Une séance effectuée fait partie de l’historique et ne peut pas être supprimée.' USING ERRCODE = 'CS410';
    END IF;
    DELETE FROM public.sessions WHERE id = s.id;
    n := 1;
    IF s.recurrence_id IS NOT NULL AND s.occurrence_date IS NOT NULL THEN
      INSERT INTO public.session_recurrence_exceptions (recurrence_id, coach_id, occurrence_date, kind)
      VALUES (s.recurrence_id, s.coach_id, s.occurrence_date, 'SUPPRIMEE')
      ON CONFLICT (recurrence_id, occurrence_date) DO UPDATE SET kind = 'SUPPRIMEE';
    END IF;
  ELSE
    WITH del AS (
      DELETE FROM public.sessions t
      WHERE t.recurrence_id = s.recurrence_id AND t.coach_id = auth.uid() AND t.statut = 'PLANIFIEE'
        AND (t.date_heure > now() OR t.id = s.id) AND (scope = 'ALL' OR t.date_heure >= s.date_heure)
      RETURNING t.recurrence_id, t.coach_id, t.occurrence_date
    ), ex AS (
      INSERT INTO public.session_recurrence_exceptions (recurrence_id, coach_id, occurrence_date, kind)
      SELECT recurrence_id, coach_id, occurrence_date, 'SUPPRIMEE' FROM del WHERE occurrence_date IS NOT NULL
      ON CONFLICT (recurrence_id, occurrence_date) DO UPDATE SET kind = 'SUPPRIMEE'
    )
    SELECT count(*) INTO n FROM del;
    IF scope = 'FOLLOWING' AND s.occurrence_date IS NOT NULL THEN
      UPDATE public.session_recurrences
      SET date_fin = LEAST(COALESCE(date_fin, s.occurrence_date - 1), s.occurrence_date - 1)
      WHERE id = s.recurrence_id AND coach_id = auth.uid();
    END IF;
  END IF;

  IF s.recurrence_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE recurrence_id = s.recurrence_id AND coach_id = auth.uid()) THEN
      DELETE FROM public.session_recurrences WHERE id = s.recurrence_id AND coach_id = auth.uid();
    ELSIF NOT EXISTS (SELECT 1 FROM public.sessions WHERE recurrence_id = s.recurrence_id AND coach_id = auth.uid() AND statut = 'PLANIFIEE') THEN
      UPDATE public.session_recurrences SET actif = false WHERE id = s.recurrence_id AND coach_id = auth.uid();
    END IF;
  END IF;
  RETURN jsonb_build_object('deleted', n);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Création de série étendue (fréquence, intervalle, nombre d'occurrences, conflits REJECT|SKIP)
--    Semaines comptées à partir du lundi de la semaine de date_debut ; mensuel : même quantième
--    (dernier jour du mois si le mois est plus court). Les occurrences passées ne sont pas créées.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_create_recurrence(
  p_client_id uuid, p_titre text, p_description text, p_duree integer, p_heure text,
  p_frequence text, p_intervalle integer, p_jours integer[], p_date_debut date, p_date_fin date,
  p_nb integer, p_on_conflict text DEFAULT 'REJECT'
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  series_id uuid;
  horizon date;
  days date[];
  d date;
  scheduled timestamptz;
  ids uuid[];
  all_conflicts uuid[] := ARRAY[]::uuid[];
  created integer := 0;
  skipped jsonb := '[]'::jsonb;
  last_day date;
  start_dow integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND coach_id = auth.uid()) THEN
    RAISE EXCEPTION 'Client introuvable' USING ERRCODE = '42501';
  END IF;
  IF p_date_debut IS NULL OR (p_date_fin IS NULL AND p_nb IS NULL)
    OR (p_date_fin IS NOT NULL AND (p_date_fin < p_date_debut OR p_date_fin - p_date_debut > 366))
    OR (p_nb IS NOT NULL AND p_nb NOT BETWEEN 1 AND 200)
    OR p_frequence IS NULL OR p_frequence NOT IN ('QUOTIDIENNE', 'HEBDOMADAIRE', 'MENSUELLE')
    OR p_intervalle IS NULL OR p_intervalle NOT BETWEEN 1 AND 12
    OR p_on_conflict IS NULL OR p_on_conflict NOT IN ('REJECT', 'SKIP')
    OR p_heure IS NULL OR p_heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR p_duree IS NULL OR p_duree NOT BETWEEN 5 AND 480
    OR p_titre IS NULL OR length(btrim(p_titre)) NOT BETWEEN 2 AND 100
    OR (p_frequence = 'HEBDOMADAIRE' AND (COALESCE(cardinality(p_jours), 0) NOT BETWEEN 1 AND 7
        OR EXISTS (SELECT 1 FROM unnest(p_jours) j WHERE j IS NULL OR j NOT BETWEEN 0 AND 6)))
  THEN RAISE EXCEPTION 'Paramètres de récurrence invalides' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('coachsen:agenda:' || auth.uid()::text, 0));
  horizon := COALESCE(p_date_fin, p_date_debut + 366);
  start_dow := extract(isodow FROM p_date_debut)::integer - 1;

  SELECT array_agg(c.day ORDER BY c.day) INTO days FROM (
    SELECT c0.day FROM (
      SELECT (p_date_debut + off) AS day FROM generate_series(0, horizon - p_date_debut) AS off
      WHERE (p_frequence = 'QUOTIDIENNE' AND off % p_intervalle = 0)
         OR (p_frequence = 'HEBDOMADAIRE' AND extract(dow FROM p_date_debut + off)::integer = ANY (p_jours)
             AND ((off + start_dow) / 7) % p_intervalle = 0)
      UNION
      SELECT (p_date_debut + make_interval(months => k * p_intervalle))::date AS day
      FROM generate_series(0, 400) AS k
      WHERE p_frequence = 'MENSUELLE' AND (p_date_debut + make_interval(months => k * p_intervalle))::date <= horizon
    ) c0 ORDER BY c0.day LIMIT COALESCE(p_nb, 400)
  ) c;
  IF p_nb IS NOT NULL AND p_date_fin IS NULL AND COALESCE(cardinality(days), 0) < p_nb THEN
    RAISE EXCEPTION 'Le nombre d’occurrences demandé dépasse la période maximale de 366 jours.' USING ERRCODE = '22023';
  END IF;
  -- Occurrences passées ignorées (aucune séance rétroactive).
  SELECT array_agg(x ORDER BY x) INTO days FROM unnest(COALESCE(days, ARRAY[]::date[])) x
  WHERE ((x + p_heure::time) AT TIME ZONE 'Africa/Dakar') > now();
  IF COALESCE(cardinality(days), 0) = 0 THEN
    RAISE EXCEPTION 'Aucune séance future dans cette période' USING ERRCODE = '22023';
  END IF;
  last_day := days[cardinality(days)];

  IF p_on_conflict = 'REJECT' THEN
    FOREACH d IN ARRAY days LOOP
      ids := public.agenda_conflict_ids(auth.uid(), (d + p_heure::time) AT TIME ZONE 'Africa/Dakar', p_duree, NULL);
      all_conflicts := all_conflicts || ids;
    END LOOP;
    IF cardinality(all_conflicts) > 0 THEN
      RAISE EXCEPTION 'Cette série chevauche des séances existantes.' USING ERRCODE = '23P01',
        DETAIL = 'conflits:' || array_to_string((SELECT array_agg(DISTINCT u) FROM unnest(all_conflicts) u), ',');
    END IF;
  END IF;

  INSERT INTO public.session_recurrences (coach_id, client_id, titre, description, duree_minutes, heure, jours,
                                          date_debut, date_fin, frequence, intervalle, nb_occurrences)
  VALUES (auth.uid(), p_client_id, btrim(p_titre), p_description, p_duree, p_heure,
          CASE WHEN p_frequence = 'HEBDOMADAIRE' THEN p_jours ELSE ARRAY[]::integer[] END,
          p_date_debut, COALESCE(p_date_fin, last_day), p_frequence, p_intervalle, p_nb)
  RETURNING id INTO series_id;

  FOREACH d IN ARRAY days LOOP
    scheduled := (d + p_heure::time) AT TIME ZONE 'Africa/Dakar';
    IF p_on_conflict = 'SKIP' THEN
      ids := public.agenda_conflict_ids(auth.uid(), scheduled, p_duree, NULL);
      IF cardinality(ids) > 0 THEN
        all_conflicts := all_conflicts || ids;
        skipped := skipped || jsonb_build_object('date', d, 'reason', 'CONFLICT');
        INSERT INTO public.session_recurrence_exceptions (recurrence_id, coach_id, occurrence_date, kind)
        VALUES (series_id, auth.uid(), d, 'IGNOREE') ON CONFLICT (recurrence_id, occurrence_date) DO NOTHING;
        CONTINUE;
      END IF;
    END IF;
    INSERT INTO public.sessions (coach_id, client_id, recurrence_id, occurrence_date, titre, description, duree_minutes, date_heure, statut)
    VALUES (auth.uid(), p_client_id, series_id, d, btrim(p_titre), p_description, p_duree, scheduled, 'PLANIFIEE');
    created := created + 1;
  END LOOP;

  IF created = 0 THEN
    RAISE EXCEPTION 'Toutes les occurrences chevauchent des séances existantes.' USING ERRCODE = '23P01',
      DETAIL = 'conflits:' || array_to_string((SELECT array_agg(DISTINCT u) FROM unnest(all_conflicts) u), ',');
  END IF;
  RETURN jsonb_build_object('id', series_id, 'created', created, 'skipped', skipped);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Droits d'exécution : utilisateurs connectés uniquement (le coach vient toujours de auth.uid()).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.agenda_conflict_ids(uuid, timestamptz, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agenda_session_summaries(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agenda_find_conflicts(timestamptz, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agenda_update_session(uuid, text, timestamptz, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agenda_set_session_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agenda_delete_session(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agenda_create_recurrence(uuid, text, text, integer, text, text, integer, integer[], date, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_conflict_ids(uuid, timestamptz, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_session_summaries(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_find_conflicts(timestamptz, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_update_session(uuid, text, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_set_session_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_delete_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_create_recurrence(uuid, text, text, integer, text, text, integer, integer[], date, date, integer, text) TO authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.agenda_conflict_ids(uuid, timestamptz, integer, uuid) TO service_role;
  END IF;
END;
$$;

COMMIT;
