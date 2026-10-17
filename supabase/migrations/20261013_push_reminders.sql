-- Rappels de séance par Web Push : préférences, abonnements navigateur, anti-doublon d'envoi.
-- Après schema.sql et les migrations précédentes. Idempotente : peut être rejouée sans erreur.
BEGIN;

CREATE TABLE IF NOT EXISTS public.reminder_prefs (
  coach_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT true,
  offsets    integer[] NOT NULL DEFAULT '{30}',
  system     boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_prefs_offsets_check CHECK (
    offsets IS NOT NULL AND coalesce(cardinality(offsets), 0) <= 10
    AND array_ndims(offsets) IS NOT DISTINCT FROM CASE WHEN cardinality(offsets) = 0 THEN NULL ELSE 1 END
    AND array_position(offsets, NULL) IS NULL
    AND 1 <= ALL (offsets) AND 1440 >= ALL (offsets)
  )
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 1 AND 1000),
  p256dh          text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 200),
  auth            text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 100),
  user_agent      text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failures        integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_coach ON public.push_subscriptions (coach_id);

-- Réservation d'envoi : INSERT ... ON CONFLICT DO NOTHING RETURNING. Accès serveur (service-role) uniquement.
CREATE TABLE IF NOT EXISTS public.push_sent (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  offset_min integer NOT NULL,
  coach_id   uuid NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, offset_min)
);

ALTER TABLE public.reminder_prefs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_sent           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminder_prefs: coach full access" ON public.reminder_prefs;
CREATE POLICY "reminder_prefs: coach full access" ON public.reminder_prefs
  FOR ALL TO authenticated USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
DROP POLICY IF EXISTS "push_subscriptions: coach full access" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: coach full access" ON public.push_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
-- push_sent : aucune politique, donc aucun accès pour anon/authenticated.

REVOKE ALL ON public.reminder_prefs, public.push_subscriptions, public.push_sent FROM anon;
REVOKE ALL ON public.push_sent FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_prefs, public.push_subscriptions TO authenticated;
-- Le cron (clé service-role, côté serveur uniquement) lit les séances et réserve les envois.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.reminder_prefs, public.push_subscriptions, public.push_sent TO service_role;
    GRANT SELECT ON public.sessions, public.clients TO service_role;
  END IF;
END;
$$;

-- Abonnement atomique par endpoint. SECURITY DEFINER : un endpoint déjà attribué à un autre
-- coach (même navigateur, autre compte) est réattribué au coach courant, ce que RLS interdirait.
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  sub_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.push_subscriptions (coach_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET coach_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent, failures = 0
  RETURNING id INTO sub_id;
  RETURN sub_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_push_subscription(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text,text,text,text) TO authenticated;

COMMIT;
