import test from 'node:test'
import assert from 'node:assert/strict'
import { authRedirect, callbackDestination } from '../src/lib/authRoutes.ts'
import { isCronAuthorized } from '../src/lib/cronAuth.ts'
import { paymentSchema } from '../src/features/payments/schemas.ts'
import { recurrenceSchema } from '../src/features/sessions/schemas.ts'
import { updatePasswordSchema } from '../src/features/auth/schemas.ts'
import { dakarDateTime, isCalendarDate } from '../src/lib/validation.ts'
import { retention } from '../src/lib/statistics.ts'
import { getStartOfMonth, getEndOfMonth, getStartOfWeek } from '../src/utils/date.ts'
import { formatTime } from '../src/utils/format.ts'
import { runSessionReminders, normalizeWhatsAppPhone } from '../src/services/reminderService.ts'

test('accès : callback, confirmation et cron accessibles ; espace coach protégé', () => {
  for (const path of ['/auth/callback', '/api/cron/session-reminders', '/check-email']) assert.equal(authRedirect(path, false), null)
  for (const path of ['/dashboard', '/payments', '/update-password', '/login/other']) assert.equal(authRedirect(path, false), '/login')
  assert.equal(authRedirect('/update-password', true), null)
  assert.equal(authRedirect('/login', true), '/dashboard')
  assert.equal(callbackDestination('//attacker.example'), '/dashboard')
  assert.equal(callbackDestination('/reset-password'), '/update-password')
})

test('cron : absence de configuration et faux jetons refusés', () => {
  for (const secret of [undefined, '']) assert.equal(isCronAuthorized('Bearer ', secret), false)
  for (const header of [null, 'secret', 'Bearer secret ', 'bearer secret', 'Bearer wrong']) assert.equal(isCronAuthorized(header, 'secret'), false)
  assert.equal(isCronAuthorized('Bearer secret', 'secret'), true)
})

test('paiements : aucun montant tronqué, non fini, négatif ou hors capacité SQL', () => {
  const payment = { client_id: '11111111-1111-4111-8111-111111111111', montant: '25000', methode: 'WAVE', statut: 'PAYE', date_paiement: '2026-09-09' }
  assert.equal(paymentSchema.safeParse(payment).success, true)
  for (const montant of ['0', '-1', '1.5', '1e3', 'Infinity', 'NaN', '120abc', '10000000000']) {
    assert.equal(paymentSchema.safeParse({ ...payment, montant }).success, false, montant)
  }
  assert.equal(paymentSchema.safeParse({ ...payment, date_paiement: '2026-02-30' }).success, false)
})

test('dates : Dakar reste identique quel que soit le fuseau du processus', () => {
  const initial = process.env.TZ
  try {
    for (const tz of ['UTC', 'Africa/Lagos', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = tz
      assert.equal(dakarDateTime('2026-09-09T09:30'), '2026-09-09T09:30:00.000Z')
      assert.equal(formatTime('2026-09-09T09:30:00Z'), '09:30')
      assert.equal(getStartOfMonth(new Date('2026-03-01T00:30:00Z')).toISOString(), '2026-03-01T00:00:00.000Z')
      assert.equal(getEndOfMonth(new Date('2024-02-10T00:00:00Z')).toISOString(), '2024-02-29T23:59:59.999Z')
      assert.equal(getStartOfWeek(new Date('2026-09-13T23:30:00Z')).toISOString(), '2026-09-07T00:00:00.000Z')
    }
  } finally { if (initial === undefined) delete process.env.TZ; else process.env.TZ = initial }
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('2024-02-29'), true)
  assert.throws(() => dakarDateTime('2026-09-09T25:00'))
})

test('récurrences : jours, durée et période contrôlés avant écriture', () => {
  const series = { client_id: '11111111-1111-4111-8111-111111111111', titre: 'Cardio', duree_minutes: '60', heure: '09:00', jours: [1, 3], date_debut: '2026-09-09', date_fin: '2026-10-09' }
  assert.equal(recurrenceSchema.safeParse(series).success, true)
  for (const invalid of [{ jours: [7] }, { jours: [] }, { duree_minutes: '60abc' }, { heure: '24:00' }, { date_fin: '2026-09-08' }, { date_fin: '2099-01-01' }]) {
    assert.equal(recurrenceSchema.safeParse({ ...series, ...invalid }).success, false)
  }
})

test('nouveau mot de passe : longueur et confirmation obligatoires', () => {
  assert.equal(updatePasswordSchema.safeParse({ password: 'abcd', confirm: 'abcd' }).success, false)
  assert.equal(updatePasswordSchema.safeParse({ password: 'longpassword', confirm: 'different' }).success, false)
  assert.equal(updatePasswordSchema.safeParse({ password: 'longpassword', confirm: 'longpassword' }).success, true)
})

test('rétention : seuls les clients actifs avec séance effectuée dans les 30 jours comptent', () => {
  const clients = [{ id: 'a', actif: true }, { id: 'b', actif: true }, { id: 'archived', actif: false }]
  const sessions = [
    { client_id: 'a', date_heure: '2026-09-08T10:00:00Z', statut: 'EFFECTUEE' },
    { client_id: 'a', date_heure: '2026-09-07T10:00:00Z', statut: 'EFFECTUEE' },
    { client_id: 'b', date_heure: '2026-09-08T10:00:00Z', statut: 'ANNULEE' },
    { client_id: 'b', date_heure: '2026-10-08T10:00:00Z', statut: 'PLANIFIEE' },
    { client_id: 'archived', date_heure: '2026-09-08T10:00:00Z', statut: 'EFFECTUEE' },
  ]
  assert.deepEqual(retention(clients, sessions, new Date('2026-09-09T10:00:00Z')), { totalClients: 2, clientsActifsRecent: 1, tauxRetention: 50 })
  assert.equal(retention([], sessions).tauxRetention, 0)
})

test('WhatsApp : numéros sénégalais et internationaux normalisés sans double indicatif', () => {
  assert.equal(normalizeWhatsAppPhone('77 123 45 67'), '221771234567')
  assert.equal(normalizeWhatsAppPhone('+221 77 123 45 67'), '221771234567')
  assert.equal(normalizeWhatsAppPhone('0033 6 12 34 56 78'), '33612345678')
  assert.equal(normalizeWhatsAppPhone('abc'), null)
})

function reminderFixture() {
  const reminder = { id: 'session', date_heure: '2026-09-09T11:10:00Z', titre: 'Cardio', duree_minutes: 60, coach: { prenom: 'Coach', telephone: '771234567' }, client: null }
  const claimed = new Set()
  const completed = []
  const store = {
    async findDue(from, until) { return reminder.date_heure > from && reminder.date_heure <= until ? [reminder] : [] },
    async claim(r) { const key = r.id + r.date_heure; if (claimed.has(key)) return false; claimed.add(key); return true },
    async complete(r, delivery) { completed.push(delivery) },
  }
  return { reminder, store, completed }
}

test('rappels : séance située dans un ancien trou de planning envoyée une seule fois, même en concurrence', async () => {
  const { store } = reminderFixture()
  let sent = 0
  const send = async () => { sent++; return { status: 'sent' } }
  await runSessionReminders(store, send, new Date('2026-09-09T10:00:00Z'))
  assert.equal(sent, 0)
  await Promise.all([1, 2].map(() => runSessionReminders(store, send, new Date('2026-09-09T10:15:00Z'))))
  await runSessionReminders(store, send, new Date('2026-09-09T10:30:00Z'))
  assert.equal(sent, 1)
})

test('rappels : panne SQL empêche tout envoi ; timeout ne provoque pas de double envoi', async () => {
  const { store, completed } = reminderFixture()
  const now = new Date('2026-09-09T10:15:00Z')
  let attempts = 0
  const send = async () => { attempts++; throw new Error('timeout après acceptation éventuelle') }
  await assert.rejects(runSessionReminders({ ...store, claim: async () => { throw new Error('DB indisponible') } }, send, now))
  assert.equal(attempts, 0)
  await runSessionReminders(store, send, now)
  await runSessionReminders(store, send, now)
  assert.equal(attempts, 1)
  assert.equal(completed[0].status, 'unknown')
})
