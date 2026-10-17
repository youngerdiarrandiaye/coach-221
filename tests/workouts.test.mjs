import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { estimate1RM, detectNewRecords, aggregateRecords, countRecordsInRange, periodRange, computeAnalytics, percentile, summarizeRum } from '../src/lib/workoutMath.ts'
import { exerciseSchema, workoutSchema, rumSchema, periodSchema } from '../src/features/workouts/schemas.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const CA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

test('records : 1RM estimé, premier log, records battus avant insertion', () => {
  assert.equal(estimate1RM(100, 3), 110)
  assert.equal(estimate1RM(80, 10), 106.7)
  const first = detectNewRecords([], [{ reps: 5, charge_kg: 100 }, { reps: 8, charge_kg: 60 }])
  assert.deepEqual(first.map(r => [r.type, r.value, r.previous]), [['1RM', 116.7, null], ['CHARGE', 100, null], ['REPS', 8, null]])
  const history = [{ reps: 5, charge_kg: 100 }]
  assert.deepEqual(detectNewRecords(history, [{ reps: 5, charge_kg: 100 }]), [])
  assert.deepEqual(detectNewRecords(history, [{ reps: 10, charge_kg: 90 }]).map(r => [r.type, r.value, r.previous]), [['1RM', 120, 116.7], ['REPS', 10, 5]])
  assert.deepEqual(detectNewRecords(history, []), [])
})

test('records : agrégat par exercice trié par 1RM et date du meilleur 1RM', () => {
  const rows = aggregateRecords([
    { exercice_id: 'e1', log_date: '2026-10-01', reps: 5, charge_kg: 100 },
    { exercice_id: 'e1', log_date: '2026-10-05', reps: 10, charge_kg: 90 },
    { exercice_id: 'e2', log_date: '2026-10-02', reps: 12, charge_kg: 20 },
  ])
  assert.deepEqual(rows.map(r => r.exercice_id), ['e1', 'e2'])
  assert.deepEqual(rows[0], { exercice_id: 'e1', best_1rm: 120, max_charge: 100, max_reps: 10, record_date: '2026-10-05' })
})

test('records : comptage dans la période, premier log compris', () => {
  const base = { client_id: 'c', exercice_id: 'e' }
  const logs = [
    { ...base, log_date: '2026-09-01', reps: 5, charge_kg: 100 },
    { ...base, log_date: '2026-10-02', reps: 5, charge_kg: 90 },
    { ...base, log_date: '2026-10-05', reps: 5, charge_kg: 110 },
  ]
  assert.equal(countRecordsInRange(logs, '2026-10-01', '2026-10-31'), 1)
  assert.equal(countRecordsInRange(logs, '2026-09-01', '2026-09-30'), 1)
})

test('buckets : semaine glissante, mois par semaine ISO, année sur 12 mois', () => {
  const week = periodRange('week', '2026-10-12')
  assert.equal(week.from, '2026-10-06')
  assert.equal(week.buckets.length, 7)
  assert.equal(week.buckets[0].label, 'mar 06')
  assert.deepEqual([week.prevFrom, week.prevTo], ['2026-09-29', '2026-10-05'])
  const month = periodRange('month', '2026-10-12')
  assert.equal(month.from, '2026-09-13')
  assert.deepEqual(month.buckets.map(b => b.label), ['S37', 'S38', 'S39', 'S40', 'S41', 'S42'])
  assert.equal(month.buckets[0].start, '2026-09-13')
  assert.deepEqual([month.buckets[5].start, month.buckets[5].end], ['2026-10-12', '2026-10-12'])
  const year = periodRange('year', '2026-10-12')
  assert.equal(year.from, '2025-11-01')
  assert.equal(year.buckets.length, 12)
  assert.equal(year.buckets[0].label, 'nov. 25')
  assert.equal(year.buckets[11].end, '2026-10-12')
  assert.equal(periodRange('year', '2026-01-15').from, '2025-02-01')
})

test('analytics : volume, séances, poids moyen et variation vs période précédente', () => {
  const r = computeAnalytics({
    period: 'week', today: '2026-10-12',
    logs: [
      { log_date: '2026-10-12', reps: 10, charge_kg: 50 }, { log_date: '2026-10-12', reps: 5, charge_kg: 100 },
      { log_date: '2026-10-07', reps: 10, charge_kg: 40 },
      { log_date: '2026-10-01', reps: 10, charge_kg: 50 },
    ],
    sessionDates: ['2026-10-12', '2026-10-07', '2026-09-01'],
    weights: [{ mesure_date: '2026-10-12', poids_kg: 70 }, { mesure_date: '2026-10-12', poids_kg: 71 }, { mesure_date: '2026-10-08', poids_kg: null }],
    records: 2,
  })
  assert.equal(r.buckets.length, 7)
  const last = r.buckets[6]
  assert.deepEqual([last.volume_kg, last.series, last.seances, last.poids_moyen_kg], [1000, 2, 1, 70.5])
  assert.equal(r.buckets[1].poids_moyen_kg, null)
  assert.deepEqual(r.totals, { volume_kg: 1400, series: 3, seances: 2, records: 2, delta_volume_pct: 180 })
  const none = computeAnalytics({ period: 'week', today: '2026-10-12', logs: [{ log_date: '2026-10-12', reps: 1, charge_kg: 10 }], sessionDates: [], weights: [], records: 0 })
  assert.equal(none.totals.delta_volume_pct, null)
})

test('RUM : percentile, résumé des tâches et des vitals', () => {
  assert.equal(percentile([], 0.75), null)
  assert.equal(percentile([10, 20, 30, 40], 0.75), 30)
  const s = summarizeRum([
    { name: 'task', task: 'log', clicks: 2, duration_ms: 1000, value: null },
    { name: 'task', task: 'log', clicks: 3, duration_ms: 2000, value: null },
    { name: 'task', task: 'log', clicks: 5, duration_ms: 3000, value: null },
    { name: 'task', task: 'log', clicks: 2, duration_ms: 4000, value: null },
    { name: 'vital', task: 'LCP', clicks: null, duration_ms: null, value: 2100 },
    { name: 'vital', task: 'LCP', clicks: null, duration_ms: null, value: 1800 },
    { name: 'vital', task: 'FOO', clicks: null, duration_ms: null, value: 1 },
    { name: 'nav', task: null, clicks: null, duration_ms: null, value: null },
  ])
  assert.deepEqual(s.tasks, [{ task: 'log', count: 4, avg_clicks: 3, p75_duration_ms: 3000, within_3_clicks_pct: 75 }])
  assert.deepEqual(s.vitals, [{ value_name: 'LCP', p75: 2100 }])
})

test('schémas zod : exercice, saisie multi-séries, période et RUM', () => {
  assert.equal(exerciseSchema.parse({ nom: '  Squat ' }).nom, 'Squat')
  assert.equal(exerciseSchema.parse({ nom: 'Squat', groupe_musculaire: '' }).groupe_musculaire, null)
  assert.throws(() => exerciseSchema.parse({ nom: 'x' }))
  const ok = { client_id: CA, log_date: '2026-10-12', exercice_nom: 'Squat', sets: [{ reps: 5, charge_kg: 100.456, rpe: 8.04 }] }
  const parsed = workoutSchema.parse(ok)
  assert.equal(parsed.sets[0].charge_kg, 100.46)
  assert.equal(parsed.sets[0].rpe, 8)
  for (const bad of [
    { ...ok, sets: [] },
    { ...ok, sets: Array.from({ length: 21 }, () => ({ reps: 5, charge_kg: 10 })) },
    { ...ok, sets: [{ reps: 0, charge_kg: 10 }] },
    { ...ok, sets: [{ reps: 101, charge_kg: 10 }] },
    { ...ok, sets: [{ reps: 5, charge_kg: 1001 }] },
    { ...ok, sets: [{ reps: 5, charge_kg: -1 }] },
    { ...ok, sets: [{ reps: 5, charge_kg: 10, rpe: 11 }] },
    { ...ok, log_date: '2026-02-30' },
    { ...ok, notes: 'x'.repeat(501) },
    { ...ok, exercice_nom: undefined },
    { ...ok, exercice_id: CB },
    { ...ok, client_id: 'nope' },
  ]) assert.throws(() => workoutSchema.parse(bad))
  assert.equal(workoutSchema.parse({ ...ok, exercice_nom: undefined, exercice_id: CB }).exercice_id, CB)
  assert.equal(periodSchema.parse('year'), 'year')
  assert.throws(() => periodSchema.parse('decade'))
  assert.deepEqual(rumSchema.parse({ name: 'task', task: 'ajout', clicks: 3, duration_ms: 1200.6 }), { name: 'task', task: 'ajout', path: null, clicks: 3, duration_ms: 1201, value: null })
  // Valeurs hors bornes ignorées, pas d'erreur.
  assert.deepEqual(rumSchema.parse({ name: 'task', clicks: 999, duration_ms: -5, value: 'abc', path: 'x'.repeat(500) }), { name: 'task', task: null, path: null, clicks: null, duration_ms: null, value: null })
  assert.equal(rumSchema.safeParse({ name: 'drop table;' }).success, false)
  assert.equal(rumSchema.safeParse({}).success, false)
})

test('migration workout_logs : RLS, clés composites, bornes, atomicité', async t => {
  const db = new PGlite({ extensions: { uuid_ossp, pg_trgm } })
  t.after(() => db.close())
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
  for (const file of ['schema.sql', 'recurrences.sql', 'migrations/add_progress_metrics.sql', 'migrations/20260909_reliability.sql', 'migrations/20261012_workout_logs.sql'])
    await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'))
  // Idempotence : rejouer la migration ne doit pas échouer.
  await db.exec(await readFile(new URL('../supabase/migrations/20261012_workout_logs.sql', import.meta.url), 'utf8'))
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.clients, public.sessions, public.progress_entries, public.session_recurrences TO authenticated;
  `)
  await db.query(`INSERT INTO auth.users (id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')`, [A, B])
  await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone) VALUES ($1,$2,'Diop','A','771234567'),($3,$4,'Fall','B','781234567')`, [CA, A, CB, B])
  const as = async id => { await db.exec('RESET ROLE; SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
  const code = c => error => error.code === c
  const sets = (...s) => JSON.stringify(s)
  let squatA, squatB

  await t.test('exercices : unicité insensible à la casse par coach et bornes du nom', async () => {
    await as(A)
    squatA = (await db.query("INSERT INTO public.exercises (coach_id,nom,groupe_musculaire) VALUES ($1,'Squat','Jambes') RETURNING id", [A])).rows[0].id
    await assert.rejects(db.query("INSERT INTO public.exercises (coach_id,nom) VALUES ($1,'SQUAT')", [A]), code('23505'))
    await assert.rejects(db.query("INSERT INTO public.exercises (coach_id,nom) VALUES ($1,'x')", [A]), code('23514'))
    await assert.rejects(db.query('INSERT INTO public.exercises (coach_id,nom) VALUES ($1,$2)', [A, 'x'.repeat(81)]), code('23514'))
    await as(B)
    squatB = (await db.query("INSERT INTO public.exercises (coach_id,nom) VALUES ($1,'Squat') RETURNING id", [B])).rows[0].id
  })

  await t.test('RLS : lecture et écriture croisées refusées sur les trois tables', async () => {
    await as(B)
    await db.query("INSERT INTO public.rum_events (coach_id,name,task,clicks) VALUES ($1,'task','ajout',2)", [B])
    await as(A)
    await db.query("INSERT INTO public.rum_events (coach_id,name) VALUES ($1,'nav')", [A])
    await db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-10', squatA, sets({ reps: 5, charge_kg: 100 })])
    for (const table of ['exercises', 'workout_logs', 'rum_events'])
      assert.ok((await db.query(`SELECT coach_id FROM public.${table}`)).rows.every(r => r.coach_id === A), table)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.rum_events')).rows[0].n, 1)
    await assert.rejects(db.query("INSERT INTO public.exercises (coach_id,nom) VALUES ($1,'Presse')", [B]), code('42501'))
    await assert.rejects(db.query("INSERT INTO public.rum_events (coach_id,name) VALUES ($1,'nav')", [B]), code('42501'))
    await assert.rejects(db.query('INSERT INTO public.workout_logs (coach_id,client_id,exercice_id,log_date,serie_numero,reps,charge_kg) VALUES ($1,$2,$3,CURRENT_DATE,1,5,50)', [B, CB, squatB]), code('42501'))
    assert.equal((await db.query('UPDATE public.exercises SET nom=$2 WHERE id=$1 RETURNING id', [squatB, 'Piraté'])).rows.length, 0)
    assert.equal((await db.query('DELETE FROM public.workout_logs WHERE coach_id=$1 RETURNING id', [B])).rows.length, 0)
    await as(B)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.workout_logs')).rows[0].n, 0)
  })

  await t.test('clé composite : client, exercice ou séance d’un autre coach refusés', async () => {
    await as(A)
    const insert = (client, exo, session = null) => db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,$4,null,$5::jsonb)', [client, '2026-10-10', exo, session, sets({ reps: 5, charge_kg: 50 })])
    await assert.rejects(insert(CB, squatA), code('23503'))
    await assert.rejects(insert(CA, squatB), code('23503'))
    await as(B)
    const foreignSession = (await db.query("INSERT INTO public.sessions (coach_id,client_id,titre,date_heure) VALUES ($1,$2,'S',now()) RETURNING id", [B, CB])).rows[0].id
    await as(A)
    await assert.rejects(insert(CA, squatA, foreignSession), code('23503'))
    const mine = (await db.query("INSERT INTO public.sessions (coach_id,client_id,titre,date_heure) VALUES ($1,$2,'S',now()) RETURNING id", [A, CA])).rows[0].id
    const rows = (await insert(CA, squatA, mine)).rows
    assert.equal(rows[0].session_id, mine)
    // Supprimer la séance détache le journal sans le supprimer.
    await db.query('DELETE FROM public.sessions WHERE id=$1', [mine])
    assert.equal((await db.query('SELECT session_id FROM public.workout_logs WHERE id=$1', [rows[0].id])).rows[0].session_id, null)
  })

  await t.test('bornes : reps, charge, RPE, série, notes', async () => {
    await as(A)
    for (const [label, set] of [['reps 0', { reps: 0, charge_kg: 10 }], ['reps 101', { reps: 101, charge_kg: 10 }], ['charge négative', { reps: 5, charge_kg: -1 }],
      ['charge 1000.01', { reps: 5, charge_kg: 1000.01 }], ['rpe 0.5', { reps: 5, charge_kg: 10, rpe: 0.5 }], ['rpe 10.5', { reps: 5, charge_kg: 10, rpe: 10.5 }], ['reps absent', { charge_kg: 10 }]])
      await assert.rejects(db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-11', squatA, sets(set)]), error => ['23514', '23502'].includes(error.code), label)
    await db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-11', squatA, sets({ reps: 100, charge_kg: 1000, rpe: 10 }, { reps: 1, charge_kg: 0, rpe: 1 })])
    await assert.rejects(db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,$4,$5::jsonb)', [CA, '2026-10-11', squatA, 'n'.repeat(501), sets({ reps: 5, charge_kg: 10 })]), code('23514'))
    await assert.rejects(db.query("INSERT INTO public.rum_events (coach_id,name,clicks) VALUES ($1,'task',51)", [A]), code('23514'))
    await assert.rejects(db.query("INSERT INTO public.rum_events (coach_id,name,duration_ms) VALUES ($1,'task',600001)", [A]), code('23514'))
    await assert.rejects(db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-11', squatA, sets()]), code('22023'))
    const twentyOne = JSON.stringify(Array.from({ length: 21 }, () => ({ reps: 5, charge_kg: 10 })))
    await assert.rejects(db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-11', squatA, twentyOne]), code('22023'))
  })

  await t.test('atomicité : une série invalide annule toute la saisie, numérotation dans l’ordre', async () => {
    await as(A)
    const before = (await db.query('SELECT count(*)::int n FROM public.workout_logs')).rows[0].n
    await assert.rejects(db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-13', squatA,
      sets({ reps: 5, charge_kg: 60 }, { reps: 5, charge_kg: 70 }, { reps: 0, charge_kg: 80 })]), code('23514'))
    assert.equal((await db.query('SELECT count(*)::int n FROM public.workout_logs')).rows[0].n, before)
    const { rows } = await db.query('SELECT serie_numero, charge_kg, notes FROM public.create_workout_logs($1,$2,$3,null,$4,$5::jsonb)', [CA, '2026-10-13', squatA, 'Bonne forme', sets({ reps: 5, charge_kg: 60 }, { reps: 5, charge_kg: 70 })])
    assert.deepEqual(rows.map(r => [r.serie_numero, r.charge_kg, r.notes]), [[1, '60.00', 'Bonne forme'], [2, '70.00', null]])
    const more = await db.query('SELECT serie_numero FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-13', squatA, sets({ reps: 3, charge_kg: 80 })])
    assert.equal(more.rows[0].serie_numero, 3)
  })

  await t.test('un utilisateur non authentifié ne peut pas saisir', async () => {
    await db.exec('RESET ROLE; SET ROLE authenticated')
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)")
    await assert.rejects(db.query('SELECT * FROM public.create_workout_logs($1,$2,$3,null,null,$4::jsonb)', [CA, '2026-10-13', squatA, sets({ reps: 5, charge_kg: 10 })]), code('42501'))
  })
})
