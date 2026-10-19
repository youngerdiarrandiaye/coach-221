import test from 'node:test'
import assert from 'node:assert/strict'
import { hardenSessionCookie, secureCookies } from '../src/lib/sessionCookie.ts'

test('cookie de session : httpOnly et SameSite lax toujours imposés, les autres options conservées', () => {
  const out = hardenSessionCookie({ path: '/', maxAge: 400, httpOnly: false, sameSite: 'none' }, { NODE_ENV: 'development' })
  assert.equal(out.httpOnly, true)
  assert.equal(out.sameSite, 'lax')
  assert.equal(out.path, '/')
  assert.equal(out.maxAge, 400)
  assert.deepEqual(hardenSessionCookie(undefined, { NODE_ENV: 'development' }), { httpOnly: true, sameSite: 'lax', secure: false })
})

test('cookie de session : Secure seulement en production sur HTTPS', () => {
  assert.equal(secureCookies({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://coachsen.example.test' }), true)
  assert.equal(secureCookies({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://coachsen.example.test' }), true)
  assert.equal(secureCookies({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'http://127.0.0.1:4200' }), false)
  assert.equal(secureCookies({ NODE_ENV: 'development', FRONTEND_ORIGIN: 'https://coachsen.example.test' }), false)
})
