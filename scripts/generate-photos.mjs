// scripts/generate-photos.mjs
// Génère les photos d'ambiance de CoachSen (athlètes, halo turquoise) avec l'API d'images OpenAI.
// La clé reste dans .env.local (jamais committée, jamais dans Angular). Sortie : frontend/src/assets/photos/.
//
// Usage :
//   node scripts/generate-photos.mjs --dry-run          liste ce qui serait généré, sans appel ni coût
//   node scripts/generate-photos.mjs                    génère les images manquantes
//   node scripts/generate-photos.mjs --only=login-hero  génère une seule image
//   node scripts/generate-photos.mjs --force            régénère aussi celles qui existent
//   node scripts/generate-photos.mjs --quality=high     low | medium (défaut) | high : plus c'est haut, plus c'est cher
//
// Variables dans .env.local : OPENAI_API_KEY (obligatoire), IMAGE_MODEL (défaut gpt-image-1).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'frontend', 'src', 'assets', 'photos')

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? true]
}))
const quality = ['low', 'medium', 'high'].includes(args.quality) ? args.quality : 'medium'

/** Style commun : sombre, anthracite, lumière de salle, contour lumineux turquoise (#5fc9d2), aucun texte. */
const STYLE = [
  'Professional fitness photography, dark charcoal gym background, dramatic studio lighting,',
  'soft turquoise rim light and subtle teal glow outlining the subject, shallow depth of field,',
  'realistic skin and hands, natural proportions, confident and warm expression, premium app marketing look.',
  'No text, no logos, no watermark, no brand names, no extra limbs.',
].join(' ')

/** Format : portrait 1024x1536, paysage 1536x1024, carré 1024x1024. */
const IMAGES = [
  { id: 'login-hero', size: '1024x1536', use: 'page de connexion (portrait)',
    prompt: 'A Senegalese male personal trainer in his 30s, athletic build, wearing a fitted dark grey sleeveless training top, arms crossed, smiling confidently, standing next to a Senegalese woman athlete in a teal sports top, both facing the camera, waist-up portrait.' },
  { id: 'home-banner', size: '1536x1024', use: 'bandeau d’accueil (paysage)',
    prompt: 'A Senegalese woman personal trainer in a teal sports bra and dark leggings guiding a male client through a dumbbell exercise in a modern gym, side view, motion and focus, empty space on the left for text.' },
  { id: 'empty-clients', size: '1024x1024', use: 'écran vide : aucun client',
    prompt: 'Two African athletes, a man and a woman, shaking hands in a gym as a sign of a new partnership, friendly mood, centered composition.' },
  { id: 'empty-sessions', size: '1024x1024', use: 'écran vide : aucune séance',
    prompt: 'A Senegalese trainer holding a tablet and a stopwatch in a dim gym, looking ready to plan a session, centered composition.' },
  { id: 'empty-payments', size: '1024x1024', use: 'écran vide : aucun paiement',
    prompt: 'A smiling African coach holding a smartphone, mobile payment concept without any visible screen content or brand, gym in the background, centered composition.' },
  { id: 'detail-header', size: '1536x1024', use: 'en-tête de fiche client / séance (paysage)',
    prompt: 'An African male athlete performing a barbell back squat in a dark gym, strong side profile, chalk dust in the air, empty space on the right for text.' },
]

const selected = IMAGES.filter(i => !args.only || i.id === args.only)
if (!selected.length) {
  console.error(`Image inconnue : ${args.only}. Disponibles : ${IMAGES.map(i => i.id).join(', ')}`)
  process.exit(1)
}

function readEnv() {
  const env = {}
  try {
    for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#\s=][^=]*)=(.*)$/)
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* .env.local absent : on regarde l'environnement */ }
  return env
}

const todo = selected.filter(i => args.force || !existsSync(join(outDir, `${i.id}.png`)))
console.log(`Qualité : ${quality}. À générer : ${todo.length} sur ${selected.length}.`)
for (const i of selected) console.log(`  ${todo.includes(i) ? '+' : '=' } ${i.id.padEnd(16)} ${i.size.padEnd(10)} ${i.use}`)
if (args['dry-run'] || !todo.length) process.exit(0)

const env = readEnv()
const key = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY
if (!key) {
  console.error('OPENAI_API_KEY manquante : ajoutez-la dans .env.local (fichier ignoré par git).')
  process.exit(1)
}
const model = process.env.IMAGE_MODEL || env.IMAGE_MODEL || 'gpt-image-1'
mkdirSync(outDir, { recursive: true })

let failed = 0
for (const image of todo) {
  process.stdout.write(`Génération de ${image.id}… `)
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt: `${image.prompt} ${STYLE}`, size: image.size, quality, n: 1 }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`${res.status} ${body?.error?.message ?? res.statusText}`)
    }
    const data = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    if (!b64) throw new Error('réponse sans image')
    writeFileSync(join(outDir, `${image.id}.png`), Buffer.from(b64, 'base64'))
    console.log('ok')
  } catch (e) {
    failed++
    console.log(`échec (${e.message})`)
  }
}
console.log(failed ? `${failed} image(s) en échec : relancez la commande, seules les manquantes seront refaites.` : `Terminé : ${outDir}`)
console.log('Vérifiez chaque image (visages, mains, texte parasite) avant de l’utiliser.')
process.exit(failed ? 1 : 0)
