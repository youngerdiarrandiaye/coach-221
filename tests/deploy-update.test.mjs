import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { updatePayload, validVersion } from '../src/lib/pushReminders.ts'
import { hasOwnAuthentication } from '../src/lib/authRoutes.ts'
import { handleDeployHook } from '../src/server/deployHook.ts'

const SECRET = 'secret-de-test-assez-long'
const sub = n => ({ id: String(n).padStart(8, '0') + '-0000-4000-8000-000000000000', endpoint: 'https://push.example/' + n, p256dh: 'p', auth: 'a', failures: 0 })
const deps = (over = {}) => {
  const sent = []; const removed = []; const marked = []
  const all = over.subs ?? [sub(1), sub(2), sub(3)]
  return {
    sent, removed, marked,
    deps: {
      secret: SECRET, configured: true,
      send: async (s, payload) => { if (over.failWith && s.endpoint.endsWith('/2')) throw Object.assign(new Error('gone'), { statusCode: over.failWith }); sent.push([s.endpoint, payload]) },
      store: () => ({ remove: async s => { removed.push(s.id) }, markSuccess: async s => { marked.push(s.id) }, markFailure: async () => false }),
      page: async (after, limit) => all.filter(x => x.id > after).slice(0, limit),
      ...over.deps,
    },
  }
}
const call = (d, headers = {}, body = '{"version":"abc1234"}') =>
  handleDeployHook(new Request('http://localhost/api/deploy-hook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }), d)
const AUTH = { Authorization: 'Bearer ' + SECRET }

test('annonce de mise à jour : charge utile et version acceptée', () => {
  const p = updatePayload('d88a008')
  assert.equal(p.kind, 'update'); assert.equal(p.version, 'd88a008'); assert.equal(p.tag, 'coachsen-update'); assert.equal(p.url, '/dashboard')
  for (const ok of ['d88a008', 'a'.repeat(40), 'v1.2.3', '2026-10-19_1']) assert.equal(validVersion(ok), true, ok)
  for (const bad of ['', 'a'.repeat(41), 'x y', '<b>', '../x', 'a;b', 42, null, undefined]) assert.equal(validVersion(bad), false, String(bad))
})

test('le webhook est accessible sans session : il a sa propre authentification', () => {
  assert.equal(hasOwnAuthentication('/api/deploy-hook'), true)
  assert.equal(hasOwnAuthentication('/api/deploy-hook/autre'), false)
})

test('webhook : refus sans jeton, avec un mauvais jeton, et désactivé sans secret configuré', async () => {
  const { deps: d } = deps()
  assert.equal((await call(d)).status, 401)
  assert.equal((await call(d, { Authorization: 'Bearer mauvais' })).status, 401)
  assert.equal((await call(d, { Authorization: 'Basic ' + SECRET })).status, 401)
  assert.equal((await call({ ...d, secret: undefined }, { Authorization: 'Bearer quelconque' })).status, 401)
  assert.equal((await call({ ...d, secret: '' }, { Authorization: 'Bearer ' })).status, 401)
})

test('webhook : 503 sans configuration push, 400 pour une version invalide, avant tout envoi', async () => {
  const t = deps()
  assert.equal((await call({ ...t.deps, configured: false }, AUTH)).status, 503)
  for (const body of ['{"version":"<script>"}', '{}', 'pas du json', '{"version":42}']) assert.equal((await call(t.deps, AUTH, body)).status, 400, body)
  assert.equal(t.sent.length, 0)
})

test('webhook : annonce la version à tous les abonnements, par pages, et retire les abonnements disparus', async () => {
  const t = deps({ subs: Array.from({ length: 1203 }, (_, i) => sub(i + 1)), failWith: 410 })
  const res = await call(t.deps, AUTH)
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).data, { sent: 1202, failed: 1, removed: 1 })
  assert.equal(t.sent.length, 1202)
  const payload = t.sent[0][1]
  assert.equal(payload.kind, 'update'); assert.equal(payload.version, 'abc1234'); assert.equal(payload.tag, 'coachsen-update')
  assert.deepEqual(t.removed, [sub(2).id])
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('webhook : une panne de lecture des abonnements répond 500 sans détail', async () => {
  const t = deps({ deps: { page: async () => { throw new Error('postgres://secret@hote/db') } } })
  const res = await call(t.deps, AUTH)
  assert.equal(res.status, 500)
  assert.doesNotMatch(await res.text(), /postgres|secret/)
})

test('service worker et image web : la version est injectée à chaque construction', async () => {
  const sw = await readFile(new URL('../frontend/src/pwa/sw.js', import.meta.url), 'utf8')
  assert.match(sw, /const BUILD = '__BUILD__'/)
  assert.match(sw, /'coachsen-shell-' \+ BUILD/)
  assert.match(sw, /data\.kind === 'update'/)
  const docker = await readFile(new URL('../deploy/web.Dockerfile', import.meta.url), 'utf8')
  assert.match(docker, /ARG APP_VERSION/)
  assert.match(docker, /sw\.js/); assert.match(docker, /version\.json/)
  const deploy = await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  assert.match(deploy, /APP_VERSION=\$\{\{ github\.sha \}\}/)
  assert.match(deploy, /\/api\/deploy-hook/)
})
