import test from 'node:test'
import assert from 'node:assert/strict'
import { passwordProblem } from '../src/features/auth/passwordPolicy.ts'
import { registerSchema, updatePasswordSchema } from '../src/features/auth/schemas.ts'
import { RATE_RULES } from '../src/lib/rateLimit.ts'

const base = { nom: 'Ndiaye', prenom: 'Boufit', email: 'galsen.marketing@example.test' }

test('mot de passe : longueur, mots courants, suites, répétitions et lien avec le nom ou l’e-mail', () => {
  assert.match(passwordProblem('court1'), /10 caractères/)
  assert.match(passwordProblem('x'.repeat(129)), /Maximum/)
  for (const weak of ['motdepasse123', 'Azerty1234', 'PASSWORD123', '1234567890', 'abcdefghij', '1111111111', 'abababababab', 'Sénégal2025'.replace('é', 'e')]) {
    assert.ok(passwordProblem(weak), `refusé : ${weak}`)
  }
  assert.match(passwordProblem('Boufit-2026-ok', base), /nom ou votre adresse/)
  assert.match(passwordProblem('galsenmarketing99', base), /nom ou votre adresse/)
  for (const good of ['cheval-bleu-lune-72', 'Tr0ubadour&Citron!', 'une phrase de passe longue', 'k7#Pq92xLm!w']) {
    assert.equal(passwordProblem(good, base), null, `accepté : ${good}`)
  }
})

test('inscription et changement de mot de passe appliquent la même politique', () => {
  const ok = { ...base, password: 'cheval-bleu-lune-72', confirm: 'cheval-bleu-lune-72' }
  assert.equal(registerSchema.safeParse(ok).success, true)
  for (const password of ['court', 'motdepasse123', 'Boufit-2026-ok']) {
    const r = registerSchema.safeParse({ ...base, password, confirm: password })
    assert.equal(r.success, false, password)
  }
  assert.equal(registerSchema.safeParse({ ...ok, confirm: 'autre-chose-123' }).success, false)
  assert.equal(updatePasswordSchema.safeParse({ password: 'cheval-bleu-lune-72', confirm: 'cheval-bleu-lune-72' }).success, true)
  assert.equal(updatePasswordSchema.safeParse({ password: 'azertyuiop', confirm: 'azertyuiop' }).success, false)
  assert.equal(updatePasswordSchema.safeParse({ password: '12345678', confirm: '12345678' }).success, false)
})

test('limites de tentatives : connexion par IP et par compte, plafond quotidien par compte', () => {
  assert.deepEqual({ w: RATE_RULES.login.windowSeconds, m: RATE_RULES.login.max }, { w: 600, m: 10 })
  assert.deepEqual({ w: RATE_RULES.loginDay.windowSeconds, m: RATE_RULES.loginDay.max }, { w: 86400, m: 40 })
  assert.equal(RATE_RULES.register.max, 5)
  assert.equal(RATE_RULES.reset.max, 5)
})
