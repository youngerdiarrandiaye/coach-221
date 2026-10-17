// scripts/migrate-production.mjs
// Applique automatiquement le SQL de CoachSen à la base Supabase de production, au déploiement (service « migrate »
// de deploy/docker-compose.prod.yml, lancé avant l'API). Sans dépendance : Node 24 et fetch.
//
// Principe
// - Le SQL passe par le service postgres-meta de Supabase (route Kong /pg/query), avec la clé service_role : la base
//   n'est jamais exposée sur Internet et la clé reste sur le serveur.
// - Un registre public.schema_migrations (nom + empreinte SHA-256) garde ce qui est déjà appliqué : chaque fichier
//   ne passe qu'UNE fois, dans l'ordre de scripts/migrations-list.mjs. Relancer le script ne fait rien de plus.
// - Chaque fichier est envoyé avec son inscription au registre dans la même requête : un fichier en échec ne laisse
//   pas de demi-application, et le déploiement s'arrête (code de sortie 1) avant de démarrer l'API.
// - Sécurité : si la base contient déjà les tables de l'application mais pas de registre (SQL joué à la main),
//   le script s'arrête au lieu de rejouer. MIGRATE_BASELINE=1 marque alors tout comme déjà appliqué, sans exécuter.
//
// Variables : NEXT_PUBLIC_SUPABASE_URL (ou MIGRATE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
// Options : --dry-run (liste ce qui serait appliqué, n'écrit rien), MIGRATE_SQL_DIR (dossier des fichiers SQL).
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { MIGRATIONS } from './migrations-list.mjs'

const dryRun = process.argv.includes('--dry-run')
const baseline = process.env.MIGRATE_BASELINE === '1'
const base = (process.env.MIGRATE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const sqlDir = process.env.MIGRATE_SQL_DIR || fileURLToPath(new URL('../supabase/', import.meta.url))

if (!base || !key) {
  console.error('migrate : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Exécute du SQL via postgres-meta. Réessaie tant que Supabase démarre (réseau, 502, 503, 504). */
async function query(sql, { retries = 30 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${base}/pg/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(120_000),
      })
      const text = await res.text()
      let body
      try { body = JSON.parse(text) } catch { body = text }
      if (res.ok) return body
      if ([502, 503, 504].includes(res.status) && attempt < retries) { await sleep(10_000); continue }
      const detail = typeof body === 'object' && body ? (body.error || body.message || JSON.stringify(body)) : String(body).slice(0, 300)
      throw new Error(`HTTP ${res.status} : ${detail}`)
    } catch (error) {
      const network = error instanceof TypeError || error?.name === 'TimeoutError' || error?.cause
      if (network && attempt < retries) { console.log(`migrate : Supabase injoignable (essai ${attempt}/${retries}), nouvelle tentative dans 10 s`); await sleep(10_000); continue }
      throw error
    }
  }
}

const quote = value => `'${String(value).replace(/'/g, "''")}'`

async function main() {
  const files = []
  for (const name of MIGRATIONS) {
    const text = await readFile(`${sqlDir}/${name}`, 'utf8')
    files.push({ name, text, sha: createHash('sha256').update(text).digest('hex') })
  }

  // Registre : réservé au rôle service (RLS activée, aucune politique : l'API publique n'y accède pas).
  if (!dryRun) {
    await query(`create table if not exists public.schema_migrations (
      name text primary key, sha256 text not null, applied_at timestamptz not null default now());
      alter table public.schema_migrations enable row level security;`)
  }
  const exists = await query(`select to_regclass('public.schema_migrations') is not null as ledger, to_regclass('public.clients') is not null as app`)
  const { ledger, app } = exists[0]
  const rows = ledger ? await query('select name, sha256 from public.schema_migrations order by name') : []
  const applied = new Map(rows.map(r => [r.name, r.sha256]))

  if (applied.size === 0 && app && !baseline) {
    console.error(`migrate : la base contient déjà les tables de CoachSen mais aucun registre de migrations.
Le SQL a probablement été joué à la main. Pour ne pas le rejouer par erreur, le script s'arrête.
Si tout est déjà appliqué : relancer UNE fois avec MIGRATE_BASELINE=1 (il enregistre sans exécuter).`)
    process.exit(1)
  }

  const pending = []
  for (const f of files) {
    if (applied.has(f.name)) {
      if (applied.get(f.name) !== f.sha) console.warn(`migrate : ATTENTION, ${f.name} a changé depuis son application (ignoré : ajouter une nouvelle migration à la fin de la liste).`)
      continue
    }
    pending.push(f)
  }
  console.log(`migrate : ${files.length - pending.length} déjà appliquée(s), ${pending.length} à appliquer.`)
  if (dryRun) { pending.forEach(f => console.log(`  à appliquer : ${f.name}`)); return }

  for (const f of pending) {
    const record = `\ninsert into public.schema_migrations (name, sha256) values (${quote(f.name)}, ${quote(f.sha)});`
    if (baseline && app && applied.size === 0) {
      await query(record.trim())
      console.log(`  enregistrée sans exécution (baseline) : ${f.name}`)
      continue
    }
    const started = Date.now()
    try {
      await query(f.text.trimEnd() + '\n;' + record)
    } catch (error) {
      console.error(`migrate : ÉCHEC sur ${f.name} : ${error.message}`)
      process.exit(1)
    }
    console.log(`  appliquée : ${f.name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
  }
  console.log('migrate : terminé.')
}

main().catch(error => { console.error('migrate : erreur :', error.message); process.exit(1) })
