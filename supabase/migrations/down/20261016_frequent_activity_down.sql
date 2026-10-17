-- RETOUR ARRIERE de 20261016_frequent_activity.sql. NE PAS JOUER AUTOMATIQUEMENT.
-- À exécuter manuellement, sur une base de test d'abord, après sauvegarde.
-- Effets :
--   * supprime les fonctions clients_frequent et activity_feed ;
--   * supprime l'index idx_workout_logs_coach_date (simple optimisation, recréé par la migration) ;
--   * ne touche à aucune donnée.
-- Après ce retour arrière, retirer les routes GET clients/frequent et GET activity du serveur : elles répondraient en erreur.
BEGIN;

DROP FUNCTION IF EXISTS public.clients_frequent(integer);
DROP FUNCTION IF EXISTS public.activity_feed(integer);
DROP INDEX IF EXISTS public.idx_workout_logs_coach_date;

COMMIT;
