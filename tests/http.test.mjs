import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { validateMutation, readJson, readMultipart, success, failure, found, uuid, HttpError } from '../src/server/http.ts'

const origin = 'https://coach.example.test'
function mutation(headers = {}, body = '{}') {
  return new Request(origin + '/api/v1/clients', {
    method: 'POST', body,
    headers: { origin, 'content-type': 'application/json', 'x-coachsen-client': 'angular', ...headers },
  })
}
const status = expected => error => error.statusCode === expected

test('API : formulaire multipart valide et erreurs de protocole avatar', async () => {
  const form = new FormData()
  form.set('avatar', new File([new Uint8Array([255, 216, 255])], 'avatar.jpg', { type: 'image/jpeg' }))
  const parsed = await readMultipart(new Request(origin + '/api/v1/profile/avatar', { method: 'POST', body: form }))
  assert.equal(parsed.get('avatar').name, 'avatar.jpg')
  assert.equal(parsed.get('avatar').size, 3)
  await assert.rejects(readMultipart(mutation()), status(415))
  for (const type of ['multipart/form-data', 'multipart/form-data; boundary=missing']) {
    await assert.rejects(readMultipart(mutation({ 'content-type': type }, 'invalid multipart')), error =>
      error.statusCode === 400 && error.code === 'INVALID_FORM_DATA')
  }
})

test('API : mutations protégées contre les origines étrangères et les formulaires simples', () => {
  assert.doesNotThrow(() => validateMutation(mutation()))
  assert.doesNotThrow(() => validateMutation(mutation({ origin: 'http://localhost:4200' }), 'http://localhost:4200'))
  assert.doesNotThrow(() => validateMutation(new Request(origin + '/api/v1/clients')))
  for (const headers of [
    { origin: 'https://attacker.example' }, { origin: '' }, { origin: 'null' },
    { 'x-coachsen-client': '' }, { 'x-coachsen-client': 'wrong' },
    { origin: 'not a URL', host: 'coach.example.test' },
    { origin: 'http://coach.example.test', host: 'coach.example.test' },
    { origin: origin + '/path', host: 'coach.example.test' },
  ]) assert.throws(() => validateMutation(mutation(headers)), status(403))
})

test('API : JSON strict, taille en octets et erreurs de protocole', async () => {
  assert.deepEqual(await readJson(mutation({}, '{"nom":"Diop"}')), { nom: 'Diop' })
  assert.deepEqual(await readJson(mutation({ 'content-type': 'application/json; charset=utf-8' })), {})
  for (const type of ['text/plain', 'application/jsonp', ''])
    await assert.rejects(readJson(mutation({ 'content-type': type })), status(415))
  await assert.rejects(readJson(mutation({}, '{')), status(400))
  await assert.rejects(readJson(mutation({}, JSON.stringify('é'.repeat(32768)))), status(413))
})

test('API : réponses sans cache et aucune fuite de détail interne', async () => {
  const ok = success({ id: 'client' }, 201)
  assert.equal(ok.status, 201)
  assert.match(ok.headers.get('cache-control'), /no-store/)
  assert.deepEqual(await ok.json(), { data: { id: 'client' } })
  const unknown = failure(new Error('postgres password=DO_NOT_EXPOSE'))
  assert.equal(unknown.status, 500)
  assert.doesNotMatch(await unknown.text(), /postgres|DO_NOT_EXPOSE/)
  const auth = failure(new HttpError(401, 'UNAUTHENTICATED', 'Connexion requise.'))
  assert.equal(auth.status, 401)
  assert.equal((await auth.json()).error.code, 'UNAUTHENTICATED')
  const invalid = z.string().safeParse(42)
  assert.equal(failure(invalid.error).status, 400)
})

test('API : identifiant invalide et ressource absente ne deviennent pas des succès', () => {
  assert.throws(() => found(null), status(404))
  assert.deepEqual(found([]), [])
  assert.throws(() => uuid('../another-coach'))
  assert.equal(uuid('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111')
})
