-- RETOUR ARRIERE de 20261014_agenda.sql. NE PAS JOUER AUTOMATIQUEMENT.
-- À exécuter manuellement, sur une base de test d'abord, après sauvegarde.
-- Effets :
--   * supprime les fonctions, triggers et la table d'exceptions de l'agenda ;
--   * supprime les colonnes sessions.occurrence_date et session_recurrences.frequence / intervalle / nb_occurrences
--     (perte définitive de ces valeurs ; les séances et les séries elles-mêmes sont conservées) ;
--   * les séries MENSUELLE / QUOTIDIENNE créées ensuite perdraient leur fréquence : à convertir ou supprimer avant.
-- Les anciennes fonctions create_session_recurrence / delete_session_recurrence ne sont pas touchées.
BEGIN;

DROP TRIGGER IF EXISTS trg_sessions_agenda_conflicts ON public.sessions;
DROP TRIGGER IF EXISTS trg_sessions_reset_push ON public.sessions;

DROP FUNCTION IF EXISTS public.agenda_create_recurrence(uuid, text, text, integer, text, text, integer, integer[], date, date, integer, text);
DROP FUNCTION IF EXISTS public.agenda_delete_session(uuid, text);
DROP FUNCTION IF EXISTS public.agenda_set_session_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.agenda_update_session(uuid, text, timestamptz, jsonb);
DROP FUNCTION IF EXISTS public.agenda_find_conflicts(timestamptz, integer, uuid);
DROP FUNCTION IF EXISTS public.agenda_session_summaries(uuid[]);
DROP FUNCTION IF EXISTS public.agenda_guard_session_conflicts();
DROP FUNCTION IF EXISTS public.agenda_reset_push_reservations();
DROP FUNCTION IF EXISTS public.agenda_conflict_ids(uuid, timestamptz, integer, uuid);

DROP TABLE IF EXISTS public.session_recurrence_exceptions;

DROP INDEX IF EXISTS public.uq_sessions_recurrence_occurrence;
DROP INDEX IF EXISTS public.idx_sessions_agenda_active;
DROP INDEX IF EXISTS public.idx_sessions_coach_client_date;

ALTER TABLE public.sessions DROP COLUMN IF EXISTS occurrence_date;
ALTER TABLE public.session_recurrences DROP CONSTRAINT IF EXISTS session_recurrences_id_coach_key;
ALTER TABLE public.session_recurrences DROP CONSTRAINT IF EXISTS session_recurrences_frequence_check;
ALTER TABLE public.session_recurrences DROP CONSTRAINT IF EXISTS session_recurrences_intervalle_check;
ALTER TABLE public.session_recurrences DROP CONSTRAINT IF EXISTS session_recurrences_nb_occurrences_check;
ALTER TABLE public.session_recurrences DROP COLUMN IF EXISTS frequence, DROP COLUMN IF EXISTS intervalle, DROP COLUMN IF EXISTS nb_occurrences;

COMMIT;
