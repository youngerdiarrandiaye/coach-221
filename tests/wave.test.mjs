import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { activityLimit, frequentLimit } from '../src/lib/limits.ts'
import { assertDatabaseSuccess } from '../src/lib/databaseResult.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const id = (n, c = 'c') => `${c.repeat(8)}-${c.repeat(4)}-4${c.repeat(3)}-8${c.repeat(3)}-${String(n).padStart(12, '0')}`
const req = query => new Request(`http://x.test/api/v1/clients/frequent${query}`)

test('limite : stricte, en français, valeur par défaut', () => {
  assert.equal(frequentLimit(req('')), 6)
  assert.equal(activityLimit(req('')), 15)
  assert.equal(frequentLimit(req('?limit=1')), 1)
  assert.equal(frequentLimit(req('?limit=12')), 12)
  assert.equal(activityLimit(req('?limit=50')), 50)
  for (const bad of ['0', '13', '-1', '1.5', 'abc', '', '%20', '0x5', '1e1', '999999'])
    assert.throws(() => frequentLimit(req(`?limit=${bad}`)), error => error.issues?.[0]?.message === 'Limite invalide (1 à 12).', `frequent ${bad}`)
  for (const bad of ['0', '51', 'x', ''])
    assert.throws(() => activityLimit(req(`?limit=${bad}`)), error => error.issues?.[0]?.message === 'Limite invalide (1 à 50).', `activity ${bad}`)
})

test('erreur SQL de limite : message français exposé en 400', () => {
  assert.throws(() => assertDatabaseSuccess({ code: '22023', message: 'Paramètres invalides : limite de 1 à 12' }), error => error.statusCode === 400)
})

test('migration 20261016_frequent_activity : rejouable, RLS, classement, fil d’activité, isolation', async t => {
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
  const files = ['schema.sql', 'recurrences.sql', 'migrations/add_progress_metrics.sql', 'migrations/20260909_reliability.sql', 'migrations/20261012_workout_logs.sql', 'migrations/20261013_push_reminders.sql', 'migrations/20261014_agenda.sql', 'migrations/20261015_hardening.sql']
  for (const file of files) await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'))
  const migration = await readFile(new URL('../supabase/migrations/20261016_frequent_activity.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // idempotence : second passage sans erreur
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.clients, public.sessions, public.payments,
      public.progress_entries, public.coach_notes, public.session_recurrences, public.exercises, public.workout_logs TO authenticated;
  `)
  await db.query(`INSERT INTO auth.users (id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')`, [A, B])
  const as = async who => { await db.exec('RESET ROLE; SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [who ?? '']) }
  const asAdmin = () => db.exec('RESET ROLE')
  const code = c => error => error.code === c
  const frequent = async (who, limit = 6) => { await as(who); return (await db.query('SELECT * FROM public.clients_frequent($1)', [limit])).rows }
  const activity = async (who, limit = 15) => { await as(who); return (await db.query('SELECT * FROM public.activity_feed($1)', [limit])).rows }
  const ago = (days, hours = 0) => `now() - interval '${days} days' - interval '${hours} hours'`

  // Coach A : Awa, Bineta, Cheikh, Dame, Eva (archivée) ; coach B : Zeynab.
  const [awa, bin, che, dam, eva, fall] = [1, 2, 3, 4, 5, 9].map(n => id(n))
  const squat = id(1, 'e'), presse = id(2, 'e'), squatB = id(3, 'e')
  await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone,actif,created_at) VALUES
    ($1,$7,'Diop','Awa','771000001',true, now() - interval '50 days'),
    ($2,$7,'Sy','Bineta','771000002',true, now() - interval '40 days'),
    ($3,$7,'Ba','Cheikh','771000003',true, now() - interval '30 days'),
    ($4,$7,'Ndiaye','Dame','771000004',true, now() - interval '20 days'),
    ($5,$7,'Faye','Eva','771000005',false, now() - interval '10 days'),
    ($6,$8,'Fall','Zeynab','781000001',true, now() - interval '10 days')`, [awa, bin, che, dam, eva, fall, A, B])
  await db.query(`INSERT INTO public.exercises (id,coach_id,nom) VALUES ($1,$2,'Squat'),($3,$2,'Presse'),($4,$5,'Squat')`, [squat, A, presse, squatB, B])
  const session = (client, coach, statut, when, titre = 'Séance') => db.query(
    `INSERT INTO public.sessions (client_id,coach_id,titre,statut,date_heure,duree_minutes) VALUES ($1,$2,$3,$4,${when},30)`, [client, coach, titre, statut])
  const pay = (client, coach, statut, days, montant = 25000, methode = 'WAVE') => db.query(
    `INSERT INTO public.payments (client_id,coach_id,montant,methode,statut,date_paiement,created_at) VALUES ($1,$2,$3,$4,$5,(${ago(days)})::date,${ago(days)})`, [client, coach, montant, methode, statut])
  const sets = (client, coach, exo, days, count, createdAt = ago(days)) => db.query(
    `INSERT INTO public.workout_logs (coach_id,client_id,exercice_id,log_date,serie_numero,reps,charge_kg,created_at)
     SELECT $1,$2,$3,(${ago(days)})::date,n,10,50,${createdAt} FROM generate_series(1,${count}) n`, [coach, client, exo])

  await t.test('migration : rejouée deux fois, fonctions SECURITY INVOKER, index présent, droits', async () => {
    await asAdmin()
    const defs = (await db.query(`SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname IN ('clients_frequent','activity_feed') ORDER BY 1`)).rows
    assert.deepEqual(defs, [{ proname: 'activity_feed', prosecdef: false }, { proname: 'clients_frequent', prosecdef: false }])
    assert.equal((await db.query(`SELECT count(*)::int n FROM pg_indexes WHERE indexname='idx_workout_logs_coach_date'`)).rows[0].n, 1)
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(db.query('SELECT * FROM public.clients_frequent(6)'), code('42501'))
    await assert.rejects(db.query('SELECT * FROM public.activity_feed(6)'), code('42501'))
  })

  await t.test('sans connexion : refusé ; limites invalides en 22023 français', async () => {
    await as('')
    await assert.rejects(db.query('SELECT * FROM public.clients_frequent(6)'), code('42501'))
    await assert.rejects(db.query('SELECT * FROM public.activity_feed(6)'), code('42501'))
    await as(A)
    for (const bad of [0, 13, -1, null]) await assert.rejects(db.query('SELECT * FROM public.clients_frequent($1)', [bad]), error => error.code === '22023' && /^Paramètres invalides/.test(error.message), String(bad))
    for (const bad of [0, 51, null]) await assert.rejects(db.query('SELECT * FROM public.activity_feed($1)', [bad]), error => error.code === '22023' && /^Paramètres invalides/.test(error.message), String(bad))
    await db.query('SELECT * FROM public.clients_frequent(12)')
    await db.query('SELECT * FROM public.activity_feed(50)')
  })

  await t.test('sans activité : clients actifs les plus récents d’abord, archivés exclus, limite', async () => {
    const rows = await frequent(A)
    assert.deepEqual(rows.map(r => r.id), [dam, che, bin, awa])
    assert.deepEqual(rows[0], { id: dam, prenom: 'Dame', nom: 'Ndiaye', objectif: null, score: 0, last_activity_at: null })
    assert.deepEqual((await frequent(A, 2)).map(r => r.id), [dam, che])
    assert.deepEqual((await frequent(B)).map(r => r.id), [fall], 'un autre coach a sa propre liste')
    assert.deepEqual(await activity(A), [], 'fil vide sans activité')
  })

  await t.test('classement : pondération 1 / 2 / 2, départage par récence, archivés et annulés exclus', async () => {
    await asAdmin()
    // Awa : 3 séances passées non annulées (1 chacune) ; l'annulée et la future ne comptent pas = 3.
    for (const d of [2, 5, 9]) await session(awa, A, 'EFFECTUEE', ago(d))
    await session(awa, A, 'ANNULEE', ago(1))
    await session(awa, A, 'PLANIFIEE', `now() + interval '2 days'`)
    // Bineta : 1 paiement payé (2) + 1 en attente (2) + 1 annulé (0) = 4.
    await pay(bin, A, 'PAYE', 4); await pay(bin, A, 'EN_ATTENTE', 6); await pay(bin, A, 'ANNULE', 1)
    // Cheikh : 1 saisie de 3 séries (une seule saisie = 2) + 1 séance = 3, activité plus ancienne qu'Awa.
    await sets(che, A, squat, 3, 3); await session(che, A, 'PLANIFIEE', ago(20))
    // Dame : séance hors fenêtre (91 jours) = 0 ; Eva archivée très active.
    await session(dam, A, 'EFFECTUEE', ago(91))
    for (const d of [1, 2, 3]) await pay(eva, A, 'PAYE', d)
    const rows = await frequent(A)
    assert.deepEqual(rows.map(r => [r.id, r.score]), [[bin, 4], [awa, 3], [che, 3], [dam, 0]], 'Dame (sans activité récente) complète la liste ; Eva (archivée) absente')
    assert.equal(rows[3].last_activity_at, null)
    // Un client tout juste créé, sans activité, apparaît aussitôt après ceux qui ont de l'activité et avant les plus anciens.
    const fatou = id(6)
    await asAdmin()
    await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone) VALUES ($1,$2,'Gueye','Fatou','771000006')`, [fatou, A])
    assert.deepEqual((await frequent(A)).map(r => r.id), [bin, awa, che, fatou, dam], 'complément par date de création décroissante')
    assert.deepEqual((await frequent(A, 4)).map(r => r.id), [bin, awa, che, fatou], 'limite appliquée au complément')
    assert.ok(!(await frequent(B, 12)).some(r => r.id === fatou), 'autre coach : rien de ce complément')
    assert.ok(new Date(rows[1].last_activity_at) > new Date(rows[2].last_activity_at), 'départage : Awa plus récente que Cheikh')
    assert.deepEqual((await frequent(A, 2)).map(r => r.id), [bin, awa], 'limite respectée')
    assert.deepEqual((await frequent(A, 1)).map(r => r.id), [bin])
  })

  await t.test('classement : deux saisies le même jour comptent deux fois, les séries d’une saisie une seule fois', async () => {
    await asAdmin()
    await sets(dam, A, presse, 1, 4, `now() - interval '1 days'`)       // une saisie de 4 séries = 2
    await sets(dam, A, presse, 1, 2, `now() - interval '23 hours'`)     // seconde saisie le même jour = 2
    await sets(dam, A, squat, 1, 1, `now() - interval '1 days'`)        // autre exercice = 2
    const rows = await frequent(A)
    assert.equal(rows.find(r => r.id === dam).score, 6)
    assert.equal(rows[0].id, dam, 'Dame passe en tête')
  })

  await t.test('fil d’activité : types, signes, en attente, annulés exclus, effectuées seulement, regroupement, ordre', async () => {
    const rows = await activity(A, 50)
    assert.deepEqual([...new Set(rows.map(r => r.type))].sort(), ['payment', 'session', 'workout'])
    assert.equal(rows.filter(r => r.type === 'payment').length, 5, '2 de Bineta + 3 d’Eva archivée (affichée normalement), aucun annulé')
    assert.equal(rows.filter(r => r.type === 'session').length, 3, 'seulement les 3 effectuées de moins de 60 jours')
    const workouts = rows.filter(r => r.type === 'workout')
    assert.equal(workouts.length, 4, 'Cheikh 1 saisie, Dame 3 saisies : une ligne par saisie')
    assert.deepEqual(workouts.map(w => w.title).sort(), ['Presse, 2 séries', 'Presse, 4 séries', 'Squat, 1 série', 'Squat, 3 séries'])
    for (const w of workouts) { assert.equal(w.amount, null); assert.equal(w.pending, false); assert.equal(w.href, `/clients/${w.client_id}/performance`) }
    const payment = rows.find(r => r.type === 'payment' && r.client_id === bin && !r.pending)
    assert.equal(payment.amount, 25000)
    assert.equal(typeof payment.amount, 'number')
    assert.equal(payment.title, 'Wave')
    assert.equal(payment.client, 'Bineta Sy')
    assert.equal(payment.href, `/payments/${payment.id}`)
    assert.equal(rows.find(r => r.type === 'payment' && r.pending).client_id, bin)
    const ses = rows.find(r => r.type === 'session')
    assert.equal(ses.title, 'Séance'); assert.equal(ses.amount, null); assert.equal(ses.pending, false); assert.equal(ses.href, `/sessions/${ses.id}`)
    const times = rows.map(r => new Date(r.at).getTime())
    assert.deepEqual(times, [...times].sort((x, y) => y - x), 'du plus récent au plus ancien')
    assert.equal(new Set(rows.map(r => `${r.type}:${r.id}`)).size, rows.length, 'aucun doublon')
  })

  await t.test('fil d’activité : modes lisibles, fenêtre de 60 jours, limite', async () => {
    await asAdmin()
    await pay(awa, A, 'PAYE', 3, 10000, 'ESPECES'); await pay(awa, A, 'PAYE', 4, 5000, 'ORANGE_MONEY')
    await pay(awa, A, 'PAYE', 61, 99000, 'WAVE')
    await session(awa, A, 'EFFECTUEE', ago(61))
    await sets(awa, A, squat, 62, 2)
    const rows = await activity(A, 50)
    assert.ok(rows.some(r => r.title === 'Espèces' && r.amount === 10000))
    assert.ok(rows.some(r => r.title === 'Orange Money' && r.amount === 5000))
    assert.ok(!rows.some(r => r.amount === 99000), 'paiement de 61 jours exclu')
    assert.ok(!rows.some(r => Date.now() - new Date(r.at).getTime() > 61 * 86400_000), 'rien au-delà de la fenêtre')
    assert.equal(rows.filter(r => r.type === 'session').length, 3, 'séance de 61 jours exclue')
    assert.equal(rows.filter(r => r.type === 'workout').length, 4, 'saisie de 62 jours exclue')
    assert.deepEqual((await activity(A, 3)).map(r => r.id), rows.slice(0, 3).map(r => r.id), 'limite = tête du fil')
    assert.equal((await activity(A, 1)).length, 1)
    assert.ok(rows.length > 3)
  })

  await t.test('isolation : un coach ne voit jamais les données de l’autre', async () => {
    await asAdmin()
    await pay(fall, B, 'PAYE', 1, 77000, 'WAVE'); await session(fall, B, 'EFFECTUEE', ago(1), 'Séance de B'); await sets(fall, B, squatB, 1, 2)
    const b = await activity(B, 50)
    assert.equal(b.length, 3)
    assert.ok(b.every(r => r.client_id === fall && r.client === 'Zeynab Fall'))
    assert.deepEqual((await frequent(B)).map(r => [r.id, r.score]), [[fall, 5]])
    const a = await activity(A, 50)
    assert.ok(!a.some(r => r.client_id === fall || r.amount === 77000 || r.title === 'Séance de B'))
    assert.ok(!(await frequent(A, 12)).some(r => r.id === fall))
  })

  await t.test('performance : index utilisables par les deux fonctions', async () => {
    await asAdmin()
    const names = (await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('payments','sessions','workout_logs') ORDER BY 1`)).rows.map(r => r.indexname)
    for (const expected of ['idx_payments_date', 'idx_sessions_date', 'idx_workout_logs_coach_date']) assert.ok(names.includes(expected), expected)
  })
})
