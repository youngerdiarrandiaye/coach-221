-- UPGRADE 2 : Métriques de progression supplémentaires
-- Appliquer dans le Dashboard Supabase > SQL Editor

ALTER TABLE public.progress_entries
  ADD COLUMN IF NOT EXISTS frequence_cardiaque_repos_bpm  INTEGER      CHECK (frequence_cardiaque_repos_bpm  BETWEEN 20 AND 220),
  ADD COLUMN IF NOT EXISTS frequence_cardiaque_effort_bpm INTEGER      CHECK (frequence_cardiaque_effort_bpm BETWEEN 40 AND 300),
  ADD COLUMN IF NOT EXISTS tour_taille_cm                 NUMERIC(4,1) CHECK (tour_taille_cm  BETWEEN 30 AND 250),
  ADD COLUMN IF NOT EXISTS hanches_cm                     NUMERIC(4,1) CHECK (hanches_cm      BETWEEN 30 AND 250),
  ADD COLUMN IF NOT EXISTS bras_cm                        NUMERIC(4,1) CHECK (bras_cm         BETWEEN  5 AND 100),
  ADD COLUMN IF NOT EXISTS cuisse_cm                      NUMERIC(4,1) CHECK (cuisse_cm       BETWEEN 15 AND 150),
  ADD COLUMN IF NOT EXISTS masse_grasse_pct               NUMERIC(4,1) CHECK (masse_grasse_pct BETWEEN 1 AND  70);
