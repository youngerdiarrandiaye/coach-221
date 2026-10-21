import test from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'
import { buildDigestMail, hasDigestContent } from '../src/lib/weeklyDigestMail.ts'
import { DIGEST_BATCH, mondayOf, runWeeklyDigest } from '../src/services/weeklyDigestService.ts'
import { smtpConfig } from '../src/lib/smtpConfig.ts'

const week = (start, over = {}) => ({ start, end: new Date(Date.parse(start + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10), sessionsDone: 3, sessionsPlanned: 4, sets: 27, volumeKg: 5230, weightKg: 71.2, ...over })
const input = (over = {}) => ({ prenom: 'Awa', coach: 'Coach Mansour', week: week('2026-10-12'), previousWeek: week('2026-10-05', { weightKg: 72 }), upcoming: [{ titre: 'Haut du corps', date_heure: '2026-10-22T05:00:00.000Z', duree_minutes: 60 }], spaceUrl: 'https://coachsen.example.test/espace', ...over })

test('lundi de la semaine', () => {
  assert.equal(mondayOf('2026-10-19'), '2026-10-19'); assert.equal(mondayOf('2026-10-25'), '2026-10-19'); assert.equal(mondayOf('2026-10-21'), '2026-10-19'); assert.equal(mondayOf('2026-10-26'), '2026-10-26')
})

test('e-mail : objet, chiffres de la semaine, écart de poids, prochaines séances, lien vers l’espace', () => {
  const m = buildDigestMail(input())
  assert.match(m.subject, /^Votre semaine du 12 oct\. au 18 oct\. : 3 séances effectuées$/)
  // Les milliers sont séparés par une espace insécable (pas de retour à la ligne au milieu d'un nombre).
  const plain = m.html.replace(/[  ]/g, ' ') + m.text.replace(/[  ]/g, ' ')
  for (const part of ['Bonjour Awa,', 'avec Coach Mansour', '3 effectuées sur 4 prévues', '27 séries', '5 230 kg', '71,2 kg', '-0,8 kg', 'Haut du corps', 'https://coachsen.example.test/espace']) assert.ok(plain.includes(part), part)
  assert.ok(m.text.includes('Voir mon espace : https://coachsen.example.test/espace'))
  assert.match(m.html, /Désactivez-le dans votre espace/)
  assert.match(buildDigestMail(input({ week: week('2026-10-12', { sessionsDone: 0, sets: 0, weightKg: null }) })).subject, /votre résumé CoachSen/)
})

test('e-mail : tout texte venant d’un utilisateur est échappé (prénom, coach, titre de séance)', () => {
  const m = buildDigestMail(input({ prenom: '<script>alert(1)</script>', coach: 'Coach "X" & <b>', upcoming: [{ titre: '<img src=x onerror=1>', date_heure: '2026-10-22T05:00:00Z', duree_minutes: 30 }] }))
  assert.ok(!m.html.includes('<script>') && !m.html.includes('<img') && !m.html.includes('<b>'))
  assert.ok(m.html.includes('&lt;script&gt;') && m.html.includes('&amp;'))
})

test('contenu : une semaine vide sans séance à venir n’envoie rien', () => {
  const empty = week('2026-10-12', { sessionsDone: 0, sets: 0, weightKg: null })
  assert.equal(hasDigestContent({ week: empty, upcoming: [] }), false)
  assert.equal(hasDigestContent({ week: empty, upcoming: [{ titre: 'x', date_heure: '2026-10-22T05:00:00Z', duree_minutes: 60 }] }), true)
  assert.equal(hasDigestContent({ week: { ...empty, sets: 1 }, upcoming: [] }), true)
})

test('le message est réellement constructible par nodemailer (en-têtes, texte et HTML, accents)', async () => {
  const mail = buildDigestMail(input({ prenom: 'Aïssatou' }))
  const transport = nodemailer.createTransport({ jsonTransport: true })
  const sent = await transport.sendMail({ from: 'CoachSen <no-reply@example.test>', to: 'awa@example.test', subject: mail.subject, text: mail.text, html: mail.html })
  const parsed = JSON.parse(sent.message)
  assert.equal(parsed.subject, mail.subject); assert.equal(parsed.to[0].address, 'awa@example.test'); assert.ok(parsed.html.includes('Aïssatou')); assert.ok(parsed.text.includes('Aïssatou'))
})

test('configuration SMTP : complète ou rien', () => {
  assert.equal(smtpConfig({}), null)
  assert.equal(smtpConfig({ SMTP_HOST: 'smtp.example.test', SMTP_USER: 'u', SMTP_PASS: 'p' }), null)            // expéditeur manquant
  assert.equal(smtpConfig({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'CoachSen <a@b.test>', SMTP_PORT: 'abc' }), null)
  assert.deepEqual(smtpConfig({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'CoachSen <a@b.test>' }), { host: 'h', port: 587, user: 'u', pass: 'p', from: 'CoachSen <a@b.test>' })
  assert.equal(smtpConfig({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'f', SMTP_PORT: '465' }).port, 465)
})

// ---- tâche : idempotence, désactivation, échecs
function harness(over = {}) {
  const state = { sent: [], marked: new Map(), accounts: over.accounts ?? ['u1', 'u2', 'u3'], failFor: over.failFor ?? [], emails: over.emails ?? {}, data: over.data }
  const mk = id => ({ user_id: id, client_id: 'c-' + id, coach_id: 'coach' })
  return {
    state,
    deps: {
      due: async (weekStart, limit) => state.accounts.filter(id => (state.marked.get(id) ?? '') < weekStart).slice(0, limit).map(mk),
      emailOf: async id => id in state.emails ? state.emails[id] : `${id}@example.test`,
      load: async account => state.data?.[account.user_id] ?? { prenom: 'Awa', coach: 'Coach Mansour', weeks: [week('2026-10-19', { sessionsDone: 0, sets: 0, weightKg: null }), week('2026-10-12'), week('2026-10-05')], upcoming: [] },
      send: async (to, mail) => { if (state.failFor.includes(to)) throw new Error('smtp ' + to); state.sent.push({ to, subject: mail.subject }) },
      markSent: async (id, w) => { state.marked.set(id, w) },
      spaceUrl: 'https://coachsen.example.test/espace',
    },
  }
}
const MONDAY = '2026-10-19'

test('tâche : chaque client reçoit la dernière semaine terminée, une seule fois par semaine', async () => {
  const h = harness()
  const first = await runWeeklyDigest(h.deps, MONDAY)
  assert.deepEqual(first, { week: '2026-10-12', checked: 3, sent: 3, skipped: 0, failed: 0 })
  assert.deepEqual(h.state.sent.map(s => s.to), ['u1@example.test', 'u2@example.test', 'u3@example.test'])
  assert.match(h.state.sent[0].subject, /12 oct\. au 18 oct\./)
  const again = await runWeeklyDigest(h.deps, '2026-10-21')                      // relance dans la même semaine
  assert.deepEqual([again.checked, again.sent], [0, 0]); assert.equal(h.state.sent.length, 3)
  h.state.data = Object.fromEntries(['u1', 'u2', 'u3'].map(id => [id, { prenom: 'Awa', coach: null, weeks: [week('2026-10-26', { sessionsDone: 0, sets: 0, weightKg: null }), week('2026-10-19'), week('2026-10-12')], upcoming: [] }]))
  const next = await runWeeklyDigest(h.deps, '2026-10-26')                       // semaine suivante : de nouveau servis
  assert.equal(next.sent, 3)
})

test('tâche : un échec d’envoi n’est pas marqué et sera retenté, sans bloquer les autres', async () => {
  const h = harness({ failFor: ['u2@example.test'] })
  const run = await runWeeklyDigest(h.deps, MONDAY)
  assert.deepEqual([run.sent, run.failed], [2, 1]); assert.equal(h.state.marked.has('u2'), false)
  h.state.failFor = []
  const retry = await runWeeklyDigest(h.deps, MONDAY)
  assert.deepEqual([retry.checked, retry.sent], [1, 1]); assert.deepEqual(h.state.sent.at(-1), { to: 'u2@example.test', subject: h.state.sent[0].subject })
})

test('tâche : pas d’adresse ou rien à dire : marqué sans e-mail, jamais d’e-mail vide', async () => {
  const quiet = { prenom: 'Fatou', coach: null, weeks: [week('2026-10-19'), week('2026-10-12', { sessionsDone: 0, sets: 0, weightKg: null })], upcoming: [] }
  const h = harness({ emails: { u1: null }, data: { u2: quiet } })
  const run = await runWeeklyDigest(h.deps, MONDAY)
  assert.deepEqual([run.sent, run.skipped], [1, 2]); assert.deepEqual(h.state.sent.map(s => s.to), ['u3@example.test'])
  assert.equal(h.state.marked.get('u1'), MONDAY); assert.equal(h.state.marked.get('u2'), MONDAY)
})

test('tâche : traitée par lots, la suite au passage suivant', async () => {
  assert.equal(DIGEST_BATCH, 100)
  const h = harness({ accounts: Array.from({ length: 5 }, (_, i) => 'u' + (i + 1)) })
  assert.equal((await runWeeklyDigest(h.deps, MONDAY, 2)).sent, 2)
  assert.equal((await runWeeklyDigest(h.deps, MONDAY, 2)).sent, 2)
  assert.equal((await runWeeklyDigest(h.deps, MONDAY, 2)).sent, 1)
  assert.equal(h.state.sent.length, 5)
})

test('tâche : le journal ne contient aucune donnée personnelle (le résultat ne porte que des compteurs)', async () => {
  const h = harness({ failFor: ['u1@example.test'] })
  const run = await runWeeklyDigest(h.deps, MONDAY)
  assert.deepEqual(Object.keys(run).sort(), ['checked', 'failed', 'sent', 'skipped', 'week'])
})
