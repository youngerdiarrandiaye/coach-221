import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { subscribeSchema, unsubscribeSchema, reminderSettingsSchema } from '../src/features/push/schemas.ts'
import { formatRemaining, sessionPayload, testPayload, ttlSeconds, reachedOffsets, runPushReminders } from '../src/lib/pushReminders.ts'
import { authRedirect } from '../src/lib/authRoutes.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const CA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }

test('schémas push : abonnement https, clés base64url, messages en français', () => {
  const ok = { endpoint: 'https://example.invalid/push/abc', keys: KEYS }
  assert.equal(subscribeSchema.safeParse(ok).success, true)
  for (const bad of [
    { ...ok, endpoint: 'http://example.invalid/x' }, { ...ok, endpoint: 'pas une url' }, { ...ok, endpoint: 'https://e.invalid/' + 'x'.repeat(1000) },
    { ...ok, keys: { ...KEYS, auth: 'a+b/c=' } }, { ...ok, keys: { ...KEYS, p256dh: 'x'.repeat(201) } }, { ...ok, keys: { p256dh: KEYS.p256dh } }, { endpoint: ok.endpoint },
  ]) assert.equal(subscribeSchema.safeParse(bad).success, false)
  assert.equal(unsubscribeSchema.safeParse({ endpoint: 'https://example.invalid/x' }).success, true)
  assert.equal(unsubscribeSchema.safeParse({}).success, false)
})

test('schéma réglages : dédoublonnage, tri, bornes 1..1440 et 10 valeurs max', () => {
  assert.deepEqual(reminderSettingsSchema.parse({ enabled: true, offsets: [60, 10, 30, 10, 1440], system: false }), { enabled: true, offsets: [10, 30, 60, 1440], system: false })
  assert.deepEqual(reminderSettingsSchema.parse({ enabled: false, offsets: [], system: true }).offsets, [])
  for (const offsets of [[0], [1441], [1.5], ['10'], [-5], Array.from({ length: 11 }, (_, i) => i + 1)]) {
    const r = reminderSettingsSchema.safeParse({ enabled: true, offsets, system: true })
    assert.equal(r.success, false, JSON.stringify(offsets))
    assert.match(r.error.issues[0].message, /délai/)
  }
  assert.equal(reminderSettingsSchema.safeParse({ enabled: 'oui', offsets: [], system: true }).success, false)
  assert.equal(reminderSettingsSchema.parse({ enabled: true, offsets: Array.from({ length: 10 }, (_, i) => i + 1), system: true }).offsets.length, 10)
})

test('format : libellés de délai, charge utile de séance et d’essai, TTL', () => {
  assert.deepEqual([1, 20, 59, 60, 90, 125, 1440].map(formatRemaining), ['1 min', '20 min', '59 min', '1 h', '1 h 30', '2 h 05', '24 h'])
  const now = new Date('2026-10-12T09:10:30Z')
  const session = { id: 's1', coach_id: A, titre: 'Cardio', date_heure: '2026-10-12T09:30:00Z', client: { prenom: 'Awa', nom: 'Diop' } }
  assert.deepEqual(sessionPayload(session, now), {
    title: 'Awa Diop', body: 'Séance Cardio dans 20 min, 09:30', url: '/sessions/s1', tag: 'session-s1',
    kind: 'session-reminder', client: 'Awa Diop', session: 'Cardio', minutes: 20, startsAt: '2026-10-12T09:30:00.000Z',
  })
  assert.equal(sessionPayload({ ...session, date_heure: '2026-10-12T10:40:00Z' }, now).body, 'Séance Cardio dans 1 h 30, 10:40')
  assert.equal(sessionPayload({ ...session, date_heure: '2026-10-12T09:10:40Z' }, now).minutes, 1)
  assert.deepEqual(testPayload(), { title: 'CoachSen', body: 'Vos rappels de séance fonctionnent.', url: '/', tag: 'test', kind: 'test' })
  assert.equal(ttlSeconds(Date.parse('2026-10-12T09:30:00Z'), now.getTime()), 1170)
  assert.equal(ttlSeconds(Date.parse('2026-10-13T09:30:00Z'), now.getTime()), 3600)
  assert.equal(ttlSeconds(Date.parse('2026-10-12T09:00:00Z'), now.getTime()), 0)
})

test('accès : le cron push gère sa propre authentification', () => {
  assert.equal(authRedirect('/api/cron/push-reminders', false), null)
})

// Magasin factice en mémoire : réservation atomique comme INSERT ... ON CONFLICT DO NOTHING.
function fakeStore({ sessions, subs = {}, prefs = {}, failReserve = false }) {
  const reserved = new Set(), removed = [], failures = []
  const store = {
    reserved, removed, failures,
    async listUpcoming() { return sessions },
    async loadCoaches(ids) { return new Map(ids.map(id => [id, { prefs: prefs[id] ?? null, subscriptions: (subs[id] ?? []).map(s => ({ ...s })) }])) },
    async reserve(sessionId, coachId, offsets) {
      if (failReserve) throw new Error('SQL indisponible')
      const won = []
      for (const o of offsets) { const k = `${sessionId}:${o}`; if (!reserved.has(k)) { reserved.add(k); won.push(o) } }
      return won
    },
    async release(sessionId, offsets) { offsets.forEach(o => reserved.delete(`${sessionId}:${o}`)) },
    async markSuccess() {},
    async markFailure(sub) { failures.push(sub.id); return sub.failures + 1 >= 10 },
    async remove(sub) { removed.push(sub.id) },
  }
  return store
}
const sub = (id, failures = 0) => ({ id, endpoint: `https://example.invalid/${id}`, p256dh: 'p', auth: 'a', failures })
const NOW = new Date('2026-10-12T09:00:00Z')
const at = minutes => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const sess = (id, minutes, coach = A) => ({ id, coach_id: coach, titre: 'Cardio', date_heure: at(minutes), client: { prenom: 'Awa', nom: 'Diop' } })
const recorder = (fail = {}) => {
  const calls = []
  const send = async (s, payload, options) => { calls.push({ id: s.id, payload, options }); if (fail[s.id]) throw Object.assign(new Error('push'), { statusCode: fail[s.id] }) }
  return { calls, send }
}

test('délais atteints : seuls ceux dont le temps restant est inférieur ou égal', () => {
  const start = NOW.getTime() + 25 * 60_000
  assert.deepEqual(reachedOffsets([10, 20, 30, 60], start, NOW.getTime()), [30, 60])
  assert.deepEqual(reachedOffsets([30, 30], start, NOW.getTime()), [30])
  assert.deepEqual(reachedOffsets([30], NOW.getTime(), NOW.getTime()), [])
  assert.deepEqual(reachedOffsets([30], NOW.getTime() - 1000, NOW.getTime()), [])
})

test('rappels : plusieurs délais atteints = un seul envoi, puis plus rien au passage suivant', async () => {
  const store = fakeStore({ sessions: [sess('s1', 8)], subs: { [A]: [sub('d1')] }, prefs: { [A]: { enabled: true, offsets: [10, 20, 30] } } })
  const { calls, send } = recorder()
  assert.deepEqual(await runPushReminders(store, send, NOW), { checked: 1, sent: 1, failed: 0, removed: 0 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].payload.minutes, 8)
  assert.equal(calls[0].options.urgency, 'high')
  assert.equal(calls[0].options.ttl, 480)
  assert.equal(store.reserved.size, 3)
  assert.deepEqual(await runPushReminders(store, send, new Date(NOW.getTime() + 60_000)), { checked: 1, sent: 0, failed: 0, removed: 0 })
  assert.equal(calls.length, 1)
})

test('rappels : un nouveau délai atteint plus tard déclenche un second envoi', async () => {
  const store = fakeStore({ sessions: [sess('s1', 25)], subs: { [A]: [sub('d1')] }, prefs: { [A]: { enabled: true, offsets: [10, 30] } } })
  const { calls, send } = recorder()
  await runPushReminders(store, send, NOW)
  assert.equal(calls.length, 1)
  await runPushReminders(store, send, new Date(NOW.getTime() + 16 * 60_000))
  assert.equal(calls.length, 2)
  assert.equal(calls[1].payload.minutes, 9)
})

test('rappels : défaut {enabled, [30]}, désactivation, séance commencée, hors délai, sans abonnement', async () => {
  const subs = { [A]: [sub('d1')], [B]: [] }
  const store = fakeStore({ sessions: [sess('def', 20), sess('far', 45), sess('started', -1), sess('nosub', 10, B)], subs })
  const { calls, send } = recorder()
  const r = await runPushReminders(store, send, NOW)
  assert.deepEqual(calls.map(c => c.payload.tag), ['session-def'])
  assert.equal(r.checked, 4)
  const off = fakeStore({ sessions: [sess('x', 10)], subs, prefs: { [A]: { enabled: false, offsets: [30] } } })
  const none = recorder()
  await runPushReminders(off, none.send, NOW)
  assert.equal(none.calls.length, 0)
  assert.equal(off.reserved.size, 0)
})

test('rappels : séance annulée ou effectuée jamais chargée (filtre PLANIFIEE côté magasin)', async () => {
  const source = await readFile(new URL('../src/dao/pushDao.ts', import.meta.url), 'utf8')
  assert.match(source, /\.eq\('statut', 'PLANIFIEE'\)/)
})

test('rappels : 404/410 supprime l’abonnement sans bloquer les autres', async () => {
  const store = fakeStore({ sessions: [sess('s1', 10)], subs: { [A]: [sub('gone'), sub('ok'), sub('flaky', 9)] } })
  const { calls, send } = recorder({ gone: 410, flaky: 500 })
  const r = await runPushReminders(store, send, NOW)
  assert.deepEqual(r, { checked: 1, sent: 1, failed: 2, removed: 2 })
  assert.deepEqual(store.removed, ['gone'])
  assert.deepEqual(store.failures, ['flaky'])
  assert.equal(calls.length, 3)
  assert.ok(store.reserved.size > 0, 'un succès conserve la réservation')
})

test('rappels : échec temporaire pour tous = réservation libérée et réessai ; échec définitif = conservée', async () => {
  const store = fakeStore({ sessions: [sess('s1', 10)], subs: { [A]: [sub('d1')] } })
  const down = recorder({ d1: 503 })
  assert.equal((await runPushReminders(store, down.send, NOW)).failed, 1)
  assert.equal(store.reserved.size, 0)
  const up = recorder()
  assert.equal((await runPushReminders(store, up.send, new Date(NOW.getTime() + 60_000))).sent, 1)
  const gone = fakeStore({ sessions: [sess('s2', 10)], subs: { [A]: [sub('g')] } })
  await runPushReminders(gone, recorder({ g: 410 }).send, NOW)
  assert.equal(gone.reserved.size, 1)
})

test('rappels : une panne SQL à la réservation ne provoque aucun envoi', async () => {
  const store = fakeStore({ sessions: [sess('s1', 10)], subs: { [A]: [sub('d1')] }, failReserve: true })
  const { calls, send } = recorder()
  await assert.rejects(runPushReminders(store, send, NOW))
  assert.equal(calls.length, 0)
})

test('rappels : deux passages concurrents n’envoient qu’une fois', async () => {
  const store = fakeStore({ sessions: [sess('s1', 10)], subs: { [A]: [sub('d1')] } })
  const { calls, send } = recorder()
  await Promise.all([runPushReminders(store, send, NOW), runPushReminders(store, send, NOW), runPushReminders(store, send, NOW)])
  assert.equal(calls.length, 1)
})

test('migration push_reminders : RLS, contraintes, anti-doublon, rejouable', async t => {
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
  const files = ['schema.sql', 'recurrences.sql', 'migrations/add_progress_metrics.sql', 'migrations/20260909_reliability.sql', 'migrations/20261012_workout_logs.sql', 'migrations/20261013_push_reminders.sql']
  for (const file of files) await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'))
  // Idempotence : rejouer la migration ne doit pas échouer.
  await db.exec(await readFile(new URL('../supabase/migrations/20261013_push_reminders.sql', import.meta.url), 'utf8'))
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.clients, public.sessions TO authenticated;
  `)
  await db.query(`INSERT INTO auth.users (id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')`, [A, B])
  await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone) VALUES ($1,$2,'Diop','A','771234567'),($3,$4,'Fall','B','781234567')`, [CA, A, CB, B])
  const as = async id => { await db.exec('RESET ROLE; SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
  const code = c => error => error.code === c
  const subscribe = (endpoint, ua = null) => db.query('SELECT public.upsert_push_subscription($1,$2,$3,$4) id', [endpoint, KEYS.p256dh, KEYS.auth, ua])
  const prefs = (coach, offsets) => db.query('INSERT INTO public.reminder_prefs (coach_id, offsets) VALUES ($1,$2)', [coach, offsets])

  await t.test('reminder_prefs : défauts, bornes 1..1440, 10 éléments, valeurs nulles', async () => {
    await as(A)
    const row = (await db.query('INSERT INTO public.reminder_prefs (coach_id) VALUES ($1) RETURNING *', [A])).rows[0]
    assert.deepEqual([row.enabled, row.offsets, row.system], [true, [30], true])
    await db.query('UPDATE public.reminder_prefs SET offsets = $2 WHERE coach_id = $1', [A, [1, 1440, 60]])
    for (const offsets of [[0], [1441], [-1], Array.from({ length: 11 }, (_, i) => i + 1), [10, null]])
      await assert.rejects(db.query('UPDATE public.reminder_prefs SET offsets = $2 WHERE coach_id = $1', [A, offsets]), code('23514'), JSON.stringify(offsets))
    await db.query('UPDATE public.reminder_prefs SET offsets = $2 WHERE coach_id = $1', [A, Array.from({ length: 10 }, (_, i) => i + 1)])
    await db.query("UPDATE public.reminder_prefs SET offsets = '{}' WHERE coach_id = $1", [A])
  })

  await t.test('push_subscriptions : bornes, unicité d’endpoint, réattribution au coach courant', async () => {
    await as(A)
    const id = (await subscribe('https://example.invalid/e1', 'UA')).rows[0].id
    assert.equal((await subscribe('https://example.invalid/e1')).rows[0].id, id, 'upsert par endpoint')
    await assert.rejects(db.query('INSERT INTO public.push_subscriptions (coach_id,endpoint,p256dh,auth) VALUES ($1,$2,$3,$4)', [A, 'https://example.invalid/e1', 'p', 'a']), code('23505'))
    await assert.rejects(subscribe('https://example.invalid/' + 'x'.repeat(1000)), code('23514'))
    await assert.rejects(db.query('SELECT public.upsert_push_subscription($1,$2,$3,null)', ['https://example.invalid/e2', 'x'.repeat(201), 'a']), code('23514'))
    await assert.rejects(db.query('SELECT public.upsert_push_subscription($1,$2,$3,null)', ['https://example.invalid/e2', 'p', 'x'.repeat(101)]), code('23514'))
    await assert.rejects(subscribe('https://example.invalid/e2', 'u'.repeat(301)), code('23514'))
    await as(B)
    assert.equal((await subscribe('https://example.invalid/e1')).rows[0].id, id, 'même ligne réattribuée')
    assert.equal((await db.query('SELECT count(*)::int n FROM public.push_subscriptions')).rows[0].n, 1)
    await as(A)
    assert.equal((await db.query('SELECT count(*)::int n FROM public.push_subscriptions')).rows[0].n, 0, 'A ne voit plus l’abonnement réattribué')
    await db.exec('RESET ROLE; SET ROLE authenticated')
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)")
    await assert.rejects(subscribe('https://example.invalid/e9'), code('42501'))
  })

  await t.test('RLS : lecture et écriture croisées refusées', async () => {
    await as(B)
    await prefs(B, [15])
    await subscribe('https://example.invalid/b1')
    await as(A)
    await subscribe('https://example.invalid/a1')
    assert.deepEqual((await db.query('SELECT coach_id FROM public.reminder_prefs')).rows.map(r => r.coach_id), [A])
    assert.deepEqual((await db.query('SELECT DISTINCT coach_id FROM public.push_subscriptions')).rows.map(r => r.coach_id), [A])
    await assert.rejects(prefs(B, [5]), code('42501'))
    await assert.rejects(db.query('INSERT INTO public.push_subscriptions (coach_id,endpoint,p256dh,auth) VALUES ($1,$2,$3,$4)', [B, 'https://example.invalid/forge', 'p', 'a']), code('42501'))
    assert.equal((await db.query('UPDATE public.reminder_prefs SET enabled=false WHERE coach_id=$1 RETURNING coach_id', [B])).rows.length, 0)
    assert.equal((await db.query("DELETE FROM public.push_subscriptions WHERE endpoint='https://example.invalid/b1' RETURNING id")).rows.length, 0)
    await as(B)
    assert.equal((await db.query('SELECT enabled FROM public.reminder_prefs')).rows[0].enabled, true)
    assert.equal((await db.query("SELECT count(*)::int n FROM public.push_subscriptions WHERE endpoint='https://example.invalid/b1'")).rows[0].n, 1)
  })

  await t.test('push_sent : inaccessible aux coachs, réservation atomique y compris en concurrence', async () => {
    await db.exec('RESET ROLE')
    const session = (await db.query("INSERT INTO public.sessions (coach_id,client_id,titre,date_heure) VALUES ($1,$2,'S',now() + interval '10 minutes') RETURNING id", [A, CA])).rows[0].id
    await as(A)
    await assert.rejects(db.query('SELECT * FROM public.push_sent'), code('42501'))
    await assert.rejects(db.query('INSERT INTO public.push_sent (session_id, offset_min, coach_id) VALUES ($1,30,$2)', [session, A]), code('42501'))
    await db.exec('RESET ROLE; SET ROLE service_role')
    const reserve = offset => db.query('INSERT INTO public.push_sent (session_id, offset_min, coach_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING offset_min', [session, offset, A])
    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(30)))
    assert.equal(results.filter(r => r.rows.length === 1).length, 1)
    assert.equal((await reserve(30)).rows.length, 0)
    assert.equal((await reserve(10)).rows.length, 1)
    await db.exec('RESET ROLE')
    await db.query('DELETE FROM public.sessions WHERE id = $1', [session])
    assert.equal((await db.query('SELECT count(*)::int n FROM public.push_sent')).rows[0].n, 0, 'suppression en cascade avec la séance')
  })
})
