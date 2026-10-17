import { test, expect } from '@playwright/test'

const empty = { clients: [], sessions: [], payments: [], total: 0 }
const client = { id: 'client-awa', prenom: 'Awa', nom: 'Diop' }
const session = { id: 'session-course', titre: 'Course matinale', date_heure: '2026-09-11T09:00:00Z', clients: client }

async function mockWorkspace(page, handle) {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    if (await handle(route, url)) return
    const data = url.pathname.endsWith('/auth/session')
      ? { user: { id: 'coach-test' }, profile: client }
      : []
    await route.fulfill({ json: { data } })
  })
  await page.goto('/clients')
}

test('recherche globale : seuil, groupes, FCFA et liens', async ({ page }) => {
  const requests = []
  await mockWorkspace(page, async (route, url) => {
    if (!url.pathname.endsWith('/search')) return false
    requests.push(url.searchParams.get('q'))
    await route.fulfill({ json: { data: { clients: [client], sessions: [session], payments: [{ id: 'payment-1', clients: client, montant: 12500, date_paiement: '2026-09-11' }], total: 3 } } })
    return true
  })
  const input = page.getByLabel('Recherche globale', { exact: true })
  await input.fill('A')
  await expect(page.getByRole('region', { name: 'Résultats de recherche globale' })).toHaveCount(0)
  expect(requests).toEqual([])
  await input.fill('Awa & Diop')
  const results = page.getByRole('region', { name: 'Résultats de recherche globale' })
  await expect(results.getByRole('status')).toContainText('3 résultat(s)')
  expect(requests).toEqual(['Awa & Diop'])
  await expect(results.getByRole('link', { name: 'Awa Diop', exact: true })).toHaveAttribute('href', '/clients/client-awa')
  await expect(results.getByRole('link', { name: /Course matinale/ })).toHaveAttribute('href', '/sessions/session-course')
  await expect(results.getByRole('link', { name: /FCFA/ })).toHaveText(/12\s*500 FCFA/)
  await input.fill('')
  await expect(results).toHaveCount(0)
})

test('recherche globale : une réponse obsolète ne remplace pas la recherche courante', async ({ page }) => {
  let oldRoute
  await mockWorkspace(page, async (route, url) => {
    if (!url.pathname.endsWith('/search')) return false
    if (url.searchParams.get('q') === 'ancien') { oldRoute = route; return true }
    await route.fulfill({ json: { data: empty } })
    return true
  })
  const input = page.getByLabel('Recherche globale', { exact: true })
  await input.fill('ancien')
  await expect.poll(() => Boolean(oldRoute)).toBe(true)
  await input.fill('nouveau')
  await expect(page.getByText('Aucun résultat. Essayez un autre nom ou titre.')).toBeVisible()
  const response = page.waitForResponse(url => url.url().includes('q=ancien'))
  await oldRoute.fulfill({ json: { data: { ...empty, clients: [client], total: 1 } } })
  await response
  await expect(page.getByText('Aucun résultat. Essayez un autre nom ou titre.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Résultats de recherche globale' }).getByRole('link')).toHaveCount(0)
})

test('recherche globale : erreur serveur et nouvelle tentative', async ({ page }) => {
  let attempts = 0
  await mockWorkspace(page, async (route, url) => {
    if (!url.pathname.endsWith('/search')) return false
    await route.fulfill(++attempts === 1
      ? { status: 503, json: { error: { message: 'Recherche indisponible.' } } }
      : { json: { data: empty } })
    return true
  })
  await page.getByLabel('Recherche globale', { exact: true }).fill('Awa')
  await expect(page.getByRole('alert')).toHaveText('Recherche indisponible.')
  await page.getByRole('button', { name: 'Réessayer la recherche' }).click()
  await expect(page.getByText('Aucun résultat. Essayez un autre nom ou titre.')).toBeVisible()
})

test('notifications : chargement, erreur, actualisation et lien séance', async ({ page }) => {
  let pending
  let attempts = 0
  await mockWorkspace(page, async (route, url) => {
    if (!url.pathname.endsWith('/notifications')) return false
    if (++attempts === 1) { pending = route; return true }
    await route.fulfill({ json: { data: attempts === 2 ? [] : [session] } })
    return true
  })
  const toggle = page.getByRole('button', { name: 'Notifications', exact: true })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('Chargement des notifications…')).toBeVisible()
  await expect.poll(() => Boolean(pending)).toBe(true)
  await pending.fulfill({ status: 503, json: { error: { message: 'Notifications indisponibles.' } } })
  await expect(page.getByRole('alert')).toHaveText('Notifications indisponibles.')
  await page.getByRole('button', { name: 'Actualiser les notifications' }).click()
  await expect(page.getByText('Aucune séance prévue dans les deux prochaines heures.')).toBeVisible()
  await page.getByRole('button', { name: 'Actualiser les notifications' }).click()
  const link = page.getByRole('region', { name: 'Séances dans les deux prochaines heures' }).getByRole('link')
  await expect(link).toContainText('Awa Diop')
  await expect(link).toHaveAttribute('href', '/sessions/session-course')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(link).toHaveCount(0)
})
