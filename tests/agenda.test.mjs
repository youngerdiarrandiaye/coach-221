import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { addDays, overlaps, parseConflictIds, parseSessionDateTime, periodBounds, zonedDayStart } from '../src/lib/agenda.ts'
import {
  agendaRecurrenceSchema, conflictCheckSchema, periodQuerySchema, sessionCreateSchema, sessionPatchSchema, statusPatchSchema,
} from '../src/features/sessions/agendaSchemas.ts'
import { assertDatabaseSuccess } from '../src/lib/databaseResult.ts'
import { failure } from '../src/server/http.ts'
import { SessionConflictError } from '../src/exception/SessionConflictError.ts'
import { runSessionReminders } from '../src/services/reminderService.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const CA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CA2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const VERSION = '2026-10-13T10:00:00.123456+00:00'

// ---------------------------------------------------------------------------
// Fonctions pures et schémas
// ---------------------------------------------------------------------------
test('chevauchement : fin exclusive, inclusion, même horaire, séances voisines', () => {
  const slot = (hhmm, duree) => ({ date_heure: `2026-10-20T${hhmm}:00Z`, duree_minutes: duree })
  assert.equal(overlaps(slot('17:00', 60), slot('18:00', 60)), false, '17h-18h et 18h-19h')
  assert.equal(overlaps(slot('18:00', 60), slot('17:00', 60)), false, 'symétrique')
  assert.equal(overlaps(slot('17:30', 60), slot('18:00', 60)), true, 'chevauchement partiel')
  assert.equal(overlaps(slot('18:00', 120), slot('18:30', 30)), true, 'inclusion')
  assert.equal(overlaps(slot('18:00', 60), slot('18:00', 60)), true, 'même horaire')
  assert.equal(overlaps(slot('18:00', 5), slot('18:05', 5)), false, 'bord exact à 5 minutes')
  assert.equal(overlaps(slot('18:00', 5), slot('18:04', 5)), true, 'une minute de recouvrement')
})

test('période : jours Dakar bornes incluses, 100 jours maximum, ordre contrôlé', () => {
  assert.deepEqual(periodBounds('2026-10-13', '2026-10-13'), { start: '2026-10-13T00:00:00.000Z', end: '2026-10-14T00:00:00.000Z' })
  assert.equal(zonedDayStart('2026-03-29'), '2026-03-29T00:00:00.000Z')
  assert.equal(zonedDayStart('2026-07-01', 'America/New_York'), '2026-07-01T04:00:00.000Z')
  assert.doesNotThrow(() => periodBounds('2026-01-01', addDays('2026-01-01', 100)))
  assert.throws(() => periodBounds('2026-01-01', addDays('2026-01-01', 101)), /TOO_LONG/)
  assert.throws(() => periodBounds('2026-02-01', '2026-01-01'), /ORDER/)
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

test('dates de séance : heure de Dakar ou ISO complet, valeurs impossibles refusées', () => {
  assert.equal(parseSessionDateTime('2026-10-20T09:30'), '2026-10-20T09:30:00.000Z')
  assert.equal(parseSessionDateTime('2026-10-20T09:30:00Z'), '2026-10-20T09:30:00.000Z')
  assert.equal(parseSessionDateTime('2026-10-20T10:30:00+01:00'), '2026-10-20T09:30:00.000Z')
  for (const bad of ['2026-10-20', '2026-02-30T09:00', '2026-10-20T24:00', 'demain']) assert.throws(() => parseSessionDateTime(bad), undefined, bad)
})

test('conflits : identifiants lus dans le détail de la base, rien d’autre accepté', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  assert.deepEqual(parseConflictIds(`conflits:${id},${id.replace(/a/g, 'b')}`), [id, id.replace(/a/g, 'b')])
  assert.deepEqual(parseConflictIds('conflits:1; DROP TABLE sessions'), [])
  assert.deepEqual(parseConflictIds(null), [])
})

test('erreurs base : codes métier traduits en 409/404, aucun détail SQL exposé', async () => {
  const thrown = fn => { try { fn() } catch (error) { return error } }
  const conflict = thrown(() => assertDatabaseSuccess({ code: '23P01', message: 'x', details: `conflits:${CA}` }))
  assert.ok(conflict instanceof SessionConflictError)
  assert.deepEqual(conflict.conflictIds, [CA])
  const response = failure(new SessionConflictError([CA], [{ id: CA, titre: 'Cardio', client_id: CB, client: 'Awa Diop', date_heure: '2026-10-20T09:00:00Z', duree_minutes: 60 }]))
  assert.equal(response.status, 409)
  const body = await response.json()
  assert.equal(body.error.code, 'SESSION_CONFLICT')
  assert.equal(body.error.conflicts[0].client, 'Awa Diop')
  const stale = thrown(() => assertDatabaseSuccess({ code: 'CS409', message: 'x' }))
  assert.deepEqual([stale.statusCode, stale.code], [409, 'STALE_VERSION'])
  assert.equal(thrown(() => assertDatabaseSuccess({ code: 'CS404', message: 'x' })).statusCode, 404)
  assert.equal(thrown(() => assertDatabaseSuccess({ code: 'CS410', message: 'Une séance effectuée fait partie de l’historique.' })).code, 'SESSION_LOCKED')
  assert.equal(thrown(() => assertDatabaseSuccess({ code: '22023', message: 'Paramètres de récurrence invalides' })).statusCode, 400)
  const leak = thrown(() => assertDatabaseSuccess({ code: '22023', message: 'invalid input value for enum session_status: "X"' }))
  assert.doesNotMatch(leak.message, /enum|session_status/)
  assert.doesNotMatch(thrown(() => assertDatabaseSuccess({ code: '42P01', message: 'relation "public.sessions" does not exist' })).message, /relation|sessions/)
})

test('schémas séance : coachId refusé, messages français, durée texte ou nombre', () => {
  const ok = { client_id: CA, titre: 'Cardio', date_heure: '2026-10-20T09:00', duree_minutes: '60' }
  const parsed = sessionCreateSchema.parse(ok)
  assert.equal(parsed.date_heure, '2026-10-20T09:00:00.000Z')
  assert.equal(parsed.duree_minutes, 60)
  assert.equal(sessionCreateSchema.parse({ ...ok, duree_minutes: 45 }).duree_minutes, 45)
  for (const extra of [{ coach_id: B }, { coachId: B }, { statut: 'EFFECTUEE' }]) {
    const result = sessionCreateSchema.safeParse({ ...ok, ...extra })
    assert.equal(result.success, false)
    assert.match(result.error.issues[0].message, /^Champ non autorisé/)
  }
  for (const bad of [{ duree_minutes: '4' }, { duree_minutes: '481' }, { duree_minutes: 'abc' }, { titre: 'a' }, { client_id: 'x' }, { date_heure: '2026-02-30T10:00' }]) {
    const result = sessionCreateSchema.safeParse({ ...ok, ...bad })
    assert.equal(result.success, false, JSON.stringify(bad))
    assert.doesNotMatch(result.error.issues[0].message, /Invalid|expected|received/)
  }
  assert.equal(sessionCreateSchema.safeParse({ ...ok, titre: undefined }).success, false)
})

test('schémas modification, statut, conflits et période', () => {
  assert.equal(sessionPatchSchema.safeParse({ titre: 'Cardio' }).success, false, 'version obligatoire')
  const patch = sessionPatchSchema.parse({ titre: 'Cardio', expected_updated_at: VERSION })
  assert.equal(patch.scope, 'ONE')
  assert.ok(!('description' in patch), 'champ absent = champ non modifié')
  assert.equal('description' in sessionPatchSchema.parse({ description: null, expected_updated_at: VERSION }), true)
  assert.equal(sessionPatchSchema.safeParse({ scope: 'TOUT', expected_updated_at: VERSION }).success, false)
  assert.equal(sessionPatchSchema.safeParse({ coach_id: B, expected_updated_at: VERSION }).success, false)
  assert.equal(sessionPatchSchema.safeParse({ expected_updated_at: 'hier' }).success, false)
  assert.deepEqual(statusPatchSchema.parse({ statut: 'ANNULEE' }), { statut: 'ANNULEE', scope: 'ONE' })
  assert.equal(statusPatchSchema.safeParse({ statut: 'FAIT' }).success, false)
  assert.equal(conflictCheckSchema.safeParse({ date_heure: '2026-10-20T09:00', duree_minutes: '60', exclude_id: CA }).success, true)
  assert.equal(conflictCheckSchema.safeParse({ date_heure: '2026-10-20T09:00', duree_minutes: '60', coach_id: B }).success, false)
  assert.equal(periodQuerySchema.safeParse({ from: '2026-10-01' }).success, false)
  assert.equal(periodQuerySchema.safeParse({ from: '2026-10-01', to: '2026-09-01' }).success, false)
  assert.equal(periodQuerySchema.safeParse({ from: '2026-01-01', to: '2026-04-12' }).success, false)
  assert.equal(periodQuerySchema.safeParse({ from: '2026-01-01', to: '2026-04-11', statut: 'ANNULEE' }).success, true)
  assert.equal(periodQuerySchema.safeParse({ statut: 'X' }).success, false)
  assert.equal(periodQuerySchema.safeParse({}).success, true)
})

test('schéma récurrence : fréquence, fin obligatoire, jours, bornes, coachId refusé', () => {
  const base = { client_id: CA, titre: 'Cardio', duree_minutes: '60', heure: '09:00', date_debut: '2026-10-19', jours: [1, 3], date_fin: '2026-11-19' }
  const ok = agendaRecurrenceSchema.parse(base)
  assert.deepEqual([ok.frequence, ok.intervalle, ok.on_conflict, ok.nb_occurrences], ['HEBDOMADAIRE', 1, 'REJECT', null])
  assert.equal(agendaRecurrenceSchema.parse({ ...base, jours: [3, 1, 3] }).jours.length, 2)
  assert.equal(agendaRecurrenceSchema.parse({ ...base, frequence: 'QUOTIDIENNE', jours: undefined, date_fin: '', nb_occurrences: '5' }).nb_occurrences, 5)
  assert.equal(agendaRecurrenceSchema.parse({ ...base, frequence: 'MENSUELLE', jours: undefined, date_fin: undefined, nb_occurrences: 3, on_conflict: 'SKIP' }).on_conflict, 'SKIP')
  const bad = [
    { date_fin: undefined }, { date_fin: '' }, { jours: [] }, { jours: undefined }, { jours: [7] }, { frequence: 'ANNUELLE' },
    { intervalle: 13 }, { intervalle: 0 }, { nb_occurrences: 201 }, { nb_occurrences: 0 }, { on_conflict: 'IGNORE' },
    { date_fin: '2026-10-18' }, { date_fin: '2027-10-21' }, { heure: '24:00' }, { coach_id: B }, { duree_minutes: '2' },
  ]
  for (const item of bad) {
    const result = agendaRecurrenceSchema.safeParse({ ...base, ...item })
    assert.equal(result.success, false, JSON.stringify(item))
    assert.doesNotMatch(result.error.issues[0].message, /Invalid|expected|received/, JSON.stringify(item))
  }
  assert.equal(agendaRecurrenceSchema.safeParse({ ...base, date_fin: '2027-10-19' }).success, true, '366 jours acceptés')
})

// ---------------------------------------------------------------------------
// Base PostgreSQL (PGlite) avec les vrais fichiers SQL
// ---------------------------------------------------------------------------
const sqlFiles = ['schema.sql', 'recurrences.sql', 'migrations/add_progress_metrics.sql', 'migrations/20260909_reliability.sql', 'migrations/20261012_workout_logs.sql', 'migrations/20261013_push_reminders.sql']
const read = file => readFile(new URL('../supabase/' + file, import.meta.url), 'utf8')

async function newDatabase(t) {
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
  for (const file of sqlFiles) await db.exec(await read(file))
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.clients, public.sessions, public.session_recurrences TO authenticated;
    GRANT ALL ON public.sessions, public.session_reminders, public.push_sent TO service_role;
  `)
  await db.query(`INSERT INTO auth.users (id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')`, [A, B])
  await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone) VALUES
    ($1,$2,'Diop','Awa','771234567'),($3,$2,'Ndiaye','Moussa','772345678'),($4,$5,'Fall','Bineta','781234567')`, [CA, A, CA2, CB, B])
  return db
}

const asCoach = async (db, id) => { await db.exec('RESET ROLE; SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
const asAdmin = db => db.exec('RESET ROLE')
const code = expected => error => error.code === expected
const conflictWith = ids => error => error.code === '23P01' && parseConflictIds(error.detail).length === ids.length && ids.every(id => error.detail.includes(id))

// Dates relatives : toujours dans le futur, calées sur un lundi pour des séries prévisibles.
const today = new Date()
let monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 14))
while (monday.getUTCDay() !== 1) monday = new Date(monday.getTime() + 86_400_000)
const MON = monday.toISOString().slice(0, 10)
const day = n => addDays(MON, n)
const at = (date, hhmm) => `${date}T${hhmm}:00Z`

function helpers(db) {
  const insert = async (coach, client, start, duree = 60, extra = {}) => {
    const { rows } = await db.query(
      `INSERT INTO public.sessions (coach_id,client_id,titre,date_heure,duree_minutes,statut) VALUES ($1,$2,$3,$4::timestamptz,$5,$6) RETURNING id`,
      [coach, client, extra.titre ?? 'Test agenda', start, duree, extra.statut ?? 'PLANIFIEE'])
    return rows[0].id
  }
  const version = async id => (await db.query('SELECT updated_at::text AS v FROM public.sessions WHERE id=$1', [id])).rows[0].v
  const update = async (id, patch, scope = 'ONE', expected) =>
    (await db.query('SELECT public.agenda_update_session($1,$2,$3::timestamptz,$4::jsonb) r', [id, scope, expected ?? await version(id), JSON.stringify(patch)])).rows[0].r
  const status = async (id, statut, scope = 'ONE') => (await db.query('SELECT public.agenda_set_session_status($1,$2,$3) r', [id, statut, scope])).rows[0].r
  const remove = async (id, scope = 'ONE') => (await db.query('SELECT public.agenda_delete_session($1,$2) r', [id, scope])).rows[0].r
  const series = async (client, o = {}) => (await db.query(
    'SELECT public.agenda_create_recurrence($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12) r',
    [client, o.titre ?? 'Cardio', null, o.duree ?? 60, o.heure ?? '09:00', o.frequence ?? 'HEBDOMADAIRE', o.intervalle ?? 1,
      o.jours === undefined ? (o.frequence && o.frequence !== 'HEBDOMADAIRE' ? null : [1]) : o.jours, o.debut ?? MON, o.fin ?? null, o.nb ?? null, o.onConflict ?? 'REJECT'])).rows[0].r
  const dates = async id => (await db.query(
    `SELECT to_char(date_heure AT TIME ZONE 'Africa/Dakar','YYYY-MM-DD HH24:MI') AS d, statut FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure`, [id])).rows
  const days = async id => (await dates(id)).map(row => row.d.slice(0, 10))
  const wipe = async () => { await asAdmin(db); await db.exec('DELETE FROM public.sessions; DELETE FROM public.session_recurrences') }
  return { insert, version, update, status, remove, series, dates, days, wipe }
}

test('migration agenda : rejouée deux fois, séries existantes complétées sans toucher aux données', async t => {
  const db = await newDatabase(t)
  const h = helpers(db)
  // Données héritées AVANT la migration : série créée par l'ancienne fonction et deux séances qui se chevauchent.
  await asCoach(db, A)
  const legacy = (await db.query(`SELECT public.create_session_recurrence($1,'Ancienne série',null,60,'08:00',ARRAY[1,3],$2::date,$3::date) AS id`, [CA, MON, day(13)])).rows[0].id
  const overlapA = await h.insert(A, CA, at(day(40), '10:00'), 60, { titre: 'Héritée 1' })
  const overlapB = await h.insert(A, CA2, at(day(40), '10:30'), 60, { titre: 'Héritée 2' })
  await asAdmin(db)
  const before = (await db.query('SELECT id, updated_at::text AS v, date_heure, titre, statut FROM public.sessions ORDER BY id')).rows
  const migration = await read('migrations/20261014_agenda.sql')
  await db.exec(migration)
  await db.exec(migration)
  await db.exec(migration)
  const after = (await db.query('SELECT id, updated_at::text AS v, date_heure, titre, statut, occurrence_date::text AS od FROM public.sessions ORDER BY id')).rows
  assert.equal(after.length, before.length)
  for (const row of before) {
    const now = after.find(item => item.id === row.id)
    assert.deepEqual([now.v, now.date_heure, now.titre, now.statut], [row.v, row.date_heure, row.titre, row.statut], 'séance existante inchangée')
  }
  const inSeries = (await db.query('SELECT occurrence_date::text AS od, (date_heure AT TIME ZONE \'Africa/Dakar\')::date::text AS jour FROM public.sessions WHERE recurrence_id=$1', [legacy])).rows
  assert.equal(inSeries.length, 4)
  assert.ok(inSeries.every(row => row.od === row.jour), 'occurrence_date reprend le jour Dakar')
  assert.equal(after.find(row => row.id === overlapA).od, null)
  const rule = (await db.query('SELECT frequence, intervalle, nb_occurrences FROM public.session_recurrences WHERE id=$1', [legacy])).rows[0]
  assert.deepEqual(rule, { frequence: 'HEBDOMADAIRE', intervalle: 1, nb_occurrences: null })
  // Les chevauchements hérités ne bloquent rien : modification neutre, statut, suppression.
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_recurrence_exceptions TO authenticated')
  await asCoach(db, A)
  await db.query("UPDATE public.sessions SET titre='Héritée 1 bis', notes='ok' WHERE id=$1", [overlapA])
  await db.query("UPDATE public.sessions SET statut='EFFECTUEE' WHERE id=$1", [overlapB])
  await db.query("UPDATE public.sessions SET statut='PLANIFIEE' WHERE id=$1", [overlapB])
  assert.equal((await db.query('SELECT count(*)::int n FROM public.sessions WHERE id IN ($1,$2)', [overlapA, overlapB])).rows[0].n, 2)
  // Mais déplacer l'une d'elles vers un créneau occupé est refusé.
  const free = await h.insert(A, CA, at(day(41), '10:00'))
  await assert.rejects(db.query("UPDATE public.sessions SET date_heure=$2::timestamptz WHERE id=$1", [free, at(day(40), '10:15')]), conflictWith([overlapA, overlapB]))
  // Objets créés et protégés.
  await asAdmin(db)
  const objects = (await db.query(`SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'agenda_%' ORDER BY 1`)).rows.map(row => row.proname)
  assert.deepEqual(objects, ['agenda_conflict_ids', 'agenda_create_recurrence', 'agenda_delete_session', 'agenda_find_conflicts', 'agenda_guard_session_conflicts', 'agenda_reset_push_reservations', 'agenda_session_summaries', 'agenda_set_session_status', 'agenda_update_session'])
  const triggers = (await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.sessions'::regclass AND NOT tgisinternal ORDER BY 1`)).rows.map(row => row.tgname)
  assert.ok(triggers.includes('trg_sessions_agenda_conflicts') && triggers.includes('trg_sessions_reset_push'))
  assert.equal((await db.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid='public.sessions'::regclass AND tgname='trg_sessions_agenda_conflicts'`)).rows[0].n, 1)
})

test('agenda PostgreSQL : conflits, versions, portées, récurrences, isolation, rappels', async t => {
  const db = await newDatabase(t)
  await db.exec(await read('migrations/20261014_agenda.sql'))
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_recurrence_exceptions TO authenticated')
  const h = helpers(db)
  const exceptions = async () => (await db.query('SELECT occurrence_date::text AS d, kind FROM public.session_recurrence_exceptions ORDER BY occurrence_date')).rows

  await t.test('conflits : partiel, inclusion, bords exacts, même horaire, annulées ignorées', async () => {
    await h.wipe(); await asCoach(db, A)
    const base = await h.insert(A, CA, at(day(0), '18:00'), 60)
    for (const [start, duree] of [['17:30', 60], ['18:30', 60], ['18:15', 15], ['17:00', 180], ['18:00', 60], ['17:59', 5], ['18:59', 5]])
      await assert.rejects(h.insert(A, CA2, at(day(0), start), duree), conflictWith([base]), `${start}/${duree}`)
    const before = (await db.query('SELECT count(*)::int n FROM public.sessions')).rows[0].n
    await h.insert(A, CA2, at(day(0), '17:00'), 60)   // finit à 18:00 pile
    await h.insert(A, CA2, at(day(0), '19:00'), 60)   // commence à 19:00 pile
    assert.equal((await db.query('SELECT count(*)::int n FROM public.sessions')).rows[0].n, before + 2)
    await h.status(base, 'ANNULEE')
    await h.insert(A, CA2, at(day(0), '18:00'), 60)   // créneau libéré par l'annulation
    await h.insert(A, CA2, at(day(0), '18:00'), 60, { statut: 'ANNULEE' }) // une annulée n'occupe rien
    await assert.rejects(h.status(base, 'PLANIFIEE'), code('23P01'), 'remettre PLANIFIEE revérifie les conflits')
    assert.equal((await db.query('SELECT statut FROM public.sessions WHERE id=$1', [base])).rows[0].statut, 'ANNULEE')
  })

  await t.test('agenda_find_conflicts : liste lisible, exclusion de la séance éditée, aucun client d’un autre coach', async () => {
    await h.wipe(); await asCoach(db, A)
    const first = await h.insert(A, CA, at(day(1), '10:00'), 60, { titre: 'Cardio' })
    await asAdmin(db)
    await h.insert(B, CB, at(day(1), '10:00'), 60, { titre: 'Séance du coach B' })
    await asCoach(db, A)
    const found = (await db.query('SELECT * FROM public.agenda_find_conflicts($1::timestamptz,60,NULL)', [at(day(1), '10:30')])).rows
    assert.equal(found.length, 1)
    assert.deepEqual([found[0].id, found[0].titre, found[0].client, found[0].duree_minutes], [first, 'Cardio', 'Awa Diop', 60])
    assert.equal((await db.query('SELECT * FROM public.agenda_find_conflicts($1::timestamptz,60,$2)', [at(day(1), '10:30'), first])).rows.length, 0)
    assert.equal((await db.query('SELECT * FROM public.agenda_find_conflicts($1::timestamptz,60,NULL)', [at(day(1), '11:00')])).rows.length, 0)
    await assert.rejects(db.query('SELECT * FROM public.agenda_find_conflicts($1::timestamptz,3,NULL)', [at(day(1), '11:00')]), code('22023'))
    await asCoach(db, B)
    const other = (await db.query('SELECT * FROM public.agenda_find_conflicts($1::timestamptz,60,NULL)', [at(day(1), '10:30')])).rows
    assert.deepEqual(other.map(row => row.titre), ['Séance du coach B'])
  })

  await t.test('deux coachs peuvent occuper le même créneau (le contrôle est par coach)', async () => {
    await h.wipe()
    await asCoach(db, A); await h.insert(A, CA, at(day(2), '09:00'))
    await asCoach(db, B); await h.insert(B, CB, at(day(2), '09:00'))
  })

  await t.test('créations simultanées : une seule gagne, verrou consultatif pris par coach', async () => {
    await h.wipe(); await asCoach(db, A)
    const results = await Promise.allSettled([1, 2, 3].map(() => h.insert(A, CA, at(day(3), '09:00'), 60)))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === '23P01'))
    assert.equal((await db.query("SELECT count(*)::int n FROM public.sessions WHERE date_heure=$1::timestamptz", [at(day(3), '09:00')])).rows[0].n, 1)
    await db.transaction(async tx => {
      await tx.query("INSERT INTO public.sessions (coach_id,client_id,titre,date_heure,duree_minutes) VALUES ($1,$2,'Test agenda',$3::timestamptz,30)", [A, CA, at(day(3), '15:00')])
      const locks = (await tx.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND granted")).rows[0].n
      assert.ok(locks >= 1, 'verrou consultatif pris dans la transaction')
    })
    const outside = (await db.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory'")).rows[0].n
    assert.equal(outside, 0, 'verrou relâché à la fin de la transaction')
  })

  await t.test('version : modification périmée refusée sans rien changer, version valide acceptée', async () => {
    await h.wipe(); await asCoach(db, A)
    const id = await h.insert(A, CA, at(day(4), '09:00'))
    const v1 = await h.version(id)
    const done = await h.update(id, { titre: 'Test agenda v2', notes: 'RAS' }, 'ONE', v1)
    assert.equal(done.updated, 1)
    const v2 = await h.version(id)
    assert.notEqual(v1, v2)
    await assert.rejects(h.update(id, { titre: 'Écrasement' }, 'ONE', v1), code('CS409'))
    await assert.rejects(db.query('SELECT public.agenda_update_session($1,$2,NULL,$3::jsonb)', [id, 'ONE', '{}']), code('CS409'))
    assert.equal((await db.query('SELECT titre FROM public.sessions WHERE id=$1', [id])).rows[0].titre, 'Test agenda v2')
    // Champs : seuls ceux présents changent ; description et notes peuvent être effacées.
    await h.update(id, { description: 'Jambes' }); await h.update(id, { description: null, notes: null })
    const row = (await db.query('SELECT titre, description, notes, duree_minutes FROM public.sessions WHERE id=$1', [id])).rows[0]
    assert.deepEqual(row, { titre: 'Test agenda v2', description: null, notes: null, duree_minutes: 60 })
    await assert.rejects(h.update(id, { titre: 'a' }), code('22023'))
    await assert.rejects(h.update(id, { duree_minutes: 3 }), code('22023'))
    await assert.rejects(db.query('SELECT public.agenda_update_session($1,$2,$3::timestamptz,$4::jsonb)', [id, 'TOUT', v2, '{}']), code('22023'))
  })

  await t.test('modification d’une séance : conflit refusé, séance effectuée verrouillée côté horaire seulement', async () => {
    await h.wipe(); await asCoach(db, A)
    const one = await h.insert(A, CA, at(day(5), '09:00'))
    const two = await h.insert(A, CA2, at(day(5), '11:00'))
    await assert.rejects(h.update(two, { date_heure: at(day(5), '09:30') }), conflictWith([one]))
    await h.update(two, { date_heure: at(day(5), '10:00') })   // bord exact : accepté
    await h.update(two, { duree_minutes: 120 })                  // jusqu'à 12h : accepté
    await assert.rejects(h.update(two, { date_heure: at(day(5), '09:00') }), code('23P01'))
    await h.status(two, 'EFFECTUEE')
    await assert.rejects(h.update(two, { date_heure: at(day(5), '13:00') }), code('CS410'))
    assert.equal((await h.update(two, { notes: 'Très bonne séance' })).updated, 1)
    assert.equal((await db.query('SELECT notes FROM public.sessions WHERE id=$1', [two])).rows[0].notes, 'Très bonne séance')
  })

  await t.test('séries : quotidienne, hebdomadaire, bi-hebdomadaire, mensuelle, personnalisée, fin par date ou nombre', async () => {
    await h.wipe(); await asCoach(db, A)
    const daily = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 5 })
    assert.equal(daily.created, 5); assert.deepEqual(daily.skipped, [])
    assert.deepEqual(await h.days(daily.id), [0, 1, 2, 3, 4].map(day))
    await h.wipe()
    const everyOtherDay = await h.series(CA, { frequence: 'QUOTIDIENNE', intervalle: 2, debut: MON, fin: day(8) })
    assert.deepEqual(await h.days(everyOtherDay.id), [0, 2, 4, 6, 8].map(day))
    await h.wipe()
    const weekly = await h.series(CA, { jours: [1, 3, 5], fin: day(13) })
    assert.deepEqual(await h.days(weekly.id), [0, 2, 4, 7, 9, 11].map(day), 'lundi, mercredi, vendredi sur deux semaines')
    const rule = (await db.query('SELECT frequence, intervalle, jours, nb_occurrences, date_fin::text AS fin FROM public.session_recurrences WHERE id=$1', [weekly.id])).rows[0]
    assert.deepEqual(rule, { frequence: 'HEBDOMADAIRE', intervalle: 1, jours: [1, 3, 5], nb_occurrences: null, fin: day(13) })
    await h.wipe()
    const biweekly = await h.series(CA, { jours: [1, 3], intervalle: 2, fin: day(34) })
    assert.deepEqual(await h.days(biweekly.id), [0, 2, 14, 16, 28, 30].map(day), 'une semaine sur deux')
    await h.wipe()
    const custom = await h.series(CA, { jours: [2, 5], intervalle: 3, nb: 5 })
    assert.deepEqual(await h.days(custom.id), [1, 4, 22, 25, 43].map(day), 'toutes les trois semaines, mardi et vendredi')
    const customRule = (await db.query('SELECT nb_occurrences, date_fin::text AS fin FROM public.session_recurrences WHERE id=$1', [custom.id])).rows[0]
    assert.deepEqual(customRule, { nb_occurrences: 5, fin: day(43) })
    await h.wipe()
    const nbAndEnd = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 3, fin: day(10) })
    assert.equal(nbAndEnd.created, 3, 'le nombre d’occurrences coupe avant la date de fin')
    await h.wipe()
    const endBeforeNb = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 50, fin: day(4) })
    assert.equal(endBeforeNb.created, 5, 'la date de fin coupe avant le nombre')
    await h.wipe()
    const heures = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 2, heure: '23:30', duree: 90 })
    assert.deepEqual((await h.dates(heures.id)).map(row => row.d.slice(11)), ['23:30', '23:30'])
  })

  await t.test('série mensuelle : même quantième, dernier jour du mois quand le mois est plus court', async () => {
    await h.wipe(); await asCoach(db, A)
    const future = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 31)).toISOString().slice(0, 10)
    const year = Number(future.slice(0, 4))
    const monthly = await h.series(CA, { frequence: 'MENSUELLE', debut: future, nb: 4 })
    assert.equal(monthly.created, 4)
    assert.deepEqual(await h.days(monthly.id), [`${year}-01-31`, `${year}-02-${year % 4 === 0 ? 29 : 28}`, `${year}-03-31`, `${year}-04-30`])
    await h.wipe()
    const everyTwo = await h.series(CA, { frequence: 'MENSUELLE', intervalle: 2, debut: MON, nb: 3 })
    assert.equal(everyTwo.created, 3)
    const months = (await h.days(everyTwo.id)).map(d => Number(d.slice(5, 7)))
    assert.deepEqual(months, [0, 2, 4].map(k => (Number(MON.slice(5, 7)) - 1 + k) % 12 + 1), 'un mois sur deux')
    assert.equal((await h.days(everyTwo.id))[0], MON)
    await h.wipe()
    await assert.rejects(h.series(CA, { frequence: 'MENSUELLE', intervalle: 12, nb: 5 }), code('22023'), '5 occurrences annuelles dépassent 366 jours')
  })

  await t.test('série : paramètres invalides refusés en français, aucune règle vide créée', async () => {
    await h.wipe(); await asCoach(db, A)
    const invalid = [
      { fin: null, nb: null }, { fin: day(-1) }, { fin: day(400) }, { nb: 201, fin: day(3) }, { frequence: 'ANNUELLE', nb: 2 },
      { intervalle: 13, nb: 2 }, { jours: [], nb: 2 }, { jours: [8], nb: 2 }, { heure: '25:00', nb: 2 }, { duree: 3, nb: 2 }, { onConflict: 'IGNORE', nb: 2 },
      { debut: day(-30), fin: day(-20) },
    ]
    for (const o of invalid) await assert.rejects(h.series(CA, o), code('22023'), JSON.stringify(o))
    await assert.rejects(h.series(CB, { nb: 2 }), code('42501'), 'client d’un autre coach')
    assert.equal((await db.query('SELECT count(*)::int n FROM public.session_recurrences')).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.sessions')).rows[0].n, 0)
  })

  await t.test('REJECT : tout conflit annule toute la série ; SKIP : occurrences conflictuelles ignorées et mémorisées', async () => {
    await h.wipe(); await asCoach(db, A)
    const blocker = await h.insert(A, CA2, at(day(1), '09:30'), 60)
    await assert.rejects(h.series(CA, { frequence: 'QUOTIDIENNE', nb: 4 }), conflictWith([blocker]))
    assert.equal((await db.query('SELECT count(*)::int n FROM public.session_recurrences')).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.sessions')).rows[0].n, 1, 'rien n’a été créé')
    const skipped = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 4, onConflict: 'SKIP' })
    assert.equal(skipped.created, 3)
    assert.deepEqual(skipped.skipped, [{ date: day(1), reason: 'CONFLICT' }])
    assert.deepEqual(await h.days(skipped.id), [0, 2, 3].map(day))
    assert.deepEqual(await exceptions(), [{ d: day(1), kind: 'IGNOREE' }])
    await h.wipe()
    await h.insert(A, CA2, at(day(0), '09:00'))
    await assert.rejects(h.series(CA, { nb: 1, onConflict: 'SKIP' }), code('23P01'), 'toutes ignorées : rien n’est créé')
    assert.equal((await db.query('SELECT count(*)::int n FROM public.session_recurrences')).rows[0].n, 0)
    // Une séance annulée ne bloque pas une série.
    await h.wipe()
    await h.insert(A, CA2, at(day(1), '09:00'), 60, { statut: 'ANNULEE' })
    assert.equal((await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 3 })).created, 3)
  })

  await t.test('anti-doublon : une occurrence (série, jour) n’existe qu’une fois', async () => {
    await h.wipe(); await asCoach(db, A)
    const s = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 3 })
    await assert.rejects(db.query(
      "INSERT INTO public.sessions (coach_id,client_id,recurrence_id,occurrence_date,titre,date_heure,duree_minutes) VALUES ($1,$2,$3,$4::date,'Doublon',$5::timestamptz,30)",
      [A, CA, s.id, MON, at(day(0), '20:00')]), code('23505'))
    const ids = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.id)
    await h.update(ids[0], { date_heure: at(day(0), '15:00') }) // déplacée seule : garde son identité d’origine
    assert.equal((await db.query('SELECT occurrence_date::text AS d FROM public.sessions WHERE id=$1', [ids[0]])).rows[0].d, MON)
    assert.deepEqual(await exceptions(), [{ d: MON, kind: 'MODIFIEE' }])
    await h.remove(ids[1])
    assert.deepEqual((await exceptions()).map(e => e.kind), ['MODIFIEE', 'SUPPRIMEE'])
    // Une exception par (série, jour) au plus.
    await assert.rejects(db.query("INSERT INTO public.session_recurrence_exceptions (recurrence_id,coach_id,occurrence_date,kind) VALUES ($1,$2,$3::date,'IGNOREE')", [s.id, A, MON]), code('23505'))
  })

  await t.test('modification par portée : ONE, FOLLOWING, ALL ; effectuées et passées jamais touchées', async () => {
    await h.wipe(); await asCoach(db, A)
    const s = await h.series(CA, { jours: [1, 3], fin: day(20) })
    const ids = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.id)
    assert.equal(ids.length, 6)
    // ONE : une seule occurrence.
    assert.equal((await h.update(ids[1], { titre: 'Test agenda une', notes: 'note' }, 'ONE')).updated, 1)
    // FOLLOWING depuis la 3e : horaire +1 h, durée 45, ne touche ni les deux premières ni la 4e effectuée.
    await h.status(ids[3], 'EFFECTUEE')
    const following = await h.update(ids[2], { date_heure: at(day(7), '10:00'), duree_minutes: 45, titre: 'Test agenda suivantes' }, 'FOLLOWING')
    assert.equal(following.updated, 3, 'occurrences 3, 5 et 6 (la 4e est effectuée)')
    const rows = (await db.query("SELECT titre, duree_minutes, to_char(date_heure AT TIME ZONE 'Africa/Dakar','HH24:MI') AS h, statut FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure", [s.id])).rows
    assert.deepEqual(rows.map(r => r.h), ['09:00', '09:00', '10:00', '09:00', '10:00', '10:00'])
    assert.deepEqual(rows.map(r => r.duree_minutes), [60, 60, 45, 60, 45, 45])
    assert.deepEqual(rows.map(r => r.titre), ['Cardio', 'Test agenda une', 'Test agenda suivantes', 'Cardio', 'Test agenda suivantes', 'Test agenda suivantes'])
    assert.equal(rows[3].statut, 'EFFECTUEE')
    // ALL : tout ce qui est futur et planifié change ; la série reflète le nouvel horaire.
    const all = await h.update(ids[0], { date_heure: at(day(0), '07:00'), titre: 'Test agenda toutes', description: 'Série' }, 'ALL')
    assert.equal(all.updated, 5)
    const after = (await db.query("SELECT titre, to_char(date_heure AT TIME ZONE 'Africa/Dakar','HH24:MI') AS h, statut FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure", [s.id])).rows
    assert.equal(after[3].statut, 'EFFECTUEE'); assert.equal(after[3].h, '09:00'); assert.equal(after[3].titre, 'Cardio')
    assert.ok(after.filter(r => r.statut === 'PLANIFIEE').every(r => r.titre === 'Test agenda toutes'))
    assert.deepEqual(after.filter(r => r.statut === 'PLANIFIEE').map(r => r.h), ['07:00', '07:00', '08:00', '08:00', '08:00'])
    assert.deepEqual((await db.query('SELECT duree_minutes FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.duree_minutes), [60, 60, 45, 60, 45, 45], 'la durée de chaque occurrence est conservée si elle n’est pas modifiée')
    const rule = (await db.query('SELECT titre, heure, duree_minutes FROM public.session_recurrences WHERE id=$1', [s.id])).rows[0]
    assert.deepEqual(rule, { titre: 'Test agenda toutes', heure: '07:00', duree_minutes: 60 })
    // Séance de série sans portée multiple et séance simple : FOLLOWING/ALL équivaut à ONE.
    const simple = await h.insert(A, CA2, at(day(30), '12:00'))
    assert.equal((await h.update(simple, { titre: 'Test agenda simple' }, 'ALL')).updated, 1)
  })

  await t.test('modification par portée : tout ou rien en cas de conflit', async () => {
    await h.wipe(); await asCoach(db, A)
    const s = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 4 })
    const ids = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.id)
    const blocker = await h.insert(A, CA2, at(day(2), '10:00'), 60)
    const snapshot = async () => (await db.query('SELECT id, date_heure::text AS d, duree_minutes FROM public.sessions ORDER BY id')).rows
    const before = await snapshot()
    await assert.rejects(h.update(ids[0], { date_heure: at(day(0), '10:00') }, 'ALL'), conflictWith([blocker]))
    assert.deepEqual(await snapshot(), before, 'aucune occurrence modifiée')
    // Décalage d'un jour de toute la série : les occurrences sœurs ne se bloquent pas entre elles.
    await h.remove(blocker)
    assert.equal((await h.update(ids[0], { date_heure: at(day(1), '09:00') }, 'ALL')).updated, 4)
    assert.deepEqual(await h.days(s.id), [1, 2, 3, 4].map(day))
    await assert.rejects(h.update(ids[0], { duree_minutes: 1500 }, 'ALL'), code('22023'))
  })

  await t.test('annulation par portée : futures planifiées seulement, historique intact, exceptions enregistrées', async () => {
    await h.wipe(); await asCoach(db, A)
    const s = await h.series(CA, { jours: [1, 3], fin: day(20) })
    const ids = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.id)
    await h.status(ids[0], 'EFFECTUEE')
    assert.equal((await h.status(ids[1], 'ANNULEE', 'ONE')).updated, 1)
    assert.deepEqual(await exceptions(), [{ d: day(2), kind: 'ANNULEE' }])
    assert.equal((await h.status(ids[1], 'PLANIFIEE', 'ONE')).updated, 1)
    assert.deepEqual(await exceptions(), [], 'remettre PLANIFIEE retire l’exception d’annulation')
    const following = await h.status(ids[3], 'ANNULEE', 'FOLLOWING')
    assert.equal(following.updated, 3)
    let statuses = (await h.dates(s.id)).map(r => r.statut)
    assert.deepEqual(statuses, ['EFFECTUEE', 'PLANIFIEE', 'PLANIFIEE', 'ANNULEE', 'ANNULEE', 'ANNULEE'])
    const all = await h.status(ids[1], 'ANNULEE', 'ALL')
    assert.equal(all.updated, 2)
    statuses = (await h.dates(s.id)).map(r => r.statut)
    assert.deepEqual(statuses, ['EFFECTUEE', 'ANNULEE', 'ANNULEE', 'ANNULEE', 'ANNULEE', 'ANNULEE'])
    assert.equal((await exceptions()).length, 5)
    await assert.rejects(h.status(ids[1], 'EFFECTUEE', 'ALL'), code('22023'))
    await assert.rejects(h.status(ids[1], 'PLANIFIEE', 'FOLLOWING'), code('22023'))
    await assert.rejects(h.status(ids[1], 'FAIT', 'ONE'), code('22023'))
  })

  await t.test('suppression par portée : historique conservé, série tronquée ou retirée, jamais de recréation', async () => {
    await h.wipe(); await asCoach(db, A)
    const s = await h.series(CA, { jours: [1, 3], fin: day(20) })
    const ids = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.id)
    await h.status(ids[0], 'EFFECTUEE')
    await assert.rejects(h.remove(ids[0], 'ONE'), code('CS410'), 'une séance effectuée d’une série ne se supprime pas')
    assert.equal((await h.remove(ids[1], 'ONE')).deleted, 1)
    assert.deepEqual(await exceptions(), [{ d: day(2), kind: 'SUPPRIMEE' }])
    const following = await h.remove(ids[3], 'FOLLOWING')
    assert.equal(following.deleted, 3, 'occurrences 4, 5 et 6')
    assert.deepEqual(await h.days(s.id), [day(0), day(7)], 'reste : 1re (effectuée) et 3e')
    const rule = (await db.query('SELECT date_fin::text AS fin, actif FROM public.session_recurrences WHERE id=$1', [s.id])).rows[0]
    assert.equal(rule.fin, day(8), 'la série s’arrête la veille de l’occurrence supprimée')
    const all = await h.remove(ids[2], 'ALL')
    assert.equal(all.deleted, 1)
    const left = await h.dates(s.id)
    assert.equal(left.length, 1); assert.equal(left[0].statut, 'EFFECTUEE')
    assert.equal((await db.query('SELECT actif FROM public.session_recurrences WHERE id=$1', [s.id])).rows[0].actif, false)
    // Supprimer la dernière séance planifiée d'une série sans historique retire la règle et ses exceptions.
    await h.wipe()
    const lone = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 2 })
    await h.remove((await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 LIMIT 1', [lone.id])).rows[0].id, 'ALL')
    assert.equal((await db.query('SELECT count(*)::int n FROM public.session_recurrences')).rows[0].n, 0)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.session_recurrence_exceptions')).rows[0].n, 0)
    // Séance simple : suppression directe quel que soit le statut, portée ignorée.
    const simple = await h.insert(A, CA, at(day(50), '09:00'), 60, { statut: 'EFFECTUEE' })
    assert.equal((await h.remove(simple, 'ALL')).deleted, 1)
  })

  await t.test('l’ancienne suppression de série conserve l’historique et vide les exceptions', async () => {
    await h.wipe(); await asCoach(db, A)
    const s = await h.series(CA, { frequence: 'QUOTIDIENNE', nb: 3 })
    const first = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure LIMIT 1', [s.id])).rows[0].id
    await h.status(first, 'EFFECTUEE')
    await h.status((await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure DESC LIMIT 1', [s.id])).rows[0].id, 'ANNULEE')
    await db.query('SELECT public.delete_session_recurrence($1)', [s.id])
    const left = (await db.query('SELECT id, statut, recurrence_id FROM public.sessions')).rows
    assert.ok(left.some(r => r.id === first && r.statut === 'EFFECTUEE' && r.recurrence_id === null))
    assert.equal((await db.query('SELECT count(*)::int n FROM public.session_recurrence_exceptions')).rows[0].n, 0)
  })

  await t.test('isolation : un coach ne lit, ne modifie, ne supprime ni ne planifie rien chez l’autre', async () => {
    await h.wipe(); await asCoach(db, A)
    const s = await h.series(CA, { jours: [1], fin: day(14), onConflict: 'REJECT' })
    const ids = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.id)
    await h.status(ids[0], 'ANNULEE')
    const snapshot = async () => { await asAdmin(db); return (await db.query('SELECT id, titre, statut, date_heure::text AS d, recurrence_id FROM public.sessions ORDER BY id')).rows }
    const before = await snapshot()
    const stale = await h.version(ids[1])
    await asCoach(db, B)
    await assert.rejects(h.update(ids[1], { titre: 'Piratage' }, 'ONE', stale), code('CS404'))
    for (const scope of ['ONE', 'FOLLOWING', 'ALL']) {
      await assert.rejects(h.status(ids[1], 'ANNULEE', scope), code('CS404'), scope)
      await assert.rejects(h.remove(ids[1], scope), code('CS404'), scope)
    }
    await assert.rejects(db.query('SELECT public.delete_session_recurrence($1)', [s.id]), code('42501'))
    assert.deepEqual((await db.query('SELECT * FROM public.session_recurrence_exceptions')).rows, [], 'exceptions invisibles')
    assert.deepEqual((await db.query('SELECT * FROM public.sessions')).rows, [])
    assert.deepEqual((await db.query('SELECT * FROM public.session_recurrences')).rows, [])
    assert.equal((await db.query('SELECT * FROM public.agenda_session_summaries($1)', [[ids[1]]])).rows.length, 0)
    await assert.rejects(db.query("INSERT INTO public.session_recurrence_exceptions (recurrence_id,coach_id,occurrence_date,kind) VALUES ($1,$2,$3::date,'IGNOREE')", [s.id, B, day(5)]), error => ['23503', '42501'].includes(error.code))
    await assert.rejects(db.query("INSERT INTO public.session_recurrence_exceptions (recurrence_id,coach_id,occurrence_date,kind) VALUES ($1,$2,$3::date,'IGNOREE')", [s.id, A, day(5)]), code('42501'))
    await assert.rejects(h.series(CA, { nb: 2 }), code('42501'), 'planifier pour le client d’un autre coach')
    assert.deepEqual(await snapshot(), before, 'données du coach A inchangées')
    await asCoach(db, B)
    const mine = await h.series(CB, { jours: [1], fin: day(14) })
    assert.ok(mine.created >= 1, 'le coach B planifie à l’identique de A sans conflit')
    await assert.rejects(db.query('SELECT public.agenda_create_recurrence($1,$2,$3,60,$4,$5,1,NULL,$6::date,NULL,2,$7)', [CA, 'X', null, '09:00', 'QUOTIDIENNE', MON, 'REJECT']), code('42501'))
    // Sans identité, tout est refusé ; les anonymes n'ont aucun droit d'exécution.
    await db.exec('RESET ROLE; SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub','',false)")
    await assert.rejects(h.status(ids[1], 'ANNULEE'), code('42501'))
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(db.query('SELECT public.agenda_delete_session($1,$2)', [ids[1], 'ALL']), code('42501'))
  })

  await t.test('rappels push : un déplacement libère les réservations, une simple modification de titre non', async () => {
    await h.wipe(); await asCoach(db, A)
    const id = await h.insert(A, CA, at(day(6), '09:00'))
    await asAdmin(db)
    await db.query('INSERT INTO public.push_sent (session_id, offset_min, coach_id) VALUES ($1,30,$2),($1,10,$2)', [id, A])
    await asCoach(db, A)
    await h.update(id, { titre: 'Test agenda titre' })
    await asAdmin(db)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.push_sent')).rows[0].n, 2, 'titre : réservations conservées')
    await asCoach(db, A)
    await h.update(id, { date_heure: at(day(6), '10:00') })
    await asAdmin(db)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.push_sent')).rows[0].n, 0, 'nouvel horaire : nouveau rappel possible')
  })

  await t.test('rappels WhatsApp : nouvel horaire rappelé, annulation jamais rappelée, séries comme séances simples', async () => {
    await h.wipe(); await asCoach(db, A)
    const slot = at(day(7), '10:00')
    const simple = await h.insert(A, CA, slot, 60, { titre: 'Test agenda simple' })
    const s = await h.series(CA2, { frequence: 'QUOTIDIENNE', debut: day(8), nb: 3, heure: '12:00' })
    await asAdmin(db)
    // Magasin équivalent à /api/cron/session-reminders : PLANIFIEE seulement, réservation par (séance, horaire).
    const store = {
      async findDue(from, until) {
        const { rows } = await db.query(`
          SELECT s.id, s.titre, s.date_heure, s.duree_minutes,
            EXISTS (SELECT 1 FROM public.session_reminders r WHERE r.session_id = s.id AND r.scheduled_for = s.date_heure) AS claimed
          FROM public.sessions s WHERE s.statut = 'PLANIFIEE' AND s.date_heure > $1::timestamptz AND s.date_heure <= $2::timestamptz
          ORDER BY s.date_heure, s.id`, [from, until])
        return rows.filter(row => !row.claimed).map(row => ({
          id: row.id, titre: row.titre, date_heure: new Date(row.date_heure).toISOString(), duree_minutes: row.duree_minutes,
          coach: { telephone: '771234567', prenom: 'Awa' }, client: null,
        }))
      },
      async claim(reminder) {
        const { affectedRows } = await db.query('INSERT INTO public.session_reminders (session_id, scheduled_for) VALUES ($1,$2::timestamptz) ON CONFLICT DO NOTHING', [reminder.id, reminder.date_heure])
        return affectedRows === 1
      },
      async complete(reminder) { await db.query("UPDATE public.session_reminders SET status='sent' WHERE session_id=$1 AND scheduled_for=$2::timestamptz", [reminder.id, reminder.date_heure]) },
    }
    const sent = []
    const send = async reminder => { sent.push([reminder.id, reminder.date_heure]); return { status: 'sent' } }
    const run = when => runSessionReminders(store, send, new Date(when))
    await run(at(day(7), '09:30'))
    assert.deepEqual(sent.map(x => x[0]), [simple])
    await run(at(day(7), '09:35'))
    assert.equal(sent.length, 1, 'jamais deux fois pour le même horaire')
    // Déplacée de 10h à 11h : un nouveau rappel est possible pour le nouvel horaire.
    await asCoach(db, A)
    await h.update(simple, { date_heure: at(day(7), '11:00') })
    await asAdmin(db)
    await run(at(day(7), '10:20'))
    assert.equal(sent.length, 2)
    assert.equal(sent[1][1], at(day(7), '11:00').replace(':00Z', ':00.000Z'))
    // Annulée : plus jamais rappelée, même sur un nouvel horaire.
    await asCoach(db, A)
    await h.status(simple, 'ANNULEE')
    await asAdmin(db)
    await run(at(day(7), '10:50'))
    assert.equal(sent.length, 2)
    // Les occurrences d'une série sont rappelées comme des séances simples, une seule fois chacune.
    const occurrences = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [s.id])).rows.map(r => r.id)
    for (const [index, id] of occurrences.entries()) {
      await run(at(day(8 + index), '11:30')); await run(at(day(8 + index), '11:40'))
      assert.equal(sent.filter(x => x[0] === id).length, 1, `occurrence ${index + 1}`)
    }
    // Occurrence annulée seule : non rappelée ; les autres le restent.
    await asCoach(db, A)
    const extra = await h.series(CA2, { frequence: 'QUOTIDIENNE', debut: day(20), nb: 2, heure: '14:00' })
    const [first, second] = (await db.query('SELECT id FROM public.sessions WHERE recurrence_id=$1 ORDER BY date_heure', [extra.id])).rows.map(r => r.id)
    await h.status(first, 'ANNULEE', 'ONE')
    await asAdmin(db)
    await run(at(day(20), '13:30')); await run(at(day(21), '13:30'))
    assert.equal(sent.filter(x => x[0] === first).length, 0)
    assert.equal(sent.filter(x => x[0] === second).length, 1)
  })
})
