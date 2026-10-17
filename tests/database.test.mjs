import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

test('migration PostgreSQL : isolation, transactions, agrégats et rappels', async t => {
  const db = new PGlite({ extensions: { uuid_ossp, pg_trgm } })
  t.after(() => db.close())
  // Infrastructure Supabase minimale ; le schéma métier est lu sans modification.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1, '/') $$;
  `)
  for (const file of ['schema.sql', 'recurrences.sql', 'migrations/add_progress_metrics.sql', 'migrations/20260909_reliability.sql']) {
    await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'))
  }
  await db.exec(await readFile(new URL('../supabase/migrations/20260909_reliability.sql', import.meta.url), 'utf8'))
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.clients, public.sessions,
      public.payments, public.progress_entries, public.coach_notes, public.session_recurrences TO authenticated;
    GRANT SELECT ON public.dashboard_stats TO authenticated;
  `)
  const coachA = '11111111-1111-4111-8111-111111111111'
  const coachB = '22222222-2222-4222-8222-222222222222'
  const clientA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const clientB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  await db.query(`INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ($1,'a@example.test','{"prenom":"Awa","nom":"Diop"}'),($2,'b@example.test','{}')`, [coachA, coachB])
  await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone) VALUES ($1,$2,'Diop','Client A','771234567'),($3,$4,'Fall','Client B','781234567')`, [clientA, coachA, clientB, coachB])
  async function asCoach(id) {
    await db.exec('RESET ROLE; SET ROLE authenticated')
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
  }
  await t.test('les noms du profil proviennent des métadonnées à la création', async () => {
    const { rows } = await db.query('SELECT prenom,nom FROM public.profiles WHERE id=$1', [coachA])
    assert.deepEqual(rows[0], { prenom: 'Awa', nom: 'Diop' })
  })
  await t.test('un coach ne voit pas les clients ni les agrégats de l’autre', async () => {
    await asCoach(coachA)
    assert.deepEqual((await db.query('SELECT id FROM public.clients')).rows.map(row => row.id), [clientA])
    assert.deepEqual((await db.query('SELECT coach_id FROM public.dashboard_stats')).rows.map(row => row.coach_id), [coachA])
  })
  await t.test('paiement, séance, mesure et note ne peuvent référencer un client tiers', async () => {
    await asCoach(coachA)
    for (const sql of [
      "INSERT INTO public.payments (coach_id,client_id,montant,methode,date_paiement) VALUES ($1,$2,25000,'WAVE',CURRENT_DATE)",
      "INSERT INTO public.sessions (coach_id,client_id,titre,date_heure) VALUES ($1,$2,'Cardio',now()+interval '1 day')",
      "INSERT INTO public.progress_entries (coach_id,client_id,poids_kg) VALUES ($1,$2,75)",
      "INSERT INTO public.coach_notes (coach_id,client_id,contenu) VALUES ($1,$2,'Note')",
    ]) await assert.rejects(db.query(sql, [coachA, clientB]), error => error.code === '23503')
    await assert.rejects(db.query("INSERT INTO public.payments (coach_id,client_id,montant,methode,date_paiement) VALUES ($1,$2,25000,'WAVE',CURRENT_DATE)", [coachB, clientB]), error => error.code === '42501')
  })
  await t.test('un paiement valide est conservé, inaccessible aux mutations d’un autre coach', async () => {
    await asCoach(coachA)
    await db.query("INSERT INTO public.payments (coach_id,client_id,montant,methode,date_paiement) VALUES ($1,$2,25000,'WAVE',CURRENT_DATE)", [coachA, clientA])
    await asCoach(coachB)
    assert.equal((await db.query('DELETE FROM public.payments WHERE coach_id=$1 RETURNING id', [coachA])).rows.length, 0)
    await asCoach(coachA)
    assert.equal((await db.query('SELECT montant FROM public.payments')).rows[0].montant, '25000')
  })
  const createSeries = (client = clientA, start = 'CURRENT_DATE + 1', end = 'CURRENT_DATE + 7') => db.query(
    `SELECT public.create_session_recurrence($1,'Cardio',null,60,'09:30',ARRAY[0,1,2,3,4,5,6],${start},${end}) AS id`, [client],
  )
  let seriesId
  await t.test('série créée atomiquement avec les sept horaires de Dakar', async () => {
    await asCoach(coachA)
    seriesId = (await createSeries()).rows[0].id
    const { rows } = await db.query("SELECT to_char(date_heure AT TIME ZONE 'Africa/Dakar','HH24:MI') AS heure FROM public.sessions WHERE recurrence_id=$1", [seriesId])
    assert.equal(rows.length, 7)
    assert.ok(rows.every(row => row.heure === '09:30'))
  })
  await t.test('période passée et client tiers refusés sans créer de règle vide', async () => {
    await assert.rejects(createSeries(clientA, 'CURRENT_DATE - 7', 'CURRENT_DATE - 1'), error => error.code === '22023')
    await assert.rejects(createSeries(clientB), error => error.code === '42501')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.session_recurrences')).rows[0].n, 1)
  })
  await t.test('échec de l’insertion des séances annule également la nouvelle règle', async () => {
    await db.exec(`RESET ROLE;
      CREATE FUNCTION public.fail_session_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Panne simulée'; END $$;
      CREATE TRIGGER fail_session_test BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.fail_session_test();`)
    await asCoach(coachA)
    await assert.rejects(createSeries(), /Panne simulée/)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.session_recurrences')).rows[0].n, 1)
    await db.exec('RESET ROLE; DROP TRIGGER fail_session_test ON public.sessions; DROP FUNCTION public.fail_session_test()')
  })
  await t.test('le revenu de la vue n’est pas multiplié par le nombre de séances', async () => {
    await asCoach(coachA)
    const { rows } = await db.query('SELECT paiements_mois FROM public.dashboard_stats')
    assert.equal(rows[0].paiements_mois, '25000')
  })
  await t.test('réservations des rappels uniques et inaccessibles aux coachs', async () => {
    const sessionId = (await db.query('SELECT id FROM public.sessions LIMIT 1')).rows[0].id
    await assert.rejects(db.query('SELECT * FROM public.session_reminders'), error => error.code === '42501')
    await db.exec('RESET ROLE; SET ROLE service_role')
    await db.query('INSERT INTO public.session_reminders (session_id,scheduled_for) VALUES ($1,now())', [sessionId])
    await assert.rejects(db.query('INSERT INTO public.session_reminders (session_id,scheduled_for) SELECT session_id,scheduled_for FROM public.session_reminders'), error => error.code === '23505')
  })
  await t.test('suppression d’une série : droits contrôlés et historique conservé', async () => {
    await asCoach(coachB)
    await assert.rejects(db.query('SELECT public.delete_session_recurrence($1)', [seriesId]), error => error.code === '42501')
    await asCoach(coachA)
    const keptId = (await db.query('SELECT id FROM public.sessions LIMIT 1')).rows[0].id
    await db.query("UPDATE public.sessions SET date_heure=now()-interval '1 day', statut='EFFECTUEE' WHERE id=$1", [keptId])
    await db.query('SELECT public.delete_session_recurrence($1)', [seriesId])
    const { rows } = await db.query('SELECT id,recurrence_id FROM public.sessions')
    assert.deepEqual(rows, [{ id: keptId, recurrence_id: null }])
  })
})
