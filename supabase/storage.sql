-- ============================================================
-- TerangaCoach — Storage : bucket avatars
-- Exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Créer le bucket public "avatars"
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 Mo max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Politique : chaque coach peut lire/écrire son propre dossier
DROP POLICY IF EXISTS "coaches_manage_own_avatar" ON storage.objects;
CREATE POLICY "coaches_manage_own_avatar"
ON storage.objects
FOR ALL
TO authenticated
USING  (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Lecture publique (pour afficher les avatars)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- ============================================================
-- Seau privé "exports" : rapports PDF partagés par lien signé de 24 h.
-- Idempotent. Aucune politique sur storage.objects pour ce seau : seul le rôle de service
-- (côté serveur, jamais Angular) peut écrire et signer ; les rôles anon et authenticated n'y accèdent pas.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  10485760,  -- 10 Mo max
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
