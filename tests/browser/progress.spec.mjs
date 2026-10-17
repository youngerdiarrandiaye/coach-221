import { test, expect } from '@playwright/test'

const clientId = '22222222-2222-4222-8222-222222222222'
async function mockProgress(page, entries) {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: { data: path.endsWith('/auth/session')
      ? { user: { id: 'coach', email: 'awa@example.test' }, profile: { id: 'coach', prenom: 'Awa', nom: 'Diop' } }
      : entries } })
  })
  await page.goto(`/progress/${clientId}`)
}

test('progression : toutes les mesures et chronologie du graphique', async ({ page }) => {
  await mockProgress(page, [
    { id: 'recent', mesure_date: '2026-09-10', poids_kg: 78, imc: 24, frequence_cardiaque_repos_bpm: 60, frequence_cardiaque_effort_bpm: 150, tour_taille_cm: 80, hanches_cm: 95, bras_cm: 30, cuisse_cm: 50, masse_grasse_pct: 18, notes: 'Mesure récente' },
    { id: 'older', mesure_date: '2026-09-01', poids_kg: 80, imc: 25, frequence_cardiaque_repos_bpm: 65, frequence_cardiaque_effort_bpm: 160, tour_taille_cm: 82, hanches_cm: 96, bras_cm: 31, cuisse_cm: 51, masse_grasse_pct: 20 },
  ])
  await expect(page.getByRole('columnheader', { name: 'Hanches (cm)', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Masse grasse (%)', exact: true })).toBeVisible()
  await expect(page.getByRole('img')).toHaveAccessibleName('Poids : évolution chronologique, 2 mesures')
  const values = await page.locator('app-progress-chart circle title').allTextContents()
  expect(values[0]).toContain('80 kg')
  expect(values[1]).toContain('78 kg')
  for (const key of ['imc', 'frequence_cardiaque_repos_bpm', 'frequence_cardiaque_effort_bpm', 'tour_taille_cm', 'hanches_cm', 'bras_cm', 'cuisse_cm', 'masse_grasse_pct']) {
    await page.getByLabel('Mesure à afficher').selectOption(key)
    await expect(page.locator('app-progress-chart circle')).toHaveCount(2)
  }
  await page.getByText('Valeurs de masse grasse', { exact: true }).click()
  await expect(page.locator('app-progress-chart li')).toHaveCount(2)
})

test('progression : valeurs absentes et mesure unique sur mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockProgress(page, [{ id: 'only', mesure_date: '2026-09-01', poids_kg: 80, imc: null }])
  await expect(page.getByRole('status')).toHaveText('Ajoutez au moins 2 mesures pour voir l’évolution.')
  await page.getByLabel('Mesure à afficher').selectOption('imc')
  await expect(page.getByRole('status')).toHaveText('Aucune donnée pour cette mesure.')
  await expect(page.getByRole('img')).toHaveCount(0)
  const layout = await page.evaluate(() => ({
    width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > window.innerWidth).map(element => element.tagName + '.' + element.className).slice(0, 15),
  }))
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width)
})

test('progression : historique vide', async ({ page }) => {
  await mockProgress(page, [])
  await expect(page.getByRole('status')).toHaveText('Aucune donnée pour cette mesure.')
  await expect(page.getByRole('heading', { name: 'Votre espace est prêt' })).toBeVisible()
})
