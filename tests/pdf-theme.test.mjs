import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { buildClientPdf } from '../src/server/pdf/buildClientPdf.ts'
import { buildPaymentPdf } from '../src/server/pdf/buildPaymentPdf.ts'
import { paletteFor, parseTheme } from '../src/server/pdf/palette.ts'

const client = { id: 'c1', prenom: 'Awa', nom: 'Diop', telephone: '+221770000000', email: 'awa@example.test', objectif: 'PERTE_DE_POIDS', date_naissance: '1995-03-02', taille_cm: 168, poids_initial_kg: 70, sexe: 'FEMME' }
const sessions = [{ id: 's1', titre: 'Cardio', date_heure: '2026-10-10T09:00:00Z', duree_minutes: 60, statut: 'EFFECTUEE', lieu: 'Salle' }]
const payments = [{ id: 'p1234567890', montant: 25000, methode: 'WAVE', statut: 'PAYE', date_paiement: '2026-10-10', description: 'Forfait octobre', client_id: 'c1' }]
const coach = { prenom: 'Moussa', nom: 'Fall', telephone: '+221770000001', specialite: 'Personal training' }

const text = buffer => Buffer.from(buffer).toString('latin1')
/** Couleur de remplissage jsPDF (« r g b rg ») : jsPDF écrit les composantes en décimales, on les compare à 2 chiffres. */
const fills = pdf => new Set([...text(pdf).matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)].map(m => m.slice(1, 4).map(v => Math.round(Number(v) * 255)).join(',')))

test('parseTheme : thème inconnu ou absent donne nuit', () => {
  assert.equal(parseTheme(undefined), 'nuit')
  assert.equal(parseTheme(null), 'nuit')
  assert.equal(parseTheme('<script>'), 'nuit')
  assert.equal(parseTheme('corail'), 'corail')
  assert.equal(parseTheme('lagon'), 'lagon')
})

for (const [name, build] of [
  ['fiche client', theme => buildClientPdf(client, sessions, payments, 'Moussa Fall', theme)],
  ['reçu de paiement', theme => buildPaymentPdf(payments[0], client, coach, theme)],
]) {
  test(`${name} : la couleur d'accent suit le thème`, async () => {
    const out = {}
    for (const theme of ['nuit', 'corail', 'lagon', undefined, 'inconnu']) out[theme] = fills(await build(theme))
    const has = (set, color) => set.has(color.join(','))
    assert.ok(has(out.nuit, paletteFor('nuit').accent))
    assert.ok(has(out.corail, paletteFor('corail').accent) && has(out.corail, paletteFor('corail').header))
    assert.ok(has(out.lagon, paletteFor('lagon').accent))
    assert.ok(!has(out.corail, paletteFor('nuit').accent), 'plus de vert citron en corail')
    assert.ok(!has(out.lagon, paletteFor('nuit').accent), 'plus de vert citron en lagon')
    assert.deepEqual([...out[undefined]].sort(), [...out.nuit].sort(), 'sans thème : apparence d\'origine')
    assert.deepEqual([...out.inconnu].sort(), [...out.nuit].sort(), 'thème inconnu : nuit')
  })
}

if (process.env.PDF_THEME_DIR) {
  test('exemples écrits pour contrôle visuel', async () => {
    mkdirSync(process.env.PDF_THEME_DIR, { recursive: true })
    for (const theme of ['nuit', 'corail', 'lagon']) {
      writeFileSync(`${process.env.PDF_THEME_DIR}/fiche-${theme}.pdf`, Buffer.from(await buildClientPdf(client, sessions, payments, 'Moussa Fall', theme)))
      writeFileSync(`${process.env.PDF_THEME_DIR}/recu-${theme}.pdf`, Buffer.from(await buildPaymentPdf(payments[0], client, coach, theme)))
    }
  })
}
