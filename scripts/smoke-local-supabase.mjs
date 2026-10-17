import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'

const root = new URL('../', import.meta.url)
const env = await readFile(new URL('.env.local', root), 'utf8')
assert.match(env, /^NEXT_PUBLIC_SUPABASE_URL=http:\/\/127\.0\.0\.1:54421\r?$/m, 'Réservé à Supabase Docker CoachSen local.')
const credentialsFile = new URL('.tools/coachsen-local/demo-access.json', root)
let account
let existing = false
try { account = JSON.parse(await readFile(credentialsFile, 'utf8')); existing = true }
catch (error) { if (error.code !== 'ENOENT') throw error }
account ??= { email: 'coach@coachsen.test', password: 'Coach!' + randomBytes(12).toString('base64url') }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
 const page = await browser.newPage()
 await page.goto('http://127.0.0.1:4200/' + (existing ? 'login' : 'register'))
 if (!existing) {
  await page.getByLabel('Prénom', { exact: true }).fill('Coach')
  await page.getByLabel('Nom', { exact: true }).fill('Démo')
  await page.getByLabel('Confirmer le mot de passe').fill(account.password)
 }
 await page.getByLabel('Adresse e-mail').fill(account.email)
 await page.getByLabel('Mot de passe', { exact: true }).fill(account.password)
 const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/' + (existing ? 'login' : 'register')))
 await page.getByRole('button', { name: existing ? 'Se connecter' : 'Créer mon compte' }).click()
 const response = await responsePromise
 assert.ok(response.ok(), 'Inscription/connexion réelle refusée : HTTP ' + response.status())
 // Conserver l'accès dès la création réussie, même si la vérification du dashboard échoue.
 await writeFile(credentialsFile, JSON.stringify(account, null, 2), { mode: 0o600 })
 await page.waitForURL('**/dashboard', { timeout: 60000 })
 const session = await page.request.get('http://127.0.0.1:4200/api/v1/auth/session')
 const data = (await session.json()).data
 assert.equal(data.user.email, account.email)
 assert.equal(data.profile.prenom, 'Coach')
 for (const resource of ['clients', 'sessions', 'payments', 'progress', 'stats', 'dashboard']) {
  const result = await page.request.get('http://127.0.0.1:4200/api/v1/' + resource)
  assert.equal(result.status(), 200, resource + ' doit être accessible au coach connecté')
  assert.ok('data' in await result.json())
 }
 console.log('Connexion réelle, profil créé et six API métier validés sur Supabase Docker. Accès démo enregistré dans .tools/coachsen-local/demo-access.json.')
} finally { await browser.close() }
