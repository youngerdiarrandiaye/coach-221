import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { MIGRATIONS } from '../scripts/migrations-list.mjs'

// Le script réel (scripts/migrate-production.mjs) parle à un faux service /pg/query (postgres-meta derrière Kong)
// adossé à PGlite avec une infrastructure Supabase minimale. Les vrais fichiers SQL sont appliqués.
const KEY = 'cle-de-service-de-test'
const script = fileURLToPath(new URL('../scripts/migrate-production.mjs', import.meta.url))
const supabaseDir = fileURLToPath(new URL('../supabase/', import.meta.url))

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
  return db
}

async function fakeSupabase(t, db) {
  const calls = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (req.url !== '/pg/query' || req.method !== 'POST') return send(404, { message: 'introuvable' })
    if (req.headers.apikey !== KEY) return send(401, { message: 'No API key found in request' })
    const { query } = JSON.parse(Buffer.concat(chunks).toString())
    calls.push(query)
    try {
      const results = await db.exec(query)
      send(200, results.at(-1)?.rows ?? [])
    } catch (error) { send(400, { error: error.message }) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  return { url: `http://127.0.0.1:${server.address().port}`, calls }
}

function run(url, extra = {}, args = []) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: KEY, ...extra } })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', code => resolve({ code, out }))
  })
}

const ledger = db => db.query('select name from public.schema_migrations order by name').then(r => r.rows.map(x => x.name))

test('migration automatique : première application, relance sans effet, sans écriture en essai à blanc', async t => {
  const db = await newDatabase(t)
  const { url, calls } = await fakeSupabase(t, db)

  const dry = await run(url, {}, ['--dry-run'])
  assert.equal(dry.code, 0, dry.out)
  assert.match(dry.out, new RegExp(`0 déjà appliquée\\(s\\), ${MIGRATIONS.length} à appliquer`))
  assert.equal((await db.query("select to_regclass('public.schema_migrations') is not null as l")).rows[0].l, false, "l'essai à blanc ne crée rien")

  const first = await run(url)
  assert.equal(first.code, 0, first.out)
  assert.deepEqual((await ledger(db)).sort(), [...MIGRATIONS].sort())
  assert.equal((await db.query("select count(*)::int as n from storage.buckets where id = 'avatars'")).rows[0].n, 1, 'le seau avatars existe')
  assert.equal((await db.query("select to_regclass('public.clients') is not null as t")).rows[0].t, true)

  calls.length = 0
  const again = await run(url)
  assert.equal(again.code, 0, again.out)
  assert.match(again.out, new RegExp(`${MIGRATIONS.length} déjà appliquée\\(s\\), 0 à appliquer`))
  assert.ok(!calls.some(sql => /create table (if not exists )?public\.clients/i.test(sql)), 'rien n’est rejoué')
})

test('migration automatique : une base déjà remplie sans registre est refusée, puis enregistrée avec MIGRATE_BASELINE', async t => {
  const db = await newDatabase(t)
  for (const file of MIGRATIONS) await db.exec(await readFile(join(supabaseDir, file), 'utf8'))   // SQL joué à la main
  const { url } = await fakeSupabase(t, db)

  const refused = await run(url)
  assert.equal(refused.code, 1)
  assert.match(refused.out, /aucun registre de migrations/)

  const baseline = await run(url, { MIGRATE_BASELINE: '1' })
  assert.equal(baseline.code, 0, baseline.out)
  assert.deepEqual((await ledger(db)).sort(), [...MIGRATIONS].sort())
  assert.match(baseline.out, /baseline/)
})

test('migration automatique : un fichier en échec arrête tout, ne laisse rien d’inscrit pour lui, et le suivant n’est pas lancé', async t => {
  const db = await newDatabase(t)
  const { url } = await fakeSupabase(t, db)
  const dir = await mkdtemp(join(tmpdir(), 'coachsen-sql-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await cp(supabaseDir, dir, { recursive: true })
  const broken = 'migrations/20260909_reliability.sql'
  await writeFile(join(dir, broken), 'create table public.cassee (id int);\nselect oups_cette_fonction_nexiste_pas();\n')

  const failed = await run(url, { MIGRATE_SQL_DIR: dir })
  assert.equal(failed.code, 1)
  assert.match(failed.out, /ÉCHEC sur migrations\/20260909_reliability\.sql/)
  const done = await ledger(db)
  assert.ok(done.includes('schema.sql') && done.includes('recurrences.sql'), 'les fichiers précédents sont inscrits')
  assert.ok(!done.includes(broken) && !done.includes('migrations/20261012_workout_logs.sql'), 'ni le fichier fautif ni les suivants')
  assert.equal((await db.query("select to_regclass('public.cassee') is not null as t")).rows[0].t, false, 'pas de demi-application')
})

test('migration automatique : mauvaise clé refusée, variables manquantes signalées', async t => {
  const db = await newDatabase(t)
  const { url } = await fakeSupabase(t, db)
  const wrong = await run(url, { SUPABASE_SERVICE_ROLE_KEY: 'mauvaise' })
  assert.equal(wrong.code, 1)
  assert.match(wrong.out, /401/)
  const missing = await run('', { SUPABASE_SERVICE_ROLE_KEY: '' })
  assert.equal(missing.code, 1)
  assert.match(missing.out, /requis/)
})
