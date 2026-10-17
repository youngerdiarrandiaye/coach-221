import { test, expect } from '@playwright/test'

const clientId = '11111111-1111-4111-8111-111111111111'
const client = { id: clientId, prenom: 'Awa', nom: 'Diop', actif: true }
const profile = { id: '22222222-2222-4222-8222-222222222222', prenom: 'Coach', nom: 'Test', email: 'coach@example.test', avatar_url: null }

test('photo de profil : validation, multipart et conservation après erreur', async ({ page }) => {
  let upload
  let fail = false
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX9sAAAAASUVORK5CYII='
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/session')) return route.fulfill({ json: { data: { user: { id: profile.id }, profile } } })
    if (path.endsWith('/profile/avatar')) {
      upload = route.request()
      return fail ? route.fulfill({ status: 502, json: { error: { message: 'Envoi impossible.' } } }) : route.fulfill({ json: { data: { url: photo } } })
    }
    await route.fulfill({ json: { data: path.endsWith('/profile') ? profile : [] } })
  })
  await page.goto('/profile')
  const input = page.getByLabel('Changer la photo de profil')
  await input.setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') })
  await expect(page.getByRole('alert')).toContainText('JPEG, PNG ou WebP')
  expect(upload).toBeUndefined()
  const file = { name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') }
  await input.setInputFiles(file)
  await expect(page.getByText('Photo de profil enregistrée.')).toBeVisible()
  expect(upload.headers()['content-type']).toContain('multipart/form-data; boundary=')
  expect(upload.headers()['x-coachsen-client']).toBe('angular')
  expect(upload.postDataBuffer().toString()).toContain('name="avatar"; filename="avatar.png"')
  await expect(page.getByAltText('Photo de profil', { exact: true })).toHaveAttribute('src', photo)
  fail = true
  await input.setInputFiles(file)
  await expect(page.getByRole('alert')).toHaveText('Envoi impossible.')
  await expect(page.getByAltText('Photo de profil', { exact: true })).toHaveAttribute('src', photo)
})

test('fiche client : séances futures planifiées et création préremplie', async ({ page }) => {
  let requestedClient
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/auth/session')) return route.fulfill({ json: { data: { user: { id: profile.id }, profile } } })
    let data = []
    if (url.pathname.endsWith('/clients/' + clientId)) data = client
    else if (url.pathname.endsWith('/clients')) data = [client]
    else if (url.pathname.endsWith('/sessions')) {
      requestedClient = url.searchParams.get('clientId')
      data = [
        { id: 'late', titre: 'Deuxième séance', statut: 'PLANIFIEE', date_heure: '2099-09-12T12:00:00Z', duree_minutes: 60 },
        { id: 'cancelled', titre: 'Séance annulée', statut: 'ANNULEE', date_heure: '2099-09-10T12:00:00Z' },
        { id: 'past', titre: 'Ancienne séance', statut: 'PLANIFIEE', date_heure: '2000-09-10T12:00:00Z' },
        { id: 'early', titre: 'Première séance', statut: 'PLANIFIEE', date_heure: '2099-09-11T12:00:00Z', duree_minutes: 45 },
      ]
    }
    await route.fulfill({ json: { data } })
  })
  await page.goto('/clients/' + clientId)
  const section = page.getByRole('region', { name: 'Prochaines séances' })
  await expect(section.getByRole('listitem')).toHaveCount(2)
  await expect(section.getByRole('listitem').first()).toContainText('Première séance')
  expect(requestedClient).toBe(clientId)
  await page.getByRole('link', { name: 'Planifier une séance pour ce client' }).click()
  await expect(page.getByLabel('Client', { exact: false })).toHaveValue(clientId)
})
