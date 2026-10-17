import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClientPdf } from '../src/server/pdf/buildClientPdf.ts'
import { buildPaymentPdf } from '../src/server/pdf/buildPaymentPdf.ts'
import { shareReport } from '../src/server/reportExports.ts'
import { coachLabel } from '../src/lib/coachName.ts'

const client = { id: 'c1', prenom: 'Awa', nom: 'Diop', telephone: '+221770000000', objectif: 'PERTE_DE_POIDS', taille_cm: 168, poids_initial_kg: 70, sexe: 'FEMME' }
const payment = { id: 'p1234567890', montant: 25000, methode: 'WAVE', statut: 'PAYE', date_paiement: '2026-10-10', description: 'Forfait', client_id: 'c1' }
const text = b => Buffer.from(b).toString('latin1')

test('reçu : « Coach <prénom> », repli sur le nom, spécialité conservée', async () => {
  const a = text(await buildPaymentPdf(payment, client, { prenom: 'Mansour', nom: 'Fall', telephone: '770000001', specialite: 'Musculation' }))
  assert.ok(a.includes('Coach Mansour') && !a.includes('Mansour Fall') && a.includes('Musculation'))
  const b = text(await buildPaymentPdf(payment, client, { prenom: '', nom: 'Diop' }))
  assert.ok(b.includes('Coach Diop'))
})

test('fiche client : « Coach <prénom> » sous le logo et en pied de page', async () => {
  const pdf = text(await buildClientPdf(client, [], [], coachLabel('Mansour', 'Fall')))
  assert.ok((pdf.match(/Coach Mansour/g) ?? []).length >= 2)
  assert.ok(!pdf.includes('Mansour Fall'))
})

test('message WhatsApp de secours : signature du coach en fin de message', async () => {
  const storage = { upload: async () => ({ error: null }), createSignedUrl: async () => ({ error: null, data: { signedUrl: 'https://x.test/r.pdf' } }) }
  const source = { input: {}, pdf: { coachNom: coachLabel('Mansour', 'Fall') }, telephone: '771234567', prenom: 'Awa' }
  const { waLink } = await shareReport({ source, buffer: new Uint8Array([1]), month: '2026-10', coachId: 'k', clientId: 'c', storage })
  const msg = decodeURIComponent(waLink.split('text=')[1])
  assert.ok(msg.includes('https://x.test/r.pdf'))
  assert.ok(msg.endsWith('Lien valable 24 heures.\n— Coach Mansour'))
})
