// Lance les fichiers de tests/ l'un après l'autre, chacun dans son propre processus (évite les manques de mémoire
// avec PGlite). Usage : node scripts/run-tests.mjs [fragment-de-nom ...]
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const filters = process.argv.slice(2)
const files = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => name.endsWith('.test.mjs') && (!filters.length || filters.some(f => name.includes(f))))
  .sort()
if (!files.length) { console.error('Aucun fichier de test trouvé.'); process.exit(1) }

const failed = []
for (const file of files) {
  console.log(`\n=== tests/${file} ===`)
  const result = spawnSync(process.execPath, ['--import', './scripts/register-test-loader.mjs', '--test', `tests/${file}`], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) failed.push(file)
}
console.log(failed.length ? `\n${failed.length}/${files.length} fichier(s) en échec : ${failed.join(', ')}` : `\n${files.length} fichier(s) de tests réussis.`)
process.exit(failed.length ? 1 : 0)
