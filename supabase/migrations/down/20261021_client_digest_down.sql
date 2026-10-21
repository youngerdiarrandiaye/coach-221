-- RETOUR ARRIERE de 20261021_client_digest.sql. NE PAS JOUER AUTOMATIQUEMENT.
-- À exécuter manuellement, sur une base de test d'abord, après sauvegarde.
-- Effets : supprime les colonnes weekly_digest et last_digest_week de client_accounts (préférences d'envoi perdues).
-- Retirer aussi la tâche weekly-digest du planificateur (deploy/scheduler.sh).
BEGIN;
ALTER TABLE public.client_accounts DROP COLUMN IF EXISTS last_digest_week;
ALTER TABLE public.client_accounts DROP COLUMN IF EXISTS weekly_digest;
COMMIT;
