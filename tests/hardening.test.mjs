import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { RATE_RULES, RateLimitError, clientIp, enforceRateLimits, rateKey } from '../src/lib/rateLimit.ts'
import { CRON_MAX_AGE_MINUTES, computeCronHealth, cronErrorLabel } from '../src/lib/cronRuns.ts'
import { exportFileName } from '../src/lib/clientExport.ts'
import { requestHash, runIdempotent } from '../src/server/idempotency.ts'
import { failure } from '../src/server/http.ts'
import { assertDatabaseSuccess } from '../src/lib/databaseResult.ts'
import { hasOwnAuthentication, authRedirect } from '../src/lib/authRoutes.ts'
import { isCronAuthorized } from '../src/lib/cronAuth.ts'
import { recordCronRun } from '../src/dao/cronRunDao.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const CA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CA2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const CB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const KEY = '33333333-3333-4333-8333-333333333333'

const quiet = async fn => {
  const original = console.error
  const logs = []
  console.error = (...args) => { logs.push(args.join(' ')) }
  try { return { value: await fn(), logs } } finally { console.error = original }
}

// ---------------------------------------------------------------------------
// Fonctions pures
// ---------------------------------------------------------------------------
test('limitation : règles du contrat, IP, clés hachées sans donnée personnelle', () => {
  const r = RATE_RULES
  assert.deepEqual([r.login.windowSeconds, r.login.max], [600, 10])
  assert.deepEqual([r.register.windowSeconds, r.register.max], [3600, 5])
  assert.deepEqual([r.reset.windowSeconds, r.reset.max], [3600, 5])
  assert.deepEqual([r.rum.windowSeconds, r.rum.max], [60, 120])
  assert.deepEqual([r.pushTest.windowSeconds, r.pushTest.max], [3600, 5])
  assert.deepEqual([r.exports.windowSeconds, r.exports.max], [600, 30])
  assert.deepEqual([r.mutations.windowSeconds, r.mutations.max], [60, 300])
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7')
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '  198.51.100.2  ' })), '198.51.100.2')
  assert.equal(clientIp(new Headers()), 'inconnue')
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': ' ' })), 'inconnue')
  const key = rateKey({ rule: r.login, scope: 'email', identity: ' Awa@Example.test ' })
  assert.match(key, /^login:email:[0-9a-f]{32}$/)
  assert.equal(key, rateKey({ rule: r.login, scope: 'email', identity: 'awa@example.test' }), 'insensible à la casse et aux espaces')
  assert.notEqual(key, rateKey({ rule: r.login, scope: 'ip', identity: 'awa@example.test' }))
  assert.ok(!key.includes('awa') && !key.includes('example'))
})

test('limitation : dépassement = 429 RATE_LIMITED avec Retry-After et message français', async () => {
  const hits = []
  const store = { async hit(key, w, max) { hits.push([key, w, max]); return { allowed: false, retry_after: 42 } } }
  await assert.rejects(enforceRateLimits(store, [{ rule: RATE_RULES.login, scope: 'ip', identity: '1.2.3.4' }]), error => {
    assert.ok(error instanceof RateLimitError)
    assert.equal(error.statusCode, 429)
    assert.equal(error.message, 'Trop de tentatives. Réessayez dans 42 secondes.')
    return true
  })
  assert.deepEqual(hits.map(h => h.slice(1)), [[600, 10]])
  const response = failure(new RateLimitError(42))
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '42')
  assert.deepEqual(await response.json(), { error: { retry_after: 42, code: 'RATE_LIMITED', message: 'Trop de tentatives. Réessayez dans 42 secondes.' } })
  assert.equal(failure(new RateLimitError(1)).status, 429)
  assert.equal(new RateLimitError(1).message, 'Trop de tentatives. Réessayez dans 1 seconde.')
})

test('limitation : toutes les règles sont évaluées, le plus long délai l’emporte', async () => {
  const delays = { a: 5, b: 90 }
  const store = { async hit(key) { return key.includes(':a:') ? { allowed: false, retry_after: delays.a } : key.includes(':b:') ? { allowed: false, retry_after: delays.b } : { allowed: true, retry_after: 0 } } }
  await assert.rejects(enforceRateLimits(store, [
    { rule: RATE_RULES.login, scope: 'a', identity: 'x' }, { rule: RATE_RULES.login, scope: 'b', identity: 'x' }, { rule: RATE_RULES.login, scope: 'c', identity: 'x' },
  ]), error => error.retryAfter === 90)
  await enforceRateLimits(store, [{ rule: RATE_RULES.login, scope: 'c', identity: 'x' }])
})

test('limitation : ouverte par défaut si la base est en panne, trop lente ou absente', async () => {
  const down = { async hit() { throw new Error('connexion refusée : secret-interne') } }
  const { logs } = await quiet(() => enforceRateLimits(down, [{ rule: RATE_RULES.mutations, scope: 'coach', identity: A }]))
  assert.equal(logs.length, 1)
  assert.ok(!logs[0].includes('secret-interne'), 'aucun détail dans le journal')
  await enforceRateLimits(null, [{ rule: RATE_RULES.mutations, scope: 'coach', identity: A }])
  const slow = { hit: () => new Promise(() => {}) }
  const started = Date.now()
  await quiet(() => enforceRateLimits(slow, [{ rule: RATE_RULES.mutations, scope: 'coach', identity: A }]))
  assert.ok(Date.now() - started < 4000, 'délai maximal respecté')
  process.env.RATE_LIMIT_DISABLED = '1'
  try { await enforceRateLimits({ async hit() { return { allowed: false, retry_after: 9 } } }, [{ rule: RATE_RULES.login, scope: 'ip', identity: 'x' }]) }
  finally { delete process.env.RATE_LIMIT_DISABLED }
  // Un dépassement déjà constaté n'est pas effacé par une panne ultérieure.
  let n = 0
  const mixed = { async hit() { if (n++ === 0) return { allowed: false, retry_after: 7 }; throw new Error('panne') } }
  await quiet(() => assert.rejects(enforceRateLimits(mixed, [
    { rule: RATE_RULES.login, scope: 'ip', identity: 'x' }, { rule: RATE_RULES.login, scope: 'email', identity: 'x' },
  ]), error => error.retryAfter === 7))
})

test('crons : santé par tâche, retard, jamais exécutée, seuils du contrat', () => {
  assert.deepEqual(CRON_MAX_AGE_MINUTES, { 'push-reminders': 5, 'session-reminders': 35, maintenance: 1560 })
  const now = new Date('2026-10-15T12:00:00Z')
  const ago = minutes => new Date(now.getTime() - minutes * 60_000).toISOString()
  const ok = computeCronHealth([
    { job: 'push-reminders', last_run_at: ago(1), last_ok: true },
    { job: 'session-reminders', last_run_at: ago(34), last_ok: true },
    { job: 'maintenance', last_run_at: ago(25 * 60), last_ok: false },
  ], now)
  assert.equal(ok.healthy, true)
  assert.deepEqual(ok.jobs.map(j => [j.job, j.stale, j.last_ok, j.max_age_minutes]), [['push-reminders', false, true, 5], ['session-reminders', false, true, 35], ['maintenance', false, false, 1560]])
  const stale = computeCronHealth([
    { job: 'push-reminders', last_run_at: ago(6), last_ok: true },
    { job: 'session-reminders', last_run_at: ago(10), last_ok: true },
    { job: 'maintenance', last_run_at: ago(27 * 60), last_ok: true },
  ], now)
  assert.equal(stale.healthy, false)
  assert.deepEqual(stale.jobs.map(j => j.stale), [true, false, true])
  const never = computeCronHealth([], now)
  assert.equal(never.healthy, false)
  assert.deepEqual(never.jobs.map(j => [j.last_run_at, j.last_ok, j.stale]), [[null, null, true], [null, null, true], [null, null, true]])
  assert.equal(cronErrorLabel(new Error('SQL: mot de passe du service')), 'ECHEC_TRAITEMENT')
  assert.equal(cronErrorLabel(new Error('PUSH_NOT_CONFIGURED')), 'PUSH_NOT_CONFIGURED')
})

test('crons : le suivi ne change jamais le comportement d’une tâche, même s’il échoue', async () => {
  const run = { job: 'maintenance', startedAt: new Date() }
  const failingInsert = { from: () => ({ insert: async () => ({ error: { message: 'x' } }) }) }
  const throwing = { from: () => { throw new Error('panne') } }
  await quiet(async () => { await recordCronRun(failingInsert, { ...run, ok: true }); await recordCronRun(throwing, { ...run, ok: false }) })
  let inserted
  const recording = { from: table => ({ insert: async row => { inserted = { table, row }; return { error: null } } }) }
  await recordCronRun(recording, { ...run, ok: true, checked: 3, sent: 2, failed: 1 })
  assert.equal(inserted.table, 'cron_runs')
  assert.deepEqual([inserted.row.job, inserted.row.ok, inserted.row.checked, inserted.row.sent, inserted.row.failed, inserted.row.error], ['maintenance', true, 3, 2, 1, null])
})

test('crons : routes à authentification propre, jeton Bearer à temps constant, vercel.json', async () => {
  for (const route of ['/api/cron/maintenance', '/api/cron/health', '/api/cron/push-reminders', '/api/cron/session-reminders']) {
    assert.equal(hasOwnAuthentication(route), true, route)
    assert.equal(authRedirect(route, false), null, route)
  }
  assert.equal(hasOwnAuthentication('/auth/confirm'), true, 'le lien des e-mails ouvre sa propre session')
  assert.equal(hasOwnAuthentication('/api/cron/autre'), false)
  assert.equal(hasOwnAuthentication('/api/cron'), false)
  assert.equal(isCronAuthorized('Bearer secret-de-test', 'secret-de-test'), true)
  assert.equal(isCronAuthorized('Bearer autre-secret!', 'secret-de-test'), false)
  assert.equal(isCronAuthorized('Bearer secret-de-test', undefined), false)
  assert.equal(isCronAuthorized(null, 'secret-de-test'), false)
  for (const file of ['maintenance', 'health']) {
    const source = await readFile(new URL(`../src/app/api/cron/${file}/route.ts`, import.meta.url), 'utf8')
    assert.match(source, /isCronAuthorized\(req\.headers\.get\('authorization'\), process\.env\.CRON_SECRET\)/)
    assert.doesNotMatch(source, /rateLimit|enforceRateLimits/, 'aucune limitation sur les crons')
  }
  // Next met en cache les fetch POST (rpc) d'un gestionnaire GET : jamais de cache pour les routes qui lisent la base.
  for (const file of ['v1/[...path]', 'cron/maintenance', 'cron/health', 'cron/push-reminders', 'cron/session-reminders']) {
    const source = await readFile(new URL(`../src/app/api/${file}/route.ts`, import.meta.url), 'utf8')
    assert.match(source, /export const fetchCache = 'force-no-store'/, file)
  }
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(vercel.crons, [
    { path: '/api/cron/session-reminders', schedule: '*/15 * * * *' },
    { path: '/api/cron/push-reminders', schedule: '* * * * *' },
    { path: '/api/cron/maintenance', schedule: '0 3 * * *' },
  ])
})

test('export : nom de fichier ASCII sûr', () => {
  const now = new Date('2026-10-15T08:00:00Z')
  assert.equal(exportFileName({ prenom: 'Élodie', nom: 'N’Diaye "Test"' }, now), 'client-elodie-n-diaye-test-2026-10-15.json')
  assert.equal(exportFileName({ prenom: '!!!', nom: '???' }, now), 'client-client-2026-10-15.json')
})

test('effacement : le message de confirmation de la base est exposé en 400 français', () => {
  assert.throws(() => assertDatabaseSuccess({ code: '22023', message: 'Confirmation incorrecte : saisissez le prénom et le nom exacts du client.' }), error => error.statusCode === 400 && error.code === 'VALIDATION_ERROR' && /^Confirmation incorrecte/.test(error.message))
  assert.throws(() => assertDatabaseSuccess({ code: 'CS404', message: 'Client introuvable' }), error => error.statusCode === 404)
})

test('idempotence : empreinte indépendante de l’ordre des clés, sensible aux valeurs', () => {
  assert.equal(requestHash({ a: 1, b: { c: [1, 2], d: null } }), requestHash({ b: { d: null, c: [1, 2] }, a: 1 }))
  assert.notEqual(requestHash({ a: 1 }), requestHash({ a: 2 }))
  assert.notEqual(requestHash({ a: [1, 2] }), requestHash({ a: [2, 1] }))
  assert.equal(requestHash({ a: 1, b: undefined }), requestHash({ a: 1 }))
})

// ---------------------------------------------------------------------------
// Base PGlite avec les vrais fichiers SQL
// ---------------------------------------------------------------------------
test('migration 20261015_hardening : rejouable, RLS, limites, idempotence, rétention, effacement, valeurs proposées', async t => {
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
  const files = ['schema.sql', 'recurrences.sql', 'migrations/add_progress_metrics.sql', 'migrations/20260909_reliability.sql', 'migrations/20261012_workout_logs.sql', 'migrations/20261013_push_reminders.sql', 'migrations/20261014_agenda.sql']
  for (const file of files) await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'))
  const migration = await readFile(new URL('../supabase/migrations/20261015_hardening.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // idempotence : second passage sans erreur
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.clients, public.sessions, public.payments,
      public.progress_entries, public.coach_notes, public.session_recurrences TO authenticated;
  `)
  await db.query(`INSERT INTO auth.users (id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')`, [A, B])
  await db.query(`INSERT INTO public.clients (id,coach_id,nom,prenom,telephone,taille_cm) VALUES
    ($1,$2,'Diop','Awa','771234567',170),($3,$2,'Sy','Moussa','771234568',180),($4,$5,'Fall','Bineta','781234567',165)`, [CA, A, CA2, CB, B])
  const as = async id => { await db.exec('RESET ROLE; SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id ?? '']) }
  const asService = () => db.exec('RESET ROLE; SET ROLE service_role')
  const asAdmin = () => db.exec('RESET ROLE')
  const code = c => error => error.code === c
  const n = async sql => (await db.query(sql)).rows[0].n
  const rateStore = { async hit(key, w, max) { const { rows } = await db.query('SELECT * FROM public.rate_limit_hit($1,$2,$3)', [key, w, max]); return rows[0] } }

  await t.test('migration : rejouée deux fois, objets présents, aucune donnée existante modifiée', async () => {
    await asAdmin()
    for (const table of ['rate_limits', 'cron_runs', 'idempotency_keys', 'audit_log'])
      assert.equal(await n(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'`), 1, table)
    for (const fn of ['rate_limit_hit', 'cron_last_runs', 'idempotency_begin', 'idempotency_complete', 'idempotency_release', 'erase_client_data', 'session_title_suggestions', 'client_defaults', 'maintenance_purge'])
      assert.equal(await n(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname='public' AND p.proname='${fn}'`), 1, fn)
    assert.equal(await n('SELECT count(*)::int n FROM public.clients'), 3)
    const definers = (await db.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname='public' AND p.prosecdef AND p.proname IN ('rate_limit_hit','cron_last_runs','idempotency_begin','idempotency_complete','idempotency_release','session_title_suggestions','client_defaults','maintenance_purge','erase_client_data')`)).rows.map(r => r.proname)
    assert.deepEqual(definers, ['erase_client_data'], 'seul l’effacement est SECURITY DEFINER (écriture dans audit_log)')
  })

  await t.test('RLS : tables et fonctions de service fermées aux navigateurs, ouvertes à la clé de service', async () => {
    await asAdmin()
    for (const table of ['rate_limits', 'cron_runs', 'idempotency_keys', 'audit_log']) {
      assert.equal((await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${table}'::regclass`)).rows[0].relrowsecurity, true, table)
      assert.equal(await n(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND tablename='${table}'`), 0, `${table} : aucune politique`)
    }
    const calls = [
      "SELECT * FROM public.rate_limit_hit('k',60,5)", 'SELECT * FROM public.cron_last_runs()', `SELECT * FROM public.idempotency_begin('${A}','${KEY}','r','h')`,
      `SELECT public.idempotency_complete('${A}','${KEY}',201,'{}')`, `SELECT public.idempotency_release('${A}','${KEY}')`, 'SELECT public.maintenance_purge()',
    ]
    for (const role of ['anon', 'authenticated']) {
      await asAdmin()
      await db.exec(`SET ROLE ${role}`)
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [A])
      for (const table of ['rate_limits', 'cron_runs', 'idempotency_keys', 'audit_log']) {
        await assert.rejects(db.query(`SELECT * FROM public.${table}`), code('42501'), `${role} lit ${table}`)
        await assert.rejects(db.query(`DELETE FROM public.${table}`), code('42501'), `${role} supprime ${table}`)
      }
      await assert.rejects(db.query(`INSERT INTO public.audit_log (coach_id, action, entity) VALUES ('${A}','x','y')`), code('42501'))
      await assert.rejects(db.query(`INSERT INTO public.rate_limits (key, window_start, count) VALUES ('k', now(), 0)`), code('42501'))
      for (const sql of calls) await assert.rejects(db.query(sql), code('42501'), `${role} : ${sql}`)
    }
    await asService()
    for (const sql of ['SELECT * FROM public.cron_last_runs()', 'SELECT * FROM public.rate_limit_hit(\'ok-service\',60,5)', 'SELECT public.maintenance_purge()']) await db.query(sql)
    assert.equal(await n('SELECT count(*)::int n FROM public.audit_log'), 0)
  })

  await t.test('rate_limit_hit : incrément atomique, dépassement, retry_after, clés indépendantes, paramètres bornés', async () => {
    await asService()
    for (let i = 1; i <= 3; i++) assert.deepEqual((await db.query("SELECT * FROM public.rate_limit_hit('a',600,3)")).rows[0], { allowed: true, retry_after: 0 })
    const over = (await db.query("SELECT * FROM public.rate_limit_hit('a',600,3)")).rows[0]
    assert.equal(over.allowed, false)
    assert.ok(over.retry_after >= 1 && over.retry_after <= 600, String(over.retry_after))
    assert.equal((await db.query("SELECT * FROM public.rate_limit_hit('b',600,3)")).rows[0].allowed, true, 'autre clé')
    assert.equal(await n("SELECT count::int n FROM public.rate_limits WHERE key='a'"), 4)
    const concurrent = await Promise.all(Array.from({ length: 20 }, () => db.query("SELECT * FROM public.rate_limit_hit('c',600,5)")))
    assert.equal(concurrent.filter(r => r.rows[0].allowed).length, 5, 'exactement 5 passages sous concurrence')
    assert.equal(await n("SELECT count::int n FROM public.rate_limits WHERE key='c'"), 20)
    // Nouvelle fenêtre : un ancien compteur ne bloque plus.
    await db.query("INSERT INTO public.rate_limits (key, window_start, count) VALUES ('old', now() - interval '3 hours', 999)")
    assert.equal((await db.query("SELECT * FROM public.rate_limit_hit('old',600,5)")).rows[0].allowed, true)
    for (const args of [["''", 60, 5], ["'k'", 0, 5], ["'k'", 86401, 5], ["'k'", 60, 0], ["'k'", 60, 100001]])
      await assert.rejects(db.query(`SELECT * FROM public.rate_limit_hit(${args[0]},${args[1]},${args[2]})`), code('22023'), JSON.stringify(args))
    await assert.rejects(db.query(`SELECT * FROM public.rate_limit_hit('${'x'.repeat(201)}',60,5)`), code('22023'))
  })

  await t.test('limitation de bout en bout : 10 connexions par fenêtre, la 11e reçoit 429 avec délai', async () => {
    await asService()
    const check = [{ rule: RATE_RULES.login, scope: 'email', identity: 'jetable@example.test' }]
    for (let i = 0; i < 10; i++) await enforceRateLimits(rateStore, check)
    await assert.rejects(enforceRateLimits(rateStore, check), error => error instanceof RateLimitError && error.retryAfter >= 1 && error.retryAfter <= 600)
    await enforceRateLimits(rateStore, [{ rule: RATE_RULES.login, scope: 'email', identity: 'autre@example.test' }])
    const keys = (await db.query('SELECT key FROM public.rate_limits')).rows.map(r => r.key).join(' ')
    assert.ok(!keys.includes('jetable') && !keys.includes('example'), 'aucune adresse en clair dans rate_limits')
    // Panne de la base en cours d'usage : ouvert par défaut.
    const broken = { async hit() { return (await db.query('SELECT * FROM public.table_inexistante')).rows[0] } }
    await quiet(() => enforceRateLimits(broken, check))
  })

  await t.test('cron_runs : dernière exécution terminée par tâche', async () => {
    await asAdmin()
    await db.exec(`
      INSERT INTO public.cron_runs (job, started_at, finished_at, ok) VALUES
        ('push-reminders', now() - interval '10 minutes', now() - interval '10 minutes', true),
        ('push-reminders', now() - interval '2 minutes', now() - interval '2 minutes', false),
        ('push-reminders', now() - interval '1 minute', NULL, false),
        ('maintenance', now() - interval '3 hours', now() - interval '3 hours', true);
    `)
    await asService()
    const rows = (await db.query('SELECT * FROM public.cron_last_runs() ORDER BY job')).rows
    assert.deepEqual(rows.map(r => [r.job, r.last_ok]), [['maintenance', true], ['push-reminders', false]])
    const health = computeCronHealth(rows.map(r => ({ job: r.job, last_run_at: new Date(r.last_run_at).toISOString(), last_ok: r.last_ok })))
    assert.equal(health.healthy, false, 'session-reminders jamais exécutée')
    assert.deepEqual(health.jobs.map(j => [j.job, j.stale]), [['push-reminders', false], ['session-reminders', true], ['maintenance', false]])
    await asAdmin()
    await assert.rejects(db.query("INSERT INTO public.cron_runs (job, error) VALUES ('x', $1)", ['e'.repeat(201)]), code('23514'))
  })

  await t.test('idempotence : une seule exécution, rejeu, corps différent, requêtes simultanées, échec libère la clé', async () => {
    await asAdmin()
    const store = {
      async begin(coach, key, route, hash) {
        await asService()
        const r = (await db.query('SELECT * FROM public.idempotency_begin($1,$2,$3,$4)', [coach, key, route, hash])).rows[0]
        return { outcome: r.outcome, status: r.http_status, body: r.body }
      },
      async complete(coach, key, status, body) { await asService(); await db.query('SELECT public.idempotency_complete($1,$2,$3,$4)', [coach, key, status, JSON.stringify(body)]) },
      async release(coach, key) { await asService(); await db.query('SELECT public.idempotency_release($1,$2)', [coach, key]) },
    }
    const id = (key, body, coachId = A) => ({ coachId, key, route: 'POST workouts', hash: requestHash(body) })
    let inserted = 0
    const work = async () => { inserted++; await new Promise(r => setTimeout(r, 60)); return { status: 201, body: { logs: [{ n: inserted }], newRecords: [] } } }
    const opts = { waitMs: 3000, pollMs: 15 }

    const first = await runIdempotent(store, id(KEY, { x: 1 }), work, opts)
    assert.deepEqual([first.status, first.replayed, inserted], [201, false, 1])
    const again = await runIdempotent(store, id(KEY, { x: 1 }), work, opts)
    assert.deepEqual([again.status, again.replayed, inserted], [201, true, 1])
    assert.deepEqual(again.body, first.body, 'réponse d’origine identique')
    await assert.rejects(runIdempotent(store, id(KEY, { x: 2 }), work, opts), error => error.statusCode === 422 && error.code === 'IDEMPOTENCY_MISMATCH')
    await assert.rejects(runIdempotent(store, { ...id(KEY, { x: 1 }), route: 'POST autre' }, work, opts), error => error.code === 'IDEMPOTENCY_MISMATCH')
    assert.equal(inserted, 1)
    // Même clé pour un autre coach : indépendante.
    assert.equal((await runIdempotent(store, id(KEY, { x: 1 }, B), work, opts)).replayed, false)
    assert.equal(inserted, 2)

    // Requêtes simultanées : une seule insertion, les autres reçoivent la réponse mémorisée.
    inserted = 0
    const K2 = '44444444-4444-4444-8444-444444444444'
    const results = await Promise.all(Array.from({ length: 6 }, () => runIdempotent(store, id(K2, { y: 1 }), work, opts)))
    assert.equal(inserted, 1)
    assert.equal(results.filter(r => !r.replayed).length, 1)
    assert.ok(results.every(r => r.status === 201 && r.body.logs[0].n === 1))

    // Échec du traitement : la clé est libérée, un nouvel essai s'exécute.
    const K3 = '55555555-5555-4555-8555-555555555555'
    await assert.rejects(runIdempotent(store, id(K3, { z: 1 }), async () => { throw new Error('échec') }, opts), /échec/)
    assert.equal(await n(`SELECT count(*)::int n FROM public.idempotency_keys WHERE key='${K3}'`), 0)
    assert.equal((await runIdempotent(store, id(K3, { z: 1 }), work, opts)).replayed, false)

    // Traitement toujours en cours après le délai d'attente : 409 ; repris s'il est abandonné depuis plus de 2 minutes.
    const K4 = '66666666-6666-4666-8666-666666666666'
    await asAdmin()
    await db.query(`INSERT INTO public.idempotency_keys (coach_id, key, route, request_hash) VALUES ($1,$2,'POST workouts',$3)`, [A, K4, requestHash({ w: 1 })])
    await assert.rejects(runIdempotent(store, id(K4, { w: 1 }), work, { waitMs: 60, pollMs: 20 }), error => error.statusCode === 409 && error.code === 'IDEMPOTENCY_IN_PROGRESS')
    await db.query("UPDATE public.idempotency_keys SET created_at = now() - interval '3 minutes' WHERE key = $1", [K4])
    assert.equal((await runIdempotent(store, id(K4, { w: 1 }), work, opts)).replayed, false)
    // idempotency_complete ne remplace jamais une réponse déjà mémorisée.
    await asService()
    await db.query('SELECT public.idempotency_complete($1,$2,500,$3)', [A, KEY, JSON.stringify({ ecrase: true })])
    assert.equal((await db.query('SELECT status FROM public.idempotency_keys WHERE coach_id=$1 AND key=$2', [A, KEY])).rows[0].status, 201)
    await db.query('SELECT public.idempotency_release($1,$2)', [A, KEY])
    assert.equal(await n(`SELECT count(*)::int n FROM public.idempotency_keys WHERE key='${KEY}' AND coach_id='${A}'`), 1, 'release ne supprime pas une réponse mémorisée')
  })

  await t.test('maintenance : seules les données techniques anciennes sont supprimées', async () => {
    await asAdmin()
    await db.exec('TRUNCATE public.rate_limits, public.cron_runs, public.idempotency_keys')
    const S_OLD = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', S_NEW = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02', S_FUT = 'cccccccc-cccc-4ccc-8ccc-cccccccccc03', S_RECENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccc04'
    await db.query(`INSERT INTO public.sessions (id,coach_id,client_id,titre,date_heure,duree_minutes) VALUES
      ($1,$5,$6,'Vieille', now() - interval '40 days', 60), ($2,$5,$6,'Récente', now() - interval '10 days', 60),
      ($3,$5,$6,'Future', now() + interval '2 days', 60), ($4,$5,$6,'Limite', now() - interval '29 days', 60)`, [S_OLD, S_NEW, S_FUT, S_RECENT, A, CA])
    for (const s of [S_OLD, S_NEW, S_FUT, S_RECENT]) await db.query('INSERT INTO public.push_sent (session_id, offset_min, coach_id) VALUES ($1,30,$2)', [s, A])
    await db.exec(`
      INSERT INTO public.rum_events (coach_id, name, created_at) VALUES ('${A}','vieux', now() - interval '91 days'), ('${A}','recent', now() - interval '89 days'), ('${A}','neuf', now());
      INSERT INTO public.rate_limits (key, window_start, count) VALUES ('vieux', now() - interval '3 days', 1), ('recent', now() - interval '47 hours', 1), ('neuf', now(), 1);
      INSERT INTO public.idempotency_keys (coach_id, key, route, request_hash, created_at) VALUES
        ('${A}','77777777-7777-4777-8777-777777777771','r','h', now() - interval '8 days'), ('${A}','77777777-7777-4777-8777-777777777772','r','h', now() - interval '6 days');
      INSERT INTO public.cron_runs (job, started_at, finished_at, ok) VALUES ('maintenance', now() - interval '31 days', now() - interval '31 days', true), ('maintenance', now() - interval '29 days', now() - interval '29 days', true);
    `)
    const before = { clients: await n('SELECT count(*)::int n FROM public.clients'), sessions: await n('SELECT count(*)::int n FROM public.sessions') }
    await asService()
    const purged = (await db.query('SELECT public.maintenance_purge() r')).rows[0].r
    assert.deepEqual(purged, { rum_events: 1, rate_limits: 1, idempotency_keys: 1, cron_runs: 1, push_sent: 1 })
    await asAdmin()
    assert.deepEqual((await db.query('SELECT name FROM public.rum_events ORDER BY name')).rows.map(r => r.name), ['neuf', 'recent'])
    assert.deepEqual((await db.query('SELECT key FROM public.rate_limits ORDER BY key')).rows.map(r => r.key), ['neuf', 'recent'])
    assert.equal(await n('SELECT count(*)::int n FROM public.idempotency_keys'), 1)
    assert.equal(await n('SELECT count(*)::int n FROM public.cron_runs'), 1)
    assert.deepEqual((await db.query('SELECT session_id FROM public.push_sent ORDER BY session_id')).rows.map(r => r.session_id), [S_NEW, S_FUT, S_RECENT])
    assert.deepEqual([await n('SELECT count(*)::int n FROM public.clients'), await n('SELECT count(*)::int n FROM public.sessions')], [before.clients, before.sessions], 'aucune donnée métier supprimée')
    // Rien de récent n'est supprimé au second passage.
    await asService()
    assert.deepEqual((await db.query('SELECT public.maintenance_purge() r')).rows[0].r, { rum_events: 0, rate_limits: 0, idempotency_keys: 0, cron_runs: 0, push_sent: 0 })
    await asAdmin()
    await db.query('DELETE FROM public.sessions WHERE id = ANY($1)', [[S_OLD, S_NEW, S_FUT, S_RECENT]])
    await db.exec('TRUNCATE public.rum_events, public.rate_limits, public.cron_runs, public.idempotency_keys')
  })

  await t.test('session_title_suggestions : fréquence, bornes, isolation entre coachs', async () => {
    await asAdmin()
    const ins = (coach, client, titre, day) => db.query(`INSERT INTO public.sessions (coach_id,client_id,titre,date_heure) VALUES ($1,$2,$3, '2026-03-01'::timestamptz + ($4 || ' days')::interval)`, [coach, client, titre, String(day)])
    let day = 0
    for (const titre of ['Haut du corps', 'Haut du corps', 'Haut du corps', 'Cardio', 'Cardio', 'Jambes']) await ins(A, CA, titre, day++)
    await ins(B, CB, 'Secret du coach B', day++); await ins(B, CB, 'Secret du coach B', day++); await ins(B, CB, 'Secret du coach B', day++); await ins(B, CB, 'Secret du coach B', day++)
    await as(A)
    const titles = async limit => (await db.query('SELECT titre FROM public.session_title_suggestions($1)', [limit])).rows.map(r => r.titre)
    assert.deepEqual(await titles(20), ['Haut du corps', 'Cardio', 'Jambes'])
    assert.deepEqual(await titles(2), ['Haut du corps', 'Cardio'])
    assert.deepEqual(await titles(1), ['Haut du corps'])
    assert.equal((await db.query('SELECT titre FROM public.session_title_suggestions()')).rows.length, 3, 'valeur par défaut 20')
    for (const bad of [0, 51, -1, null]) await assert.rejects(titles(bad), code('22023'), String(bad))
    await as(B)
    assert.deepEqual(await titles(50), ['Secret du coach B'])
    await as(null)
    await assert.rejects(titles(5), code('42501'))
    await asAdmin()
    await db.query('DELETE FROM public.sessions WHERE coach_id IN ($1,$2)', [A, B])
  })

  await t.test('client_defaults : dernières valeurs du client, null sans historique, isolation', async () => {
    await asAdmin()
    await db.query(`INSERT INTO public.payments (coach_id,client_id,montant,methode,statut,date_paiement) VALUES
      ($1,$2,15000,'WAVE','PAYE','2026-09-01'), ($1,$2,20000,'ORANGE_MONEY','EN_ATTENTE','2026-10-01'), ($1,$2,99000,'ESPECES','ANNULE','2026-10-10'),
      ($1,$3,5000,'ESPECES','PAYE','2026-10-05'), ($4,$5,77000,'WAVE','PAYE','2026-10-06')`, [A, CA, CA2, B, CB])
    await db.query(`INSERT INTO public.progress_entries (coach_id,client_id,poids_kg,mesure_date,masse_grasse_pct,bras_cm) VALUES
      ($1,$2,72.5,'2026-08-01',20,30), ($1,$2,70.5,'2026-10-02',18.5,31.5), ($1,$3,90,'2026-10-02',NULL,NULL)`, [A, CA, CA2])
    await db.query(`INSERT INTO public.sessions (coach_id,client_id,titre,date_heure,duree_minutes,statut) VALUES
      ($1,$2,'Ancienne','2026-01-10 08:00+00',45,'EFFECTUEE'), ($1,$2,'Dernière passée','2026-02-10 08:00+00',75,'EFFECTUEE'),
      ($1,$2,'Annulée récente','2026-03-10 08:00+00',30,'ANNULEE'), ($1,$2,'Future','2099-01-01 08:00+00',60,'PLANIFIEE')`, [A, CA])
    await as(A)
    const defaults = async id => (await db.query('SELECT public.client_defaults($1) d', [id])).rows[0].d
    const d = await defaults(CA)
    assert.deepEqual(d.last_payment, { montant: 20000, methode: 'ORANGE_MONEY', statut: 'EN_ATTENTE', date_paiement: '2026-10-01' }, 'paiement annulé ignoré')
    assert.deepEqual(d.last_session, { titre: 'Dernière passée', duree_minutes: 75, date_heure: d.last_session.date_heure })
    assert.equal(new Date(d.last_session.date_heure).toISOString(), '2026-02-10T08:00:00.000Z')
    assert.equal(d.last_progress.mesure_date, '2026-10-02')
    assert.equal(d.last_progress.poids_kg, 70.5)
    assert.equal(d.last_progress.masse_grasse_pct, 18.5)
    assert.equal(d.last_progress.bras_cm, 31.5)
    assert.ok('frequence_cardiaque_repos_bpm' in d.last_progress && 'cuisse_cm' in d.last_progress)
    assert.ok(!JSON.stringify(d).includes('notes'))
    const d2 = await defaults(CA2)
    assert.equal(d2.last_payment.montant, 5000)
    assert.equal(d2.last_session, null)
    // Sans séance passée : la dernière créée.
    await asAdmin()
    await db.query(`INSERT INTO public.sessions (coach_id,client_id,titre,date_heure,duree_minutes) VALUES ($1,$2,'Première planifiée','2099-02-01 08:00+00',50)`, [A, CA2])
    await as(A)
    assert.equal((await defaults(CA2)).last_session.titre, 'Première planifiée')
    // Client d'un autre coach : introuvable ; client sans aucune donnée : trois null.
    await assert.rejects(defaults(CB), code('CS404'))
    await asAdmin()
    const empty = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    await db.query("INSERT INTO public.clients (id,coach_id,nom,prenom,telephone) VALUES ($1,$2,'Vide','Nouveau','771111111')", [empty, A])
    await as(A)
    assert.deepEqual(await defaults(empty), { last_payment: null, last_session: null, last_progress: null })
    await as(B)
    await assert.rejects(defaults(CA), code('CS404'))
    await as(null)
    await assert.rejects(defaults(CA), code('42501'))
    await asAdmin()
    await db.query('DELETE FROM public.clients WHERE id = $1', [empty])
    await db.query('DELETE FROM public.sessions WHERE coach_id IN ($1,$2)', [A, B])
    await db.query('DELETE FROM public.payments WHERE coach_id IN ($1,$2)', [A, B])
    await db.query('DELETE FROM public.progress_entries WHERE coach_id IN ($1,$2)', [A, B])
  })

  await t.test('erase_client_data : compteurs, confirmation, autre coach, atomicité, audit sans donnée personnelle', async () => {
    await asAdmin()
    const EX = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', EXB = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
    const REC = 'ffffffff-ffff-4fff-8fff-ffffffffff01', RECB = 'ffffffff-ffff-4fff-8fff-ffffffffff02'
    const seed = async (coach, client, ex, rec, base) => {
      await db.query(`INSERT INTO public.exercises (id,coach_id,nom) VALUES ($1,$2,'Squat ${base}')`, [ex, coach])
      await db.query(`INSERT INTO public.session_recurrences (id,coach_id,client_id,titre,duree_minutes,heure,jours,date_debut) VALUES ($1,$2,$3,'Série',60,'09:00','{1,3}','2026-10-01')`, [rec, coach, client])
      await db.query(`INSERT INTO public.session_recurrence_exceptions (recurrence_id,coach_id,occurrence_date,kind) VALUES ($1,$2,'2026-10-05','ANNULEE')`, [rec, coach])
      const ids = []
      for (const [i, statut] of ['PLANIFIEE', 'EFFECTUEE', 'EFFECTUEE'].entries()) {
        const r = await db.query(`INSERT INTO public.sessions (coach_id,client_id,titre,date_heure,statut,recurrence_id,occurrence_date) VALUES ($1,$2,'Séance',$3::timestamptz,$4::session_status,$5,$6) RETURNING id`,
          [coach, client, `2026-0${base}-0${i + 1} 08:00+00`, statut, i === 2 ? rec : null, i === 2 ? '2026-10-12' : null])
        ids.push(r.rows[0].id)
      }
      await db.query('INSERT INTO public.session_reminders (session_id, scheduled_for) VALUES ($1, now())', [ids[0]])
      await db.query('INSERT INTO public.push_sent (session_id, offset_min, coach_id) VALUES ($1,30,$2)', [ids[0], coach])
      await db.query(`INSERT INTO public.payments (coach_id,client_id,montant,methode) VALUES ($1,$2,10000,'WAVE'),($1,$2,25000,'ESPECES')`, [coach, client])
      await db.query(`INSERT INTO public.progress_entries (coach_id,client_id,poids_kg) VALUES ($1,$2,70)`, [coach, client])
      await db.query(`INSERT INTO public.coach_notes (coach_id,client_id,contenu) VALUES ($1,$2,'Note confidentielle')`, [coach, client])
      await db.query(`INSERT INTO public.workout_logs (coach_id,client_id,exercice_id,log_date,serie_numero,reps,charge_kg) VALUES ($1,$2,$3,'2026-10-01',1,5,100),($1,$2,$3,'2026-10-01',2,5,100)`, [coach, client, ex])
    }
    await seed(A, CA, EX, REC, 5)
    await seed(A, CA2, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 'ffffffff-ffff-4fff-8fff-ffffffffff03', 6)
    await seed(B, CB, EXB, RECB, 7)
    const tables = ['sessions', 'payments', 'progress_entries', 'workout_logs', 'session_recurrences', 'session_recurrence_exceptions', 'coach_notes', 'session_reminders', 'push_sent', 'clients']
    const snapshot = async () => {
      await asAdmin()
      const out = {}
      for (const table of tables) out[table] = await n(`SELECT count(*)::int n FROM public.${table}`)
      return out
    }
    const forClient = async client => {
      await asAdmin()
      const sql = {
        sessions: `SELECT count(*)::int n FROM public.sessions WHERE client_id='${client}'`,
        payments: `SELECT count(*)::int n FROM public.payments WHERE client_id='${client}'`,
        progress: `SELECT count(*)::int n FROM public.progress_entries WHERE client_id='${client}'`,
        workouts: `SELECT count(*)::int n FROM public.workout_logs WHERE client_id='${client}'`,
        recurrences: `SELECT count(*)::int n FROM public.session_recurrences WHERE client_id='${client}'`,
        notes: `SELECT count(*)::int n FROM public.coach_notes WHERE client_id='${client}'`,
        client: `SELECT count(*)::int n FROM public.clients WHERE id='${client}'`,
      }
      const out = {}
      for (const [k, q] of Object.entries(sql)) out[k] = await n(q)
      return out
    }
    const full = { sessions: 3, payments: 2, progress: 1, workouts: 2, recurrences: 1, notes: 1, client: 1 }
    assert.deepEqual(await forClient(CA), full)
    const erase = (id, confirmation) => db.query('SELECT public.erase_client_data($1,$2) r', [id, confirmation]).then(r => r.rows[0].r)

    // Confirmation fausse, vide ou absente : 400 et rien n'est supprimé.
    await as(A)
    const baseline = await snapshot()
    await as(A)
    for (const bad of ['Awa', 'Diop Awa', 'Awa Diopp', '', '   ', null, 'Moussa Sy'])
      await assert.rejects(erase(CA, bad), error => error.code === '22023' && /^Confirmation incorrecte/.test(error.message), String(bad))
    assert.deepEqual(await snapshot(), baseline)
    // Client d'un autre coach (confirmation correcte comprise) : 404, rien supprimé.
    await as(B)
    await assert.rejects(erase(CA, 'Awa Diop'), code('CS404'))
    await assert.rejects(erase(CA, 'mauvais'), code('CS404'), 'l’existence du client n’est pas révélée')
    await assert.rejects(erase('99999999-9999-4999-8999-999999999999', 'x'), code('CS404'))
    await as(null)
    await assert.rejects(erase(CA, 'Awa Diop'), code('42501'))
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(erase(CA, 'Awa Diop'), code('42501'))
    assert.deepEqual(await snapshot(), baseline)

    // Atomicité : une panne en cours de route annule toutes les suppressions précédentes.
    await asAdmin()
    await db.exec(`
      CREATE FUNCTION public.test_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'panne simulée' USING ERRCODE = 'P0001'; END $$;
      CREATE TRIGGER test_boom BEFORE DELETE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.test_boom();
    `)
    await as(A)
    await assert.rejects(erase(CA, 'Awa Diop'), error => error.code === 'P0001')
    assert.deepEqual(await snapshot(), baseline, 'rien n’a été supprimé (paiements, mesures, séries, notes conservés)')
    await asAdmin()
    await db.exec('DROP TRIGGER test_boom ON public.sessions; DROP FUNCTION public.test_boom();')
    assert.equal(await n('SELECT count(*)::int n FROM public.audit_log'), 0)

    // Effacement réel : confirmation insensible à la casse et aux espaces superflus ; séances effectuées comprises.
    await as(A)
    const counts = await erase(CA, '  aWA    dioP  ')
    assert.deepEqual(counts, { sessions: 3, payments: 2, progress: 1, workouts: 2, recurrences: 1, recurrence_exceptions: 1, reminders: 2, notes: 1, client: 1 })
    assert.deepEqual(await forClient(CA), { sessions: 0, payments: 0, progress: 0, workouts: 0, recurrences: 0, notes: 0, client: 0 })
    await asAdmin()
    assert.equal(await n(`SELECT count(*)::int n FROM public.session_recurrence_exceptions WHERE recurrence_id='${REC}'`), 0)
    assert.equal(await n(`SELECT count(*)::int n FROM public.sessions WHERE statut = 'EFFECTUEE' AND client_id = '${CA}'`), 0)
    // Les autres clients du même coach et ceux de l'autre coach sont intacts.
    assert.deepEqual(await forClient(CA2), full)
    assert.deepEqual(await forClient(CB), full)
    assert.equal(await n(`SELECT count(*)::int n FROM public.session_reminders`), 2)
    assert.equal(await n(`SELECT count(*)::int n FROM public.push_sent`), 2)
    assert.equal(await n(`SELECT count(*)::int n FROM public.exercises`), 3, 'les exercices du coach sont conservés')

    // Second effacement du même client : introuvable.
    await as(A)
    await assert.rejects(erase(CA, 'Awa Diop'), code('CS404'))

    // Trace d'audit : identifiants et compteurs seulement, aucune donnée personnelle.
    await asAdmin()
    const audit = (await db.query('SELECT * FROM public.audit_log')).rows
    assert.equal(audit.length, 1)
    assert.deepEqual([audit[0].coach_id, audit[0].action, audit[0].entity, audit[0].entity_id], [A, 'client.erase', 'client', CA])
    assert.deepEqual(audit[0].counts, counts)
    assert.ok(audit[0].created_at)
    const text = JSON.stringify(audit)
    for (const secret of ['Awa', 'Diop', '771234567', 'confidentielle']) assert.ok(!text.includes(secret), secret)
    await as(A)
    await assert.rejects(db.query('SELECT * FROM public.audit_log'), code('42501'), 'le coach ne lit pas le journal')

    // Le coach B efface son client : pas d'effet sur A.
    await as(B)
    await erase(CB, 'bineta fall')
    assert.deepEqual(await forClient(CA2), full)
    await asAdmin()
    assert.equal(await n('SELECT count(*)::int n FROM public.audit_log'), 2)
  })
})
