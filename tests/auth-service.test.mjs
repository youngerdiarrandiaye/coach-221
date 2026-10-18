import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Isolate the DAO so these tests never contact Supabase or send email.
const daoUrl = 'data:text/javascript,export const authDao = {}'
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/dao/authDao') return { url: daoUrl, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
const { authDao } = await import(daoUrl)
const { authService } = await import('../src/services/authService.ts')
const { AppError } = await import('../src/exception/AppError.ts')

test('auth : les pannes réseau et serveur donnent une indisponibilité 503', async () => {
  const operations = [
    ['signIn', () => authService.login('coach@example.test', 'password')],
    ['signUp', () => authService.register('coach@example.test', 'password', { nom: 'Test', prenom: 'Coach' })],
    ['resendConfirmation', () => authService.resendConfirmation('coach@example.test')],
    ['resetPasswordForEmail', () => authService.sendResetEmail('coach@example.test')],
    ['signOut', () => authService.logout()],
  ]
  for (const [method, call] of operations) {
    for (const error of [
      { message: 'fetch failed', status: 0, name: 'AuthRetryableFetchError' },
      { message: 'fetch failed', name: 'AuthRetryableFetchError' },
      { message: 'upstream failure', status: 503 },
    ]) {
      authDao[method] = async () => ({ data: null, error })
      await assert.rejects(call, (failure) => {
        assert.ok(failure instanceof AppError)
        assert.equal(failure.statusCode, 503)
        assert.equal(failure.code, 'AUTH_SERVICE_UNAVAILABLE')
        assert.match(failure.message, /temporairement indisponible/)
        assert.doesNotMatch(failure.message, /fetch|upstream/)
        return true
      })
    }
  }
})

test('auth : les erreurs de saisie gardent leur message et le statut 400', async () => {
  for (const [message, expected] of [
    ['Invalid login credentials', 'Email ou mot de passe incorrect'],
    ['User already registered', 'Un compte existe déjà avec cet email'],
    ['Password should be at least 6 characters', 'Le mot de passe est trop court : utilisez au moins 10 caractères'],
  ]) {
    authDao.signIn = async () => ({ data: null, error: { message, status: 400 } })
    await assert.rejects(() => authService.login('coach@example.test', 'password'), {
      name: 'AppError', message: expected, statusCode: 400,
    })
  }
})

test('auth : une inscription réussie conserve la réponse du fournisseur', async () => {
  const data = { user: { id: 'coach-test' }, session: null }
  authDao.signUp = async () => ({ data, error: null })
  assert.equal(await authService.register('coach@example.test', 'password', { nom: 'Test', prenom: 'Coach' }), data)
})
