import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const root = new URL('../', import.meta.url)
// Générer ce fichier avec supabase status -o json, sans afficher les clés dans le terminal.
const status = JSON.parse((await readFile(new URL('.tools/coachsen-local/status.json', root), 'utf8')).replace(/^\uFEFF/, ''))
if (status.API_URL !== 'http://127.0.0.1:54421') throw new Error('Instance locale CoachSen attendue sur le port 54421.')
if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Clés locales absentes du statut Supabase.')
const env = new URL('.env.local', root)
try { await copyFile(env, new URL('.env.before-docker.local', root), constants.COPYFILE_EXCL) }
catch (error) { if (error.code !== 'EEXIST') throw error }
let content = await readFile(env, 'utf8')
const values = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:4200',
  FRONTEND_ORIGIN: 'http://127.0.0.1:4200',
}
for (const [name, value] of Object.entries(values)) {
  if (/[\r\n]/.test(value)) throw new Error('Valeur de configuration invalide.')
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, 'm')
  content = pattern.test(content) ? content.replace(pattern, () => line) : content.trimEnd() + '\n' + line + '\n'
}
await writeFile(env, content)
console.log('Application reliée à Supabase Docker CoachSen. Configuration précédente sauvegardée dans .env.before-docker.local. Aucune clé affichée.')
