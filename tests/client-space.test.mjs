import test from 'node:test'
import assert from 'node:assert/strict'
import { buildJournal, buildWeeks, weekStart } from '../src/lib/clientDigest.ts'
import { accessStatus, inviteClient, inviteMessage, revokeClient, RESEND_DELAY_SECONDS } from '../src/services/clientAccountService.ts'

// ---- synthèse hebdomadaire et journal
const today = '2026-10-21' // mercredi
const sessions = [
  { date_heure: '2026-10-19T17:00:00.000Z', statut: 'EFFECTUEE', titre: 'Cardio', duree_minutes: 60 },     // lundi de cette semaine
  { date_heure: '2026-10-22T17:00:00.000Z', statut: 'PLANIFIEE', titre: 'Jambes', duree_minutes: 45 },
  { date_heure: '2026-10-20T08:00:00.000Z', statut: 'ANNULEE', titre: 'Annulée', duree_minutes: 60 },
  { date_heure: '2026-10-12T17:00:00.000Z', statut: 'EFFECTUEE', titre: 'Haut du corps', duree_minutes: 60 }, // semaine précédente
]
const logs = [
  { log_date: '2026-10-19', exercice_id: 'e1', reps: 10, charge_kg: 40 },
  { log_date: '2026-10-19', exercice_id: 'e2', reps: 8, charge_kg: 50 },
  { log_date: '2026-10-13', exercice_id: 'e1', reps: 10, charge_kg: 30 },
]
const measures = [{ mesure_date: '2026-10-20', poids_kg: 71.2 }, { mesure_date: '2026-10-21', poids_kg: 71.0 }, { mesure_date: '2026-10-10', poids_kg: 72 }, { mesure_date: '2026-10-21', poids_kg: null }]

test('semaines : lundi comme premier jour, effectuées, prévues hors annulées, volume et poids moyen', () => {
  assert.equal(weekStart('2026-10-21'), '2026-10-19'); assert.equal(weekStart('2026-10-25'), '2026-10-19'); assert.equal(weekStart('2026-10-26'), '2026-10-26'); assert.equal(weekStart('2026-10-19'), '2026-10-19')
  const weeks = buildWeeks({ today, sessions, logs, measures, count: 3 })
  assert.deepEqual(weeks.map(w => w.start), ['2026-10-19', '2026-10-12', '2026-10-05'])
  assert.deepEqual(weeks[0], { start: '2026-10-19', end: '2026-10-25', sessionsDone: 1, sessionsPlanned: 2, sets: 2, volumeKg: 800, weightKg: 71.1 })
  assert.deepEqual(weeks[1], { start: '2026-10-12', end: '2026-10-18', sessionsDone: 1, sessionsPlanned: 1, sets: 1, volumeKg: 300, weightKg: null })
  assert.deepEqual(weeks[2], { start: '2026-10-05', end: '2026-10-11', sessionsDone: 0, sessionsPlanned: 0, sets: 0, volumeKg: 0, weightKg: 72 })
  assert.equal(buildWeeks({ today, sessions: [], logs: [], measures: [] }).length, 8)
})

test('journal : 14 derniers jours, seulement le fait (effectuée, entraînement, pesée), du plus récent au plus ancien', () => {
  const entries = buildJournal({ today, sessions, logs, measures })
  assert.deepEqual(entries.map(e => [e.date, e.kind]), [
    ['2026-10-21', 'mesure'], ['2026-10-20', 'mesure'], ['2026-10-19', 'seance'], ['2026-10-19', 'entrainement'],
    ['2026-10-13', 'entrainement'], ['2026-10-12', 'seance'], ['2026-10-10', 'mesure'],
  ].filter(([d]) => d >= '2026-10-08'))
  assert.ok(entries.find(e => e.kind === 'entrainement' && e.date === '2026-10-19').label.startsWith('2 exercices, 2 séries'))
  assert.ok(entries.find(e => e.label === 'Pesée : 71 kg'))
  assert.ok(!entries.some(e => e.label.includes('Annulée') || e.label.includes('Jambes')))
  assert.equal(buildJournal({ today, days: 1, sessions, logs, measures }).every(e => e.date === today), true)
})

// ---- invitation
function fakeDeps(over = {}) {
  const state = { accounts: new Map(), users: new Map(), sent: [], deleted: [], clock: Date.parse('2026-10-21T10:00:00Z'), ...over.state }
  return {
    state,
    deps: {
      findAccount: async clientId => state.accounts.get(clientId) ?? null,
      createUser: async input => { if (state.taken?.includes(input.email)) return { error: 'EMAIL_IN_USE' }; if (state.failCreate) return { error: 'FAILED' }; const id = 'u' + (state.users.size + 1); state.users.set(id, input); return { id } },
      deleteUser: async id => { state.deleted.push(id); state.users.delete(id); for (const [k, v] of state.accounts) if (v.user_id === id) state.accounts.delete(k) },
      insertAccount: async ({ userId, clientId }) => { if (state.failInsert) throw new Error('db'); state.accounts.set(clientId, { user_id: userId, invited_at: new Date(state.clock).toISOString(), last_invite_sent_at: new Date(state.clock).toISOString() }) },
      touchAccount: async id => { for (const v of state.accounts.values()) if (v.user_id === id) v.last_invite_sent_at = new Date(state.clock).toISOString() },
      sendLink: async email => { if (state.failSend) throw new Error('smtp'); state.sent.push(email) },
      lastSignIn: async () => state.signedIn ?? null,
      now: () => state.clock,
    },
  }
}
const client = { id: 'c1', prenom: 'Awa', nom: 'Diop', email: '  Awa.Diop@Example.TEST ' }

test('invitation : compte client créé (jamais coach), lien envoyé à l’adresse normalisée', async () => {
  const { state, deps } = fakeDeps()
  const r = await inviteClient(deps, 'coach1', 'Coach Mansour', client)
  assert.deepEqual(r, { state: 'INVITED', mailSent: true })
  assert.deepEqual(state.sent, ['awa.diop@example.test'])
  const created = [...state.users.values()][0]
  assert.deepEqual({ ...created }, { email: 'awa.diop@example.test', prenom: 'Awa', nom: 'Diop', coachLabel: 'Coach Mansour', clientId: 'c1', coachId: 'coach1' })
  assert.equal(state.accounts.get('c1').user_id, 'u1')
  assert.match(inviteMessage(r, 'awa.diop@example.test'), /envoyé à awa\.diop@example\.test/)
})

test('invitation : sans e-mail, e-mail invalide ou déjà utilisé : rien n’est créé ni envoyé', async () => {
  const none = fakeDeps(); assert.deepEqual(await inviteClient(none.deps, 'c', 'C', { ...client, email: null }), { state: 'NO_EMAIL', mailSent: false })
  assert.equal(inviteMessage({ state: 'NO_EMAIL', mailSent: false }, null), null)
  const bad = fakeDeps()
  assert.equal((await inviteClient(bad.deps, 'c', 'C', { ...client, email: 'pas-un-mail' })).state, 'INVALID_EMAIL')
  assert.equal((await inviteClient(bad.deps, 'c', 'C', { ...client, email: '   ' })).state, 'NO_EMAIL')
  assert.equal(bad.state.users.size, 0)
  const used = fakeDeps({ state: { taken: ['awa.diop@example.test'] } })
  assert.deepEqual(await inviteClient(used.deps, 'c', 'C', client), { state: 'EMAIL_IN_USE', mailSent: false })
  assert.equal(used.state.sent.length, 0); assert.equal(used.state.accounts.size, 0)
  assert.match(inviteMessage({ state: 'EMAIL_IN_USE', mailSent: false }, 'x'), /déjà un compte/)
})

test('invitation : pas de compte orphelin si le lien vers la fiche ne s’enregistre pas', async () => {
  const { state, deps } = fakeDeps({ state: { failInsert: true } })
  await assert.rejects(inviteClient(deps, 'c', 'C', client))
  assert.deepEqual(state.deleted, ['u1']); assert.equal(state.users.size, 0)
})

test('invitation : si l’e-mail ne part pas, l’accès existe et le coach peut relancer', async () => {
  const { state, deps } = fakeDeps({ state: { failSend: true } })
  assert.deepEqual(await inviteClient(deps, 'c', 'C', client), { state: 'INVITED', mailSent: false })
  assert.equal(state.accounts.size, 1)
  assert.match(inviteMessage({ state: 'INVITED', mailSent: false }, 'x'), /relancez/)
})

test('relance : refusée dans la minute, acceptée ensuite sans créer de second compte', async () => {
  const { state, deps } = fakeDeps()
  await inviteClient(deps, 'c', 'C', client)
  state.clock += 10_000
  const early = await inviteClient(deps, 'c', 'C', client)
  assert.equal(early.state, 'TOO_SOON'); assert.equal(early.retryAfter, RESEND_DELAY_SECONDS - 10); assert.equal(state.sent.length, 1)
  state.clock += RESEND_DELAY_SECONDS * 1000
  assert.deepEqual(await inviteClient(deps, 'c', 'C', client), { state: 'RESENT', mailSent: true })
  assert.equal(state.sent.length, 2); assert.equal(state.users.size, 1)
})

test('retrait d’accès et état : supprime le compte, puis plus d’accès ; actif après une première connexion', async () => {
  const { state, deps } = fakeDeps()
  assert.equal((await accessStatus(deps, 'c1')).state, 'NONE')
  assert.equal(await revokeClient(deps, 'c1'), false)
  await inviteClient(deps, 'c', 'C', client)
  assert.equal((await accessStatus(deps, 'c1')).state, 'INVITED')
  state.signedIn = '2026-10-22T08:00:00Z'
  assert.deepEqual(await accessStatus(deps, 'c1').then(s => [s.state, s.last_sign_in_at]), ['ACTIVE', '2026-10-22T08:00:00Z'])
  assert.equal(await revokeClient(deps, 'c1'), true)
  assert.deepEqual(state.deleted, ['u1']); assert.equal((await accessStatus(deps, 'c1')).state, 'NONE')
})
