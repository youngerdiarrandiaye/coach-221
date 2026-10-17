import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReportData, monthBounds, monthLabel, sanitizeMessage, pdfSafe, MESSAGE_MAX } from '../src/lib/reportData.ts'
import { handleReport, renderReportPdf, shareReport, parseMessage } from '../src/server/reportExports.ts'
import { failure, HttpError } from '../src/server/http.ts'

const CA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const COACH_A = '11111111-1111-4111-8111-111111111111'
const COACH_B = '22222222-2222-4222-8222-222222222222'
const base = { client: { id: CA, prenom: 'Awa', nom: 'Sow', objectif: 'CARDIO' }, month: '2026-10', coach: 'Coach A', sessions: [], logs: [], exercises: [{ id: 'e1', nom: 'Squat' }, { id: 'e2', nom: 'Rowing' }], progress: [] }
const pad = n => String(n).padStart(2, '0')

test('rapport : mois et semaines ISO couvrant octobre 2026 (jours Dakar)', () => {
  assert.deepEqual(monthBounds('2026-10'), { start: '2026-10-01', end: '2026-10-31' })
  assert.deepEqual(monthBounds('2024-02'), { start: '2024-02-01', end: '2024-02-29' })
  assert.equal(monthLabel('2026-10'), 'octobre 2026')
  assert.throws(() => monthBounds('2026-13'))
  const r = buildReportData(base)
  assert.deepEqual(r.weeks.map(w => [w.label, w.start]), [['S40', '2026-10-01'], ['S41', '2026-10-05'], ['S42', '2026-10-12'], ['S43', '2026-10-19'], ['S44', '2026-10-26']])
  // janvier 2027 commence par la semaine ISO 53 de 2026
  assert.equal(buildReportData({ ...base, month: '2027-01' }).weeks[0].label, 'S53')
})

test('rapport : séances par statut, bornes du mois en heure de Dakar, présence', () => {
  const s = (date_heure, statut) => ({ date_heure, statut })
  const r = buildReportData({ ...base, sessions: [
    s('2026-10-01T00:00:00.000Z', 'EFFECTUEE'), s('2026-10-31T23:59:00.000Z', 'EFFECTUEE'), s('2026-11-01T00:00:00.000Z', 'EFFECTUEE'), s('2026-09-30T23:59:59.000Z', 'EFFECTUEE'),
    s('2026-10-10T09:00:00.000Z', 'ANNULEE'), s('2026-10-20T09:00:00.000Z', 'PLANIFIEE'), s('2026-10-21T09:00:00.000Z', 'EFFECTUEE'),
  ] })
  assert.deepEqual([r.kpis.seances_effectuees, r.kpis.seances_annulees, r.kpis.seances_planifiees, r.kpis.taux_presence], [3, 1, 1, 75])
  assert.deepEqual(r.weeks.map(w => w.seances_effectuees), [1, 0, 0, 1, 1])
  assert.equal(r.weeks.reduce((n, w) => n + w.seances_effectuees, 0), r.kpis.seances_effectuees)
})

test('rapport : volume, séries, poids sur 6 mois, mensurations et records battus', () => {
  const log = (log_date, exercice_id, reps, charge_kg) => ({ log_date, exercice_id, reps, charge_kg })
  const r = buildReportData({ ...base,
    logs: [
      log('2026-09-10', 'e1', 5, 100),                                    // avant le mois : référence
      log('2026-10-02', 'e1', 5, 100), log('2026-10-06', 'e1', 5, 110), log('2026-10-07', 'e1', 8, 90), // 110 x5 bat 1RM et charge ; 8 reps bat les répétitions
      log('2026-10-03', 'e2', 10, 50),                                    // premier historique : trois records
      log('2026-11-02', 'e1', 5, 200),                                    // après le mois : ignoré
    ],
    progress: [
      { mesure_date: '2026-04-12', poids_kg: 90 }, { mesure_date: '2026-06-01', poids_kg: 86 }, { mesure_date: '2026-06-20', poids_kg: 84 },
      { mesure_date: '2026-09-15', poids_kg: 82, tour_taille_cm: 90 }, { mesure_date: '2026-10-05', poids_kg: 81, tour_taille_cm: 89 }, { mesure_date: '2026-10-25', poids_kg: 80, tour_taille_cm: 88, bras_cm: 33 },
    ] })
  assert.equal(r.kpis.series, 4)
  assert.equal(r.kpis.volume_kg, 500 + 550 + 720 + 500)
  // semaine S40 (1er au 4 oct) : 5x100 + 10x50 ; S41 : 5x110 + 8x90
  assert.deepEqual(r.weeks.map(w => w.volume_kg), [1000, 1270, 0, 0, 0])
  // avril n'est plus dans les 6 derniers mois (mai à octobre) ; juillet et août sans mesure sont ignorés
  assert.deepEqual(r.poids, [{ label: 'juin 26', value: 85 }, { label: 'sept. 26', value: 82 }, { label: 'oct. 26', value: 80.5 }])
  assert.deepEqual([r.kpis.poids_debut, r.kpis.poids_fin, r.kpis.delta_poids], [82, 80, -2])
  const taille = r.mensurations.find(m => m.key === 'tour_taille')
  assert.deepEqual([taille.debut, taille.fin, taille.delta, taille.unit], [90, 88, -2, 'cm'])
  const bras = r.mensurations.find(m => m.key === 'bras')
  assert.deepEqual([bras.debut, bras.fin, bras.delta], [33, 33, null])
  const sq = r.records.filter(x => x.exercice === 'Squat')
  assert.deepEqual(sq.map(x => [x.type, x.value, x.date]), [['1RM', 128.3, '2026-10-06'], ['CHARGE', 110, '2026-10-06'], ['REPS', 8, '2026-10-07']])
  assert.equal(r.records.filter(x => x.exercice === 'Rowing').length, 3)
  assert.equal(r.kpis.records, r.records.length)
  assert.ok(!r.records.some(x => x.value === 200))
})

test('rapport : un record déjà détenu avant le mois n’est pas compté', () => {
  const r = buildReportData({ ...base, logs: [{ log_date: '2026-09-01', exercice_id: 'e1', reps: 5, charge_kg: 100 }, { log_date: '2026-10-02', exercice_id: 'e1', reps: 5, charge_kg: 90 }] })
  assert.deepEqual(r.records, [])
})

test('rapport : mois vide, valeurs invalides et mois très chargé', () => {
  const empty = buildReportData(base)
  assert.deepEqual([empty.kpis.seances_effectuees, empty.kpis.taux_presence, empty.kpis.volume_kg, empty.kpis.poids_fin, empty.kpis.delta_poids], [0, null, 0, null, null])
  assert.deepEqual([empty.poids, empty.mensurations, empty.records], [[], [], []])
  assert.equal(empty.weeks.length, 5)
  const odd = buildReportData({ ...base, logs: [{ log_date: '2026-10-02', exercice_id: 'e1', reps: Number.NaN, charge_kg: 50 }], progress: [{ mesure_date: '2026-10-02', poids_kg: 'abc' }] })
  assert.equal(odd.kpis.series, 0)
  assert.equal(odd.kpis.poids_fin, null)
  const sessions = Array.from({ length: 100 }, (_, i) => ({ date_heure: `2026-10-${pad(1 + (i % 31))}T08:00:00.000Z`, statut: 'EFFECTUEE' }))
  const logs = Array.from({ length: 1000 }, (_, i) => ({ log_date: `2026-10-${pad(1 + (i % 31))}`, exercice_id: i % 2 ? 'e1' : 'e2', reps: 5 + (i % 10), charge_kg: 20 + (i % 50) }))
  const heavy = buildReportData({ ...base, sessions, logs })
  assert.equal(heavy.kpis.seances_effectuees, 100)
  assert.equal(heavy.kpis.series, 1000)
  assert.ok(heavy.records.length <= 60)
  assert.ok(Math.abs(heavy.weeks.reduce((s, w) => s + w.volume_kg, 0) - heavy.kpis.volume_kg) < 1)
})

test('message du coach : 600 caractères, retours à la ligne, jamais du balisage', () => {
  assert.equal(sanitizeMessage(null), null)
  assert.equal(sanitizeMessage('   \n  '), null)
  assert.equal(sanitizeMessage('Bravo !\r\nA lundi\n\n\n\nMerci'), 'Bravo !\nA lundi\n\nMerci')
  assert.equal(sanitizeMessage('<b>gras</b> & <script>alert(1)</script>'), '<b>gras</b> & <script>alert(1)</script>')
  assert.equal(sanitizeMessage('Super mois \u{1F4AA} coach\u0000'), 'Super mois  coach')
  assert.equal(sanitizeMessage('é'.repeat(MESSAGE_MAX)).length, MESSAGE_MAX)
  assert.throws(() => sanitizeMessage('a'.repeat(MESSAGE_MAX + 1)), /600 caractères/)
  assert.throws(() => parseMessage('a'.repeat(601)), error => failure(error).status === 400)
  assert.equal(pdfSafe('Séance « test » — 25 000 FCFA €'), 'Séance « test » — 25 000 FCFA €')
})

const source = (over = {}) => ({
  input: { ...base, sessions: [{ date_heure: '2026-10-05T09:00:00.000Z', statut: 'EFFECTUEE', titre: 'Cardio' }] },
  pdf: { client: { nom: 'Sow', prenom: 'Awa', objectif: 'CARDIO', taille_cm: 170, poids_initial_kg: 70, telephone: '771234567', sexe: 'FEMME', age: 30 }, coachNom: 'Coach A', entry: null, prevEntry: null,
    sessions: [{ titre: 'Cardio', date_heure: '2026-10-05T09:00:00.000Z', statut: 'EFFECTUEE' }], payments: [] },
  telephone: '771234567', prenom: 'Awa', ...over,
})
const pageCount = buf => (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length

const fakeStorage = (over = {}) => {
  const calls = { upload: [], sign: [] }
  return { calls, storage: {
    async upload(path, body, options) { calls.upload.push({ path, size: body.byteLength, options }); return { error: over.uploadError ?? null } },
    async createSignedUrl(path, ttl) { calls.sign.push({ path, ttl }); return over.signError ? { data: null, error: over.signError } : { data: { signedUrl: 'https://stockage.test/signe/' + path + '?token=abc' }, error: null } },
  } }
}
const deps = (storage = fakeStorage().storage, byCoach = { [COACH_A]: { [CA]: source() } }) => ({
  async load(coachId, clientId) { const s = byCoach[coachId]?.[clientId]; if (!s) throw new HttpError(404, 'NOT_FOUND', 'Enregistrement introuvable.'); return s },
  storage: () => storage,
})
const req = (path, init) => new Request('https://x.test/api/v1/exports/report/' + path, init)

test('PDF : en-tête %PDF, plusieurs pages pour un mois chargé, message limité', async () => {
  const small = await renderReportPdf(source(), '2026-10', 'Bravo pour ce mois.\nA bientôt.')
  assert.equal(small.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pageCount(small) >= 1)
  const sessions = Array.from({ length: 100 }, (_, i) => ({ titre: `Séance ${i + 1} ` + 'très longue '.repeat(i % 5), date_heure: `2026-10-${pad(1 + (i % 28))}T08:00:00.000Z`, statut: ['EFFECTUEE', 'ANNULEE', 'PLANIFIEE'][i % 3] }))
  const heavy = source({ input: { ...base, sessions }, pdf: { ...source().pdf, sessions, payments: Array.from({ length: 30 }, (_, i) => ({ montant: 10000 + i, methode: 'WAVE', description: null, date_paiement: '2026-10-02', statut: 'PAYE' })) } })
  const big = await renderReportPdf(heavy, '2026-10', 'x'.repeat(600))
  assert.ok(pageCount(big) >= 3, `pages : ${pageCount(big)}`)
  const tooLong = await handleReport(req(CA + '?month=2026-10&message=' + 'a'.repeat(601)), CA, undefined, COACH_A, deps()).catch(e => failure(e))
  assert.equal(tooLong.status, 400)
  assert.match((await tooLong.json()).error.message, /600 caractères/)
})

test('PDF : données extrêmes sans exception (noms très longs, NaN, caractères exotiques)', async () => {
  const nasty = source({
    input: { ...base, client: { ...base.client, prenom: 'Æ'.repeat(200), nom: '<&>' + '\u{1F600}'.repeat(50) }, logs: [{ log_date: '2026-10-02', exercice_id: 'e1', reps: 1e9, charge_kg: 1e9 }, { log_date: '2026-10-03', exercice_id: 'inconnu', reps: 5, charge_kg: 0 }], progress: [{ mesure_date: '2026-10-02', poids_kg: 1e12 }] },
    pdf: { ...source().pdf, client: { ...source().pdf.client, prenom: 'Æ'.repeat(200), nom: '<&>' + '\u{1F600}'.repeat(50), telephone: '\u{1F600}' }, sessions: [{ titre: 'M'.repeat(500), date_heure: 'pas une date', statut: 'EFFECTUEE' }], payments: [{ montant: Number.NaN, methode: 'AUTRE', description: '\u{1F600}', date_paiement: 'x', statut: 'PAYE' }] },
  })
  const buf = await renderReportPdf(nasty, '2026-10', 'ligne\n'.repeat(80).slice(0, 600))
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-')
})

test('route rapport : données JSON, PDF, erreurs 400 et 404, isolation entre coachs', async () => {
  const d = deps()
  const data = await (await handleReport(req(CA + '/data?month=2026-10'), CA, 'data', COACH_A, d)).json()
  assert.equal(data.data.client.prenom, 'Awa')
  assert.deepEqual(Object.keys(data.data).sort(), ['client', 'coach', 'kpis', 'mensurations', 'month', 'poids', 'records', 'weeks'])
  assert.deepEqual(Object.keys(data.data.kpis).sort(), ['delta_poids', 'poids_debut', 'poids_fin', 'records', 'seances_annulees', 'seances_effectuees', 'seances_planifiees', 'series', 'taux_presence', 'volume_kg'])
  const pdf = await handleReport(req(CA + '?month=2026-10'), CA, undefined, COACH_A, d)
  assert.equal(pdf.headers.get('content-type'), 'application/pdf')
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-')
  for (const month of ['2026-13', '2026-1', 'abc', null]) {
    const url = month === null ? CA + '/data' : CA + '/data?month=' + month
    await assert.rejects(handleReport(req(url), CA, 'data', COACH_A, d), error => failure(error).status === 400)
  }
  // coach B demandant le client de A : 404, sans aucune donnée de A
  const other = await handleReport(req(CA + '/data?month=2026-10'), CA, 'data', COACH_B, d).catch(e => failure(e))
  assert.equal(other.status, 404)
  assert.doesNotMatch(await other.text(), /Awa|Sow/)
  await assert.rejects(handleReport(req(CA + '/data?month=2026-10', { method: 'POST' }), CA, 'data', COACH_A, d), error => error.statusCode === 405)
  await assert.rejects(handleReport(req(CA + '/inconnu?month=2026-10'), CA, 'inconnu', COACH_A, d), error => error.statusCode === 404)
})

test('partage de secours : faux stockage, lien signé de 24 h, chemin par coach et client', async () => {
  const fs = fakeStorage()
  const d = deps(fs.storage)
  const post = (b, d2 = d, coach = COACH_A) => handleReport(req(CA + '/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }), CA, 'share', coach, d2)
  const res = await post({ month: '2026-10', message: 'Bravo' })
  assert.equal(res.status, 200)
  const body = (await res.json()).data
  assert.equal(body.fileName, `rapport_${CA}_2026-10.pdf`)
  assert.match(body.waLink, /^https:\/\/wa\.me\/221771234567\?text=/)
  assert.match(decodeURIComponent(body.waLink), /Lien valable 24 heures/)
  assert.ok(decodeURIComponent(body.waLink).includes(`https://stockage.test/signe/${COACH_A}/${CA}/`))
  assert.equal(fs.calls.upload.length, 1)
  assert.match(fs.calls.upload[0].path, new RegExp(`^${COACH_A}/${CA}/[0-9a-f-]{36}\\.pdf$`))
  assert.deepEqual(fs.calls.upload[0].options, { contentType: 'application/pdf', upsert: false })
  assert.ok(fs.calls.upload[0].size > 1000)
  assert.equal(fs.calls.sign[0].ttl, 86400)
  await assert.rejects(post({ month: 'x' }), error => failure(error).status === 400)
  await assert.rejects(post({ month: '2026-10', message: 'a'.repeat(601) }), error => failure(error).status === 400)
  const noPhone = await post({ month: '2026-10' }, deps(undefined, { [COACH_A]: { [CA]: source({ telephone: null }) } })).catch(e => failure(e))
  assert.equal(noPhone.status, 400)
  await assert.rejects(post({ month: '2026-10' }, deps(fakeStorage({ uploadError: { message: 'secret interne' } }).storage)), error => error.statusCode === 502 && error.code === 'UPLOAD_FAILED' && !/secret/.test(error.message))
  await assert.rejects(post({ month: '2026-10' }, deps(fakeStorage({ signError: { message: 'x' } }).storage)), error => error.statusCode === 502 && error.code === 'SIGN_FAILED')
  const foreign = await post({ month: '2026-10' }, d, COACH_B).catch(e => failure(e))
  assert.equal(foreign.status, 404)
  assert.equal(fs.calls.upload.length, 1, 'aucun dépôt pour un coach étranger')
  const direct = await shareReport({ source: source({ telephone: '+221 77 123 45 67' }), buffer: new Uint8Array(3), month: '2026-10', coachId: COACH_A, clientId: CA, storage: fs.storage })
  assert.match(direct.waLink, /wa\.me\/221771234567/)
})

// Contenu décompressé des pages : permet de vérifier les couleurs réellement peintes.
const pdfContent = async buf => {
  const { inflateSync } = await import('node:zlib')
  const raw = buf.toString('latin1'), out = []
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = raw.indexOf('endstream', start)
    try { out.push(inflateSync(buf.subarray(start, end)).toString('latin1')) } catch { /* flux non compressé */ }
  }
  return out.join('\n')
}

test('PDF : thème absent ou inconnu = nuit ; corail et lagon valides et différents', async () => {
  const gen = async theme => renderReportPdf(source(), '2026-10', null, theme)
  const [none, unknown, nuit, corail, lagon] = [await renderReportPdf(source(), '2026-10', null), await gen('violet'), await gen('nuit'), await gen('corail'), await gen('lagon')]
  const [cNone, cUnknown, cNuit, cCorail, cLagon] = await Promise.all([none, unknown, nuit, corail, lagon].map(pdfContent))
  for (const b of [none, unknown, nuit, corail, lagon]) assert.equal(b.subarray(0, 5).toString(), '%PDF-')
  // nuit : bandeau noir et citron d'origine ; absent et inconnu donnent exactement le même contenu
  assert.match(cNuit, /\n0\.0392\d* 0\.0392\d* 0\.0392\d* scn/)
  assert.match(cNuit, /\n0\.7843\d* 0\.9529\d* 0\.1137\d* scn/)
  assert.equal(cNone, cNuit)
  assert.equal(cUnknown, cNuit)
  assert.notEqual(cCorail, cNuit)
  assert.notEqual(cLagon, cNuit)
  assert.notEqual(cCorail, cLagon)
  assert.match(cCorail, /\n1 0\.1215\d* 0\.4196\d* scn/)
  assert.match(cLagon, /\n0\.3725\d* 0\.78\d* 0\.82\d* scn/)
  assert.doesNotMatch(cNuit, /\n1 0\.1215\d* 0\.4196\d* scn/)
})

test('route rapport : ?theme= et champ theme du partage, valeur inconnue sans erreur', async () => {
  const d = deps()
  const getPdf = async q => Buffer.from(await (await handleReport(req(CA + '?month=2026-10' + q), CA, undefined, COACH_A, d)).arrayBuffer())
  const [plain, bad, corail] = await Promise.all([getPdf(''), getPdf('&theme=%3Cscript%3E'), getPdf('&theme=corail')])
  assert.equal(corail.subarray(0, 5).toString(), '%PDF-')
  const [cp, cb, cc] = await Promise.all([plain, bad, corail].map(pdfContent))
  assert.equal(cp, cb)
  assert.notEqual(cc, cp)
  // partage : le PDF déposé suit le thème ; thème inconnu ou non textuel = nuit, jamais 400
  const uploaded = []
  const storage = { async upload(path, body) { uploaded.push(Buffer.from(body)); return { error: null } }, async createSignedUrl(path) { return { data: { signedUrl: 'https://s.test/' + path }, error: null } } }
  const post = body => handleReport(req(CA + '/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), CA, 'share', COACH_A, deps(storage))
  for (const theme of ['corail', 'inconnu', 42, null]) assert.equal((await post({ month: '2026-10', theme })).status, 200)
  assert.equal((await post({ month: '2026-10' })).status, 200)
  const [sCorail, sUnknown, sNum, sNull, sNone] = await Promise.all(uploaded.map(pdfContent))
  assert.notEqual(sCorail, sNone)
  assert.equal(sUnknown, sNone)
  assert.equal(sNum, sNone)
  assert.equal(sNull, sNone)
})
