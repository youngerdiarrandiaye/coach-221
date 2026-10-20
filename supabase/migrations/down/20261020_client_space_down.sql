-- RETOUR ARRIERE de 20261020_client_space.sql. NE PAS JOUER AUTOMATIQUEMENT.
-- À exécuter manuellement, sur une base de test d'abord, après sauvegarde.
-- Effets :
--   * supprime le déclencheur drop_client_profile et la table client_accounts (les liens compte -> fiche client) ;
--   * remet handle_new_user dans sa version précédente (un profil de coach pour chaque compte).
-- Les comptes de connexion des clients restent dans auth.users : les supprimer à part (Authentication > Users), sans quoi
-- ils auraient, après ce retour arrière, un profil de coach à la prochaine reconnexion de leur compte.
BEGIN;

DROP TRIGGER IF EXISTS on_auth_user_client_role ON auth.users;
DROP FUNCTION IF EXISTS public.drop_client_profile();
DROP TABLE IF EXISTS public.client_accounts;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nom, prenom)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nom', ''), COALESCE(NEW.raw_user_meta_data->>'prenom', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMIT;
