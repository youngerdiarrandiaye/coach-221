-- Résumé hebdomadaire envoyé par e-mail à chaque client ayant un espace. À jouer après 20261020_client_space.sql. Idempotente.
-- Retour arrière documenté : supabase/migrations/down/20261021_client_digest_down.sql (à ne pas jouer automatiquement).
--   * weekly_digest : le client peut désactiver l'envoi depuis son espace (écrit par le serveur seulement) ;
--   * last_digest_week : lundi de la dernière semaine déjà envoyée, pour qu'une relance de la tâche n'envoie jamais deux fois.
BEGIN;

ALTER TABLE public.client_accounts ADD COLUMN IF NOT EXISTS weekly_digest boolean NOT NULL DEFAULT true;
ALTER TABLE public.client_accounts ADD COLUMN IF NOT EXISTS last_digest_week date;

COMMIT;
