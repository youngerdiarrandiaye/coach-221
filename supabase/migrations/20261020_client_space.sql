-- Espace client : un client invité par son coach reçoit un compte de connexion distinct de celui d'un coach.
-- À jouer après schema.sql et les migrations précédentes (jusqu'à 20261016_frequent_activity.sql). Idempotente.
-- Retour arrière documenté : supabase/migrations/down/20261020_client_space_down.sql (à ne pas jouer automatiquement).
--
-- Principe de sécurité :
--   * un compte client porte app_metadata.role = 'client' (écrit par le serveur seulement, jamais modifiable par
--     l'utilisateur, contrairement à user_metadata) ;
--   * GoTrue crée la ligne auth.users PUIS y écrit app_metadata : le profil du coach, créé à l'insertion, est donc retiré
--     dès que le rôle « client » apparaît (second déclencheur ci-dessous) ;
--   * un compte client n'a PAS de ligne dans public.profiles : toutes les tables du coach référencent profiles(id), il ne
--     peut donc rien créer ni posséder, même en appelant directement l'API Supabase avec sa clé publique ;
--   * le lien compte -> fiche client vit dans client_accounts, écrite uniquement par le serveur (clé de service).
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Compte client : pas de profil de coach.
  IF COALESCE(NEW.raw_app_meta_data->>'role', '') = 'client' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.profiles (id, email, nom, prenom)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nom', ''), COALESCE(NEW.raw_user_meta_data->>'prenom', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- GoTrue écrit app_metadata APRÈS l'insertion : à ce moment le profil de coach existe déjà, on le retire. Un profil qui
-- possède déjà des clients (un vrai coach) n'est jamais supprimé.
CREATE OR REPLACE FUNCTION public.drop_client_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(NEW.raw_app_meta_data->>'role', '') = 'client' THEN
    DELETE FROM public.profiles p
    WHERE p.id = NEW.id AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.coach_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_client_role ON auth.users;
CREATE TRIGGER on_auth_user_client_role
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW WHEN (OLD.raw_app_meta_data IS DISTINCT FROM NEW.raw_app_meta_data)
  EXECUTE FUNCTION public.drop_client_profile();

-- Comptes client déjà créés avant ce second déclencheur : on retire leur profil de coach.
DELETE FROM public.profiles p
WHERE p.id IN (SELECT u.id FROM auth.users u WHERE COALESCE(u.raw_app_meta_data->>'role', '') = 'client')
  AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.coach_id = p.id);

CREATE TABLE IF NOT EXISTS public.client_accounts (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL UNIQUE,
  coach_id            uuid NOT NULL,
  invited_at          timestamptz NOT NULL DEFAULT now(),
  last_invite_sent_at timestamptz NOT NULL DEFAULT now(),
  -- Le client appartient bien à ce coach : la fiche supprimée entraîne la fin de l'accès.
  CONSTRAINT client_accounts_client_fk FOREIGN KEY (client_id, coach_id) REFERENCES public.clients (id, coach_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_accounts_coach ON public.client_accounts (coach_id);

ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

-- Lecture seule : le coach voit l'état d'invitation de ses clients ; un client voit sa propre ligne.
-- Aucune politique d'écriture : seul le rôle de service (serveur) invite, relance et retire l'accès.
DROP POLICY IF EXISTS "client_accounts: coach read" ON public.client_accounts;
CREATE POLICY "client_accounts: coach read" ON public.client_accounts FOR SELECT USING (auth.uid() = coach_id);
DROP POLICY IF EXISTS "client_accounts: own read" ON public.client_accounts;
CREATE POLICY "client_accounts: own read" ON public.client_accounts FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.client_accounts FROM anon, authenticated;
GRANT SELECT ON public.client_accounts TO authenticated;

COMMIT;
