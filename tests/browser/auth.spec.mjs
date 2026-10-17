import { test, expect } from '@playwright/test'

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'awa@example.test' }

test('inscription : service indisponible sans fausse confirmation ni répétition', async ({ page }) => {
  let requests = 0
  await page.route('**/api/v1/**', async route => {
    if (route.request().url().endsWith('/auth/register')) {
      requests++
      return route.fulfill({ status: 503, json: { error: { code: 'AUTH_UNAVAILABLE', message: 'Le service de connexion est temporairement indisponible. Réessayez plus tard.' } } })
    }
    return route.fulfill({ json: { data: { user: null, profile: null } } })
  })
  await page.goto('/register')
  await page.getByLabel('Prénom', { exact: true }).fill('Awa')
  await page.getByLabel('Nom', { exact: true }).fill('Diop')
  await page.getByLabel('Adresse e-mail').fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-test-123')
  await page.getByLabel('Confirmer le mot de passe').fill('Secret-test-123')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page.getByRole('alert')).toContainText('temporairement indisponible')
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeEnabled()
  expect(requests).toBe(1)
})

test('un espace privé sans session retourne à la connexion', async ({ page }) => {
  await page.route('**/api/v1/**', route => route.fulfill({ json: { data: { user: null, profile: null } } }))
  await page.goto('/clients')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
})

test('connexion : corps correct, protection CSRF et erreur serveur visible', async ({ page }) => {
  let submitted
  await page.route('**/api/v1/**', async route => {
    if (route.request().url().endsWith('/auth/login')) {
      submitted = route.request()
      await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'Identifiants incorrects.' } } })
    } else await route.fulfill({ json: { data: { user: null, profile: null } } })
  })
  await page.goto('/login')
  await page.getByLabel('Adresse e-mail').fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-test-123')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('Identifiants incorrects.')
  expect(submitted.postDataJSON()).toMatchObject({ email: user.email, password: 'Secret-test-123' })
  expect(submitted.headers()['x-coachsen-client']).toBe('angular')
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeEnabled()
  await expect(page).toHaveURL(/\/login$/)
})

test('inscription : confirmation transmise au contrat serveur', async ({ page }) => {
  let body
  await page.route('**/api/v1/**', async route => {
    if (route.request().url().endsWith('/auth/register')) {
      body = route.request().postDataJSON()
      await route.fulfill({ status: 201, json: { data: { needsConfirmation: true, user } } })
    } else await route.fulfill({ json: { data: { user: null, profile: null } } })
  })
  await page.goto('/register')
  await page.getByLabel('Prénom', { exact: true }).fill('Awa')
  await page.getByLabel('Nom', { exact: true }).fill('Diop')
  await page.getByLabel('Adresse e-mail').fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-test-123')
  await page.getByLabel(/Confirmer|Confirmation/).fill('Secret-test-123')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page).toHaveURL(/\/check-email$/)
  expect(body.confirm).toBe(body.password)
})

test('inscription sans confirmation : recharge la session et ouvre le tableau de bord', async ({ page }) => {
  let registered = false
  let sessionRefreshes = 0
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/register')) {
      registered = true
      return route.fulfill({ status: 201, json: { data: { needsConfirmation: false, user } } })
    }
    if (path.endsWith('/auth/session')) {
      if (registered) sessionRefreshes++
      return route.fulfill({ json: { data: { user: registered ? user : null, profile: registered ? { id: user.id, prenom: 'Awa', nom: 'Diop' } : null } } })
    }
    if (path.endsWith('/dashboard')) return route.fulfill({ json: { data: { stats: { totalClients: 0, revenueThisMonth: 0, pendingRevenue: 0, totalSessions: 0 }, upcomingSessions: [], recentPayments: [], weeklySessions: [] } } })
    return route.fulfill({ json: { data: [] } })
  })
  await page.goto('/register')
  await page.getByLabel('Prénom', { exact: true }).fill('Awa')
  await page.getByLabel('Nom', { exact: true }).fill('Diop')
  await page.getByLabel('Adresse e-mail').fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-test-123')
  await page.getByLabel('Confirmer le mot de passe').fill('Secret-test-123')
  await page.getByRole('button', { name: 'Créer mon compte' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble' })).toBeVisible()
  expect(sessionRefreshes).toBeGreaterThan(0)
})

test('nouveau mot de passe : confirmation vérifiée avant envoi', async ({ page }) => {
  let body
  await page.route('**/api/v1/**', async route => {
    if (route.request().url().endsWith('/auth/update-password')) body = route.request().postDataJSON()
    await route.fulfill({ json: { data: { success: true } } })
  })
  await page.goto('/update-password')
  await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-test-123')
  await page.getByLabel('Confirmer le mot de passe').fill('Different-test-123')
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
  await expect(page.getByRole('alert')).toHaveText('Les mots de passe ne correspondent pas.')
  expect(body).toBeUndefined()
  await page.getByLabel('Confirmer le mot de passe').fill('Secret-test-123')
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
  await expect(page.getByRole('status')).toContainText('Mot de passe enregistré')
  expect(body.confirm).toBe(body.password)
})
