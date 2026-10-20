import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { MIGRATIONS } from '../scripts/migrations-list.mjs'

const coachA = '11111111-1111-4111-8111-111111111111'
const coachB = '22222222-2222-4222-8222-222222222222'
const userA = '33333333-3333-4333-8333-333333333333'
const userB = '44444444-4444-4444-8444-444444444444'
const clientA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const clientB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

async function database(t) {
  const db = new PGlite({ extensions: { uuid_ossp, pg_trgm } })
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1, '/') $$;
  `)
  for (const file of MIGRATIONS) await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'))
  await db.exec(`GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.clients, public.progress_entries TO authenticated;`)
  return db
}
const as = async (db, id) => { await db.exec('RESET ROLE; SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }

test('espace client : compte sans profil de coach, lien protégé, lecture seule', async t => {
  const db = await database(t)
  await db.query(`INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ($1,'a@example.test','{"prenom":"Awa"}'),($2,'b@example.test','{}')`, [coachA, coachB])
  await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone,email) VALUES ($1,$2,'Diop','Awa','771234567','awa@example.test'),($3,$4,'Fall','Moussa','781234567','m@example.test')`, [clientA, coachA, clientB, coachB])
  await db.query(`INSERT INTO auth.users (id,email,raw_app_meta_data) VALUES ($1,'awa@example.test','{"role":"client"}'),($2,'m@example.test','{"role":"client"}')`, [userA, userB])

  await t.test('un compte client ne reçoit pas de profil de coach ; un coach en reçoit un', async () => {
    const profiles = (await db.query('SELECT id FROM public.profiles ORDER BY id')).rows.map(r => r.id)
    assert.deepEqual(profiles, [coachA, coachB])
  })

  await db.query(`INSERT INTO public.client_accounts (user_id, client_id, coach_id) VALUES ($1,$2,$3),($4,$5,$6)`, [userA, clientA, coachA, userB, clientB, coachB])

  await t.test('le lien doit désigner un client du bon coach (clé composite)', async () => {
    await db.exec('RESET ROLE')
    await db.query(`INSERT INTO auth.users (id,email,raw_app_meta_data) VALUES ('55555555-5555-4555-8555-555555555555','x@example.test','{"role":"client"}')`)
    await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',$1,'Sow','Fatou','791234567')`, [coachA])
    await assert.rejects(db.query(`INSERT INTO public.client_accounts (user_id, client_id, coach_id) VALUES ('55555555-5555-4555-8555-555555555555','cccccccc-cccc-4ccc-8ccc-cccccccccccc',$1)`, [coachB]), e => e.code === '23503')
  })

  await t.test('un client est lié à un seul compte', async () => {
    await assert.rejects(db.query(`INSERT INTO public.client_accounts (user_id, client_id, coach_id) VALUES ('55555555-5555-4555-8555-555555555555',$1,$2)`, [clientA, coachA]), e => e.code === '23505')
  })

  await t.test('un coach voit les comptes de ses seuls clients', async () => {
    await as(db, coachA)
    assert.deepEqual((await db.query('SELECT client_id FROM public.client_accounts')).rows.map(r => r.client_id), [clientA])
  })

  await t.test('un client voit sa propre ligne seulement, et aucune donnée de coach', async () => {
    await as(db, userA)
    assert.deepEqual((await db.query('SELECT client_id FROM public.client_accounts')).rows.map(r => r.client_id), [clientA])
    assert.equal((await db.query('SELECT id FROM public.clients')).rows.length, 0)
    assert.equal((await db.query('SELECT id FROM public.progress_entries')).rows.length, 0)
  })

  await t.test('un client ne peut ni créer de fiche de coach ni écrire dans client_accounts', async () => {
    await as(db, userA)
    await assert.rejects(db.query(`INSERT INTO public.clients (coach_id,nom,prenom,telephone) VALUES ($1,'X','Y','771111111')`, [userA]))
    for (const [sql, params] of [
      ['INSERT INTO public.client_accounts (user_id, client_id, coach_id) VALUES ($1,$2,$3)', [userA, clientA, coachA]],
      ['UPDATE public.client_accounts SET client_id = $2 WHERE user_id = $1', [userA, clientB]],
      ['DELETE FROM public.client_accounts WHERE user_id = $1', [userA]],
    ]) await assert.rejects(db.query(sql, params), e => e.code === '42501')
  })

  await t.test('anon ne lit rien', async () => {
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(db.query('SELECT 1 FROM public.client_accounts'), e => e.code === '42501')
  })

  await t.test('supprimer la fiche du client supprime le lien d’accès', async () => {
    await db.exec('RESET ROLE')
    await db.query('DELETE FROM public.clients WHERE id=$1', [clientA])
    assert.deepEqual((await db.query('SELECT client_id FROM public.client_accounts')).rows.map(r => r.client_id), [clientB])
  })

  await t.test('GoTrue crée le compte PUIS écrit le rôle : le profil de coach créé entre-temps est retiré', async () => {
    const id = '77777777-7777-4777-8777-777777777777'
    await db.query("INSERT INTO auth.users (id,email) VALUES ($1,'gotrue@example.test')", [id])
    assert.equal((await db.query('SELECT 1 FROM public.profiles WHERE id=$1', [id])).rows.length, 1)   // état transitoire
    await db.query(`UPDATE auth.users SET raw_app_meta_data = '{"role":"client"}' WHERE id=$1`, [id])
    assert.equal((await db.query('SELECT 1 FROM public.profiles WHERE id=$1', [id])).rows.length, 0)
  })

  await t.test('un vrai coach (qui a des clients) ne perd jamais son profil', async () => {
    await db.query(`UPDATE auth.users SET raw_app_meta_data = '{"role":"client"}' WHERE id=$1`, [coachA])
    assert.equal((await db.query('SELECT 1 FROM public.profiles WHERE id=$1', [coachA])).rows.length, 1)
    await db.query(`UPDATE auth.users SET raw_app_meta_data = '{}' WHERE id=$1`, [coachA])
  })

  await t.test('un utilisateur ne peut pas se faire passer pour client par ses métadonnées modifiables', async () => {
    await db.query(`INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ('66666666-6666-4666-8666-666666666666','c@example.test','{"role":"client"}')`)
    assert.equal((await db.query(`SELECT 1 FROM public.profiles WHERE id='66666666-6666-4666-8666-666666666666'`)).rows.length, 1)
  })
})
