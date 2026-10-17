-- Clients fréquents et fil d'activité (lot « simplicité façon Wave »).
-- À jouer après schema.sql, recurrences.sql et les migrations précédentes (jusqu'à 20261015_hardening.sql).
-- Idempotente : peut être rejouée sans erreur. Aucune donnée existante n'est supprimée ou modifiée.
-- Retour arrière documenté : supabase/migrations/down/20261016_frequent_activity_down.sql (à ne pas jouer automatiquement).
--
-- Fonctions SECURITY INVOKER : la RLS s'applique et chaque lecture est filtrée explicitement sur auth.uid().
-- Instant d'un événement daté seulement par un jour (paiement, saisie d'entraînement) : l'heure d'enregistrement
-- si elle tombe le même jour (UTC), sinon midi de ce jour ; cela garde un ordre cohérent avec les séances.
BEGIN;

-- Fil d'activité : les saisies d'entraînement sont lues par coach et par date (aucun index existant ne commence par la date).
CREATE INDEX IF NOT EXISTS idx_workout_logs_coach_date ON public.workout_logs (coach_id, log_date DESC);

-- ---------------------------------------------------------------------------
-- W1. Clients fréquents : 90 derniers jours, séances non annulées et passées x1, paiements non annulés x2,
--     saisies d'entraînement x2 (une saisie = les séries enregistrées ensemble : même client, exercice, jour et instant).
--     Départage : activité la plus récente, puis client le plus récent. Clients actifs seulement.
--     Complément : jusqu'à `limit`, les clients actifs sans activité, du plus récemment créé au plus ancien (score 0,
--     last_activity_at nul), pour qu'un client tout juste ajouté apparaisse aussitôt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clients_frequent(p_limit integer DEFAULT 6)
RETURNS TABLE (id uuid, prenom text, nom text, objectif text, score integer, last_activity_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_coach uuid := auth.uid();
BEGIN
  IF v_coach IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Paramètres invalides : limite de 1 à 12' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH ev AS (
    SELECT s.client_id, 1 AS weight, s.date_heure AS at
    FROM public.sessions s
    WHERE s.coach_id = v_coach AND s.statut <> 'ANNULEE'
      AND s.date_heure >= now() - interval '90 days' AND s.date_heure <= now()
    UNION ALL
    SELECT p.client_id, 2,
      CASE WHEN (p.created_at AT TIME ZONE 'UTC')::date = p.date_paiement THEN p.created_at
           ELSE (p.date_paiement::timestamp + interval '12 hours') AT TIME ZONE 'UTC' END
    FROM public.payments p
    WHERE p.coach_id = v_coach AND p.statut <> 'ANNULE'
      AND p.date_paiement >= (now() - interval '90 days')::date AND p.date_paiement <= (now() AT TIME ZONE 'UTC')::date
    UNION ALL
    SELECT w.client_id, 2,
      min(CASE WHEN (w.created_at AT TIME ZONE 'UTC')::date = w.log_date THEN w.created_at
               ELSE (w.log_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC' END)
    FROM public.workout_logs w
    WHERE w.coach_id = v_coach
      AND w.log_date >= (now() - interval '90 days')::date AND w.log_date <= (now() AT TIME ZONE 'UTC')::date
    GROUP BY w.client_id, w.exercice_id, w.log_date, w.created_at
  ), agg AS (
    SELECT ev.client_id, sum(ev.weight)::integer AS score, max(ev.at) AS last_at FROM ev GROUP BY ev.client_id
  )
  SELECT c.id, c.prenom, c.nom, c.objectif::text, coalesce(agg.score, 0), agg.last_at
  FROM public.clients c LEFT JOIN agg ON agg.client_id = c.id
  WHERE c.coach_id = v_coach AND c.actif
  ORDER BY coalesce(agg.score, 0) DESC, agg.last_at DESC NULLS LAST, c.created_at DESC, c.id
  LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- W2. Fil d'activité des 60 derniers jours, du plus récent au plus ancien :
--     paiements non annulés (montant FCFA entier positif, en attente signalé), séances effectuées,
--     saisies d'entraînement (une ligne par saisie, « Squat, 3 séries »). Clients archivés inclus.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activity_feed(p_limit integer DEFAULT 15)
RETURNS TABLE (type text, id uuid, client_id uuid, client text, title text, amount integer, pending boolean, at timestamptz, href text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_coach uuid := auth.uid();
BEGIN
  IF v_coach IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Paramètres invalides : limite de 1 à 50' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH pay AS (
    SELECT 'payment'::text AS type, p.id, p.client_id,
      CASE p.methode WHEN 'WAVE' THEN 'Wave' WHEN 'ESPECES' THEN 'Espèces' WHEN 'ORANGE_MONEY' THEN 'Orange Money' ELSE p.methode::text END AS title,
      p.montant::integer AS amount, (p.statut = 'EN_ATTENTE') AS pending,
      CASE WHEN (p.created_at AT TIME ZONE 'UTC')::date = p.date_paiement THEN p.created_at
           ELSE (p.date_paiement::timestamp + interval '12 hours') AT TIME ZONE 'UTC' END AS at,
      '/payments/' || p.id AS href
    FROM public.payments p
    WHERE p.coach_id = v_coach AND p.statut <> 'ANNULE'
      AND p.date_paiement >= (now() - interval '60 days')::date
    ORDER BY p.date_paiement DESC, p.created_at DESC LIMIT p_limit
  ), ses AS (
    SELECT 'session'::text AS type, s.id, s.client_id, s.titre AS title, NULL::integer AS amount, false AS pending,
      s.date_heure AS at, '/sessions/' || s.id AS href
    FROM public.sessions s
    WHERE s.coach_id = v_coach AND s.statut = 'EFFECTUEE' AND s.date_heure >= now() - interval '60 days'
    ORDER BY s.date_heure DESC LIMIT p_limit
  ), wk AS (
    SELECT 'workout'::text AS type, (array_agg(w.id ORDER BY w.serie_numero, w.id))[1] AS id, w.client_id,
      coalesce(e.nom, 'Entraînement') || ', ' || count(*) || CASE WHEN count(*) = 1 THEN ' série' ELSE ' séries' END AS title,
      NULL::integer AS amount, false AS pending,
      min(CASE WHEN (w.created_at AT TIME ZONE 'UTC')::date = w.log_date THEN w.created_at
               ELSE (w.log_date::timestamp + interval '12 hours') AT TIME ZONE 'UTC' END) AS at,
      '/clients/' || w.client_id || '/performance' AS href
    FROM public.workout_logs w
    LEFT JOIN public.exercises e ON e.id = w.exercice_id AND e.coach_id = v_coach
    WHERE w.coach_id = v_coach AND w.log_date >= (now() - interval '60 days')::date
    GROUP BY w.client_id, w.exercice_id, w.log_date, w.created_at, e.nom
    ORDER BY w.log_date DESC, w.created_at DESC LIMIT p_limit
  ), allrows AS (
    SELECT * FROM pay UNION ALL SELECT * FROM ses UNION ALL SELECT * FROM wk
  )
  SELECT a.type, a.id, a.client_id, btrim(c.prenom || ' ' || c.nom), a.title, a.amount, a.pending, a.at, a.href
  FROM allrows a
  JOIN public.clients c ON c.id = a.client_id AND c.coach_id = v_coach
  ORDER BY a.at DESC, a.id
  LIMIT p_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- Droits : réservés aux coachs connectés
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.clients_frequent(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activity_feed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clients_frequent(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activity_feed(integer) TO authenticated;

COMMIT;
