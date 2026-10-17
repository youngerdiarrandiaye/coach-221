-- RETOUR ARRIERE de 20261015_hardening.sql. NE PAS JOUER AUTOMATIQUEMENT.
-- À exécuter manuellement, sur une base de test d'abord, après sauvegarde.
-- Effets :
--   * supprime les fonctions rate_limit_hit, cron_last_runs, idempotency_*, erase_client_data,
--     session_title_suggestions, client_defaults et maintenance_purge ;
--   * supprime définitivement les tables rate_limits, cron_runs, idempotency_keys et audit_log
--     (compteurs de limitation, historique des tâches planifiées, clés d'idempotence et journal des effacements) ;
--   * ne touche à aucune donnée métier (clients, séances, paiements, mesures, séries, notes).
-- Après ce retour arrière, le code serveur de ce lot doit être retiré : la limitation de débit s'ouvre d'elle-même
-- (base en panne = ouvert), mais l'effacement d'un client, l'idempotence, la maintenance et le suivi des crons échoueront.
BEGIN;

DROP FUNCTION IF EXISTS public.rate_limit_hit(text, integer, integer);
DROP FUNCTION IF EXISTS public.cron_last_runs();
DROP FUNCTION IF EXISTS public.idempotency_begin(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.idempotency_complete(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.idempotency_release(uuid, uuid);
DROP FUNCTION IF EXISTS public.erase_client_data(uuid, text);
DROP FUNCTION IF EXISTS public.session_title_suggestions(integer);
DROP FUNCTION IF EXISTS public.client_defaults(uuid);
DROP FUNCTION IF EXISTS public.maintenance_purge(timestamptz);

DROP TABLE IF EXISTS public.rate_limits;
DROP TABLE IF EXISTS public.cron_runs;
DROP TABLE IF EXISTS public.idempotency_keys;
DROP TABLE IF EXISTS public.audit_log;

COMMIT;
