import test from 'node:test'
import assert from 'node:assert/strict'
import { coachLabel } from '../src/lib/coachName.ts'

test('nom du coach : Coach + prénom, sans doublon', () => {
  assert.equal(coachLabel('Mansour', 'Diop'), 'Coach Mansour')
  assert.equal(coachLabel('  Boufit ', ''), 'Coach Boufit')
  assert.equal(coachLabel('Coach DO', 'X'), 'Coach DO')
  assert.equal(coachLabel('coach', 'Démo'), 'Coach Démo')
  assert.equal(coachLabel('', 'Diop'), 'Coach Diop')
  assert.equal(coachLabel(null, undefined), 'Coach')
  assert.equal(coachLabel('Mamadou   Lamine', ''), 'Coach Mamadou Lamine')
})
